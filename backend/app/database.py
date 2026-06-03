import os
import re
import time
from contextvars import ContextVar
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, sessionmaker


DB_PATH = Path(__file__).resolve().parents[1] / "material_retrieval.db"
SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DB_PATH}")

connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

_DEFAULT_SLOW_SQL_THRESHOLD_MS = 200.0
_MAX_SQL_LENGTH = 2000
_slow_query_capture: ContextVar[list[dict[str, Any]] | None] = ContextVar("slow_query_capture", default=None)
_SECRET_PATTERNS = [
    re.compile(r"(?i)(password|passwd|pwd|token|secret|api[_-]?key)\s*=\s*'[^']*'"),
    re.compile(r'(?i)(password|passwd|pwd|token|secret|api[_-]?key)\s*=\s*"[^"]*"'),
    re.compile(r"(?i)(password|passwd|pwd|token|secret|api[_-]?key)\s*=\s*[^\s,;]+"),
    re.compile(r"(?i)bearer\s+[a-z0-9._~+/=-]+"),
    re.compile(r"(?i)(postgres(?:ql)?|mysql|mariadb)://[^:\s/@]+:[^@\s]+@"),
]


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def slow_sql_threshold_ms() -> float:
    raw_value = os.environ.get("SLOW_SQL_THRESHOLD_MS", "").strip()
    if not raw_value:
        return _DEFAULT_SLOW_SQL_THRESHOLD_MS
    try:
        return max(0.0, float(raw_value))
    except ValueError:
        return _DEFAULT_SLOW_SQL_THRESHOLD_MS


def sanitize_sql_statement(statement: str) -> str:
    compact = " ".join((statement or "").split())
    for pattern in _SECRET_PATTERNS:
        compact = pattern.sub(lambda match: f"{match.group(1)}=<redacted>" if match.lastindex else "<redacted>", compact)
    if len(compact) > _MAX_SQL_LENGTH:
        compact = f"{compact[:_MAX_SQL_LENGTH]}..."
    return compact


def sql_operation(statement: str) -> str:
    sanitized = sanitize_sql_statement(statement)
    if not sanitized:
        return "UNKNOWN"
    return sanitized.split(" ", 1)[0].upper()


def start_slow_query_capture():
    return _slow_query_capture.set([])


def finish_slow_query_capture(token) -> list[dict[str, Any]]:
    observations = _slow_query_capture.get() or []
    _slow_query_capture.reset(token)
    return observations


def persist_slow_query_observations(observations: list[dict[str, Any]]) -> None:
    if not observations:
        return
    try:
        with engine.begin() as connection:
            for observation in observations:
                connection.exec_driver_sql(
                    """
                    INSERT INTO slow_query_log (timestamp, duration_ms, operation, statement)
                    VALUES (:timestamp, :duration_ms, :operation, :statement)
                    """,
                    observation,
                )
    except SQLAlchemyError:
        return


def _should_ignore_statement(statement: str) -> bool:
    normalized = (statement or "").lower()
    return "slow_query_log" in normalized


@event.listens_for(engine, "before_cursor_execute")
def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany) -> None:
    stack = conn.info.setdefault("slow_query_start_stack", [])
    stack.append(time.perf_counter())


@event.listens_for(engine, "after_cursor_execute")
def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany) -> None:
    stack = conn.info.get("slow_query_start_stack") or []
    started_at = stack.pop() if stack else None
    if started_at is None or _should_ignore_statement(statement):
        return
    duration_ms = (time.perf_counter() - started_at) * 1000.0
    if duration_ms <= slow_sql_threshold_ms():
        return
    capture = _slow_query_capture.get()
    if capture is None:
        return
    sanitized = sanitize_sql_statement(statement)
    capture.append(
        {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
            "duration_ms": round(duration_ms, 3),
            "operation": sql_operation(sanitized),
            "statement": sanitized,
        }
    )
