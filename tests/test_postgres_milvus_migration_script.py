from __future__ import annotations

import json
import math
import sqlite3
from pathlib import Path

import pytest

from backend.scripts.migrate_sqlite_to_postgres_milvus import (
    CONFIRMATION,
    MigrationError,
    _milvus_records,
    build_plan,
    category_embedding,
    load_migration_data,
    main,
    prepare_postgres,
    require_confirmation,
)


def create_synthetic_sqlite(path: Path) -> None:
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE category_libraries (
            id INTEGER PRIMARY KEY,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            enabled BOOLEAN NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE categories (
            id INTEGER PRIMARY KEY,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            category_library_id INTEGER,
            parent_category_id INTEGER,
            description TEXT NOT NULL,
            enabled BOOLEAN NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE category_attributes (
            id INTEGER PRIMARY KEY,
            category_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            display_name_zh TEXT NOT NULL,
            display_name_en TEXT NOT NULL,
            attr_type TEXT NOT NULL,
            options TEXT NOT NULL,
            required BOOLEAN NOT NULL,
            allow_empty BOOLEAN NOT NULL,
            default_value TEXT,
            sort_order INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )
    timestamp = "2026-01-01T00:00:00+00:00"
    connection.execute(
        "INSERT INTO category_libraries VALUES (?, ?, ?, ?, ?, ?, ?)",
        (445, "CLIB-445", "标准类目", "", 1, timestamp, timestamp),
    )
    connection.executemany(
        "INSERT INTO categories VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            (1, "ROOT", "设备", 445, None, "", 1, timestamp, timestamp),
            (2, "CHILD", "打印机", 445, 1, "", 1, timestamp, timestamp),
            (3, "ORPHAN", "孤立类目", 445, 999, "", 1, timestamp, timestamp),
        ),
    )
    connection.execute(
        "INSERT INTO category_attributes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (10, 2, "color", "颜色", "Color", "string", "[]", 0, 1, None, 1, timestamp, timestamp),
    )
    connection.commit()
    connection.close()


def test_fail_policy_rejects_missing_parent(tmp_path: Path) -> None:
    source = tmp_path / "source.db"
    create_synthetic_sqlite(source)

    with pytest.raises(MigrationError, match="outside the migration set"):
        load_migration_data(source, [445], "fail")


def test_detach_plan_is_deterministic_and_preserves_counts(tmp_path: Path) -> None:
    source = tmp_path / "source.db"
    create_synthetic_sqlite(source)

    first = build_plan(source, [445], "detach")
    second = build_plan(source, [445, 445], "detach")
    data = load_migration_data(source, [445], "detach")

    assert first == second
    assert first["counts"] == {
        "category_libraries": 1,
        "categories": 3,
        "category_attributes": 1,
        "detached_parents": 1,
    }
    assert first["detached_parent_category_ids"] == [3]
    assert next(row for row in data.categories if row["id"] == 3)["parent_category_id"] is None


def test_plan_command_writes_human_reviewable_json(tmp_path: Path) -> None:
    source = tmp_path / "source.db"
    output = tmp_path / "approved-plan.json"
    create_synthetic_sqlite(source)

    result = main(
        [
            "plan",
            "--sqlite",
            str(source),
            "--library-id",
            "445",
            "--orphan-parent-policy",
            "detach",
            "--output",
            str(output),
        ]
    )

    assert result == 0
    report = json.loads(output.read_text(encoding="utf-8"))
    assert report["selection"]["library_ids"] == [445]
    assert report["source"]["sha256"]


def test_write_commands_require_exact_confirmation() -> None:
    with pytest.raises(MigrationError, match="human operator"):
        require_confirmation(None)
    with pytest.raises(MigrationError):
        require_confirmation("yes")
    require_confirmation(CONFIRMATION)


def test_write_command_stops_before_connecting_without_confirmation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    called = False

    def unexpected_prepare(*args: object, **kwargs: object) -> None:
        nonlocal called
        called = True

    monkeypatch.setattr(
        "backend.scripts.migrate_sqlite_to_postgres_milvus.prepare_postgres",
        unexpected_prepare,
    )
    result = main(
        [
            "prepare-postgres",
            "--postgres-url",
            "postgresql://operator@example:15432/aios",
        ]
    )
    assert result == 2
    assert called is False


def test_prepare_postgres_executes_aios_before_business_schema(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    statements: list[str] = []
    aios_sql = tmp_path / "aios.sql"
    schema_sql = tmp_path / "schema.sql"
    aios_sql.write_text("CREATE TABLE AIOS_MARKER(id bigint);", encoding="utf-8")
    schema_sql.write_text("CREATE TABLE BUSINESS_MARKER(id bigint);", encoding="utf-8")

    class Result:
        def fetchone(self) -> tuple[str]:
            return ("170000",)

    class Connection:
        def __enter__(self) -> "Connection":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def execute(self, statement: str) -> Result:
            statements.append(statement)
            return Result()

    monkeypatch.setattr(
        "backend.scripts.migrate_sqlite_to_postgres_milvus._connect_postgres",
        lambda *args, **kwargs: Connection(),
    )

    prepare_postgres("postgresql://operator@example:15432/aios", aios_sql, schema_sql)

    assert statements == [
        "SHOW server_version_num",
        "CREATE TABLE AIOS_MARKER(id bigint);",
        "CREATE TABLE BUSINESS_MARKER(id bigint);",
    ]


def test_embedding_and_milvus_records_are_deterministic() -> None:
    vector = category_embedding("ROOT 设备")
    assert len(vector) == 64
    assert math.isclose(math.sqrt(sum(value * value for value in vector)), 1.0, abs_tol=1e-5)
    assert vector == category_embedding("ROOT 设备")

    records = _milvus_records(
        [
            {
                "id": 1,
                "code": "ROOT",
                "name": "设备",
                "category_library_id": 445,
                "parent_category_id": None,
                "updated_at": "2026-01-01T00:00:00+00:00",
            },
            {
                "id": 2,
                "code": "CHILD",
                "name": "打印机",
                "category_library_id": 445,
                "parent_category_id": 1,
                "updated_at": "2026-01-01T00:00:00+00:00",
            },
        ]
    )
    assert records[1]["path_string"] == "设备 / 打印机"
    assert records[1]["level1"] == "设备"
    assert records[1]["level2"] == "打印机"
    assert len(records[1]["embedding"]) == 64
