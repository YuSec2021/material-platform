#!/usr/bin/env python3
"""Operator-controlled SQLite -> PostgreSQL -> Milvus category migration.

The script never writes unless an explicit write subcommand and the fixed
confirmation phrase are both supplied. Run ``plan`` first and have a human
approve the generated report. Milvus is rebuilt from PostgreSQL; Qdrant data
is intentionally ignored.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

CONFIRMATION = "I_UNDERSTAND_THIS_WRITES_DATA"
MIN_POSTGRES_VERSION = 170000
DEFAULT_MILVUS_URI = "http://192.168.100.100:19530"
DEFAULT_COLLECTION = "category_vectors"
EMBEDDING_DIMENSION = 64

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_AIOS_SQL = ROOT / "backend" / "db" / "create_aios_table.sql"
DEFAULT_SCHEMA_SQL = ROOT / "backend" / "db" / "postgresql_schema.sql"


class MigrationError(RuntimeError):
    """An expected validation or safety failure."""


@dataclass(frozen=True)
class MigrationData:
    libraries: tuple[dict[str, Any], ...]
    categories: tuple[dict[str, Any], ...]
    attributes: tuple[dict[str, Any], ...]
    detached_parent_ids: tuple[int, ...]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def open_sqlite_read_only(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        raise MigrationError(f"SQLite source does not exist: {path}")
    connection = sqlite3.connect(f"file:{path.resolve()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only = ON")
    return connection


def _rows(connection: sqlite3.Connection, sql: str, params: Sequence[Any]) -> tuple[dict[str, Any], ...]:
    return tuple(dict(row) for row in connection.execute(sql, params).fetchall())


def _in_clause(values: Sequence[int]) -> tuple[str, tuple[int, ...]]:
    if not values:
        raise MigrationError("At least one --library-id is required")
    unique = tuple(sorted(set(values)))
    return ",".join("?" for _ in unique), unique


def _find_cycles(categories: Sequence[dict[str, Any]]) -> list[list[int]]:
    parents = {
        int(row["id"]): int(row["parent_category_id"])
        for row in categories
        if row["parent_category_id"] is not None
    }
    category_ids = {int(row["id"]) for row in categories}
    cycles: list[list[int]] = []
    seen_cycles: set[tuple[int, ...]] = set()
    for start in sorted(category_ids):
        path: list[int] = []
        offsets: dict[int, int] = {}
        current: int | None = start
        while current is not None and current in category_ids:
            if current in offsets:
                cycle = path[offsets[current] :]
                canonical = min(tuple(cycle[index:] + cycle[:index]) for index in range(len(cycle)))
                if canonical not in seen_cycles:
                    seen_cycles.add(canonical)
                    cycles.append(list(canonical))
                break
            offsets[current] = len(path)
            path.append(current)
            current = parents.get(current)
    return cycles


def load_migration_data(
    sqlite_path: Path,
    library_ids: Sequence[int],
    orphan_parent_policy: str,
) -> MigrationData:
    placeholders, selected_ids = _in_clause(library_ids)
    with open_sqlite_read_only(sqlite_path) as connection:
        libraries = _rows(
            connection,
            f"SELECT id, code, name, description, enabled, created_at, updated_at "
            f"FROM category_libraries WHERE id IN ({placeholders}) ORDER BY id",
            selected_ids,
        )
        found_ids = {int(row["id"]) for row in libraries}
        missing_libraries = sorted(set(selected_ids) - found_ids)
        if missing_libraries:
            raise MigrationError(f"Unknown category library IDs: {missing_libraries}")
        categories = list(
            _rows(
                connection,
                f"SELECT id, code, name, category_library_id, parent_category_id, "
                f"description, enabled, created_at, updated_at FROM categories "
                f"WHERE category_library_id IN ({placeholders}) ORDER BY id",
                selected_ids,
            )
        )
        category_ids = {int(row["id"]) for row in categories}
        attributes: tuple[dict[str, Any], ...]
        if category_ids:
            category_placeholders = ",".join("?" for _ in category_ids)
            attributes = _rows(
                connection,
                f"SELECT id, category_id, name, display_name_zh, display_name_en, "
                f"attr_type, options, required, allow_empty, default_value, sort_order, "
                f"created_at, updated_at FROM category_attributes "
                f"WHERE category_id IN ({category_placeholders}) ORDER BY id",
                tuple(sorted(category_ids)),
            )
        else:
            attributes = ()

    duplicate_codes: dict[str, list[int]] = {}
    for category in categories:
        duplicate_codes.setdefault(str(category["code"]), []).append(int(category["id"]))
    duplicate_codes = {code: ids for code, ids in duplicate_codes.items() if len(ids) > 1}
    if duplicate_codes:
        raise MigrationError(f"Duplicate category codes: {duplicate_codes}")

    missing_parents = sorted(
        int(row["id"])
        for row in categories
        if row["parent_category_id"] is not None and int(row["parent_category_id"]) not in category_ids
    )
    if missing_parents and orphan_parent_policy == "fail":
        raise MigrationError(
            f"{len(missing_parents)} categories reference parents outside the migration set; "
            "approve --orphan-parent-policy detach or repair the source"
        )
    if orphan_parent_policy == "detach":
        for row in categories:
            if int(row["id"]) in missing_parents:
                row["parent_category_id"] = None

    cycles = _find_cycles(categories)
    if cycles:
        raise MigrationError(f"Category parent cycles detected: {cycles[:10]}")

    return MigrationData(
        libraries=tuple(libraries),
        categories=tuple(categories),
        attributes=attributes,
        detached_parent_ids=tuple(missing_parents),
    )


def migration_key(source_fingerprint: str, library_ids: Sequence[int], policy: str) -> str:
    selection = ",".join(str(value) for value in sorted(set(library_ids)))
    seed = f"{source_fingerprint}:{selection}:{policy}"
    return f"sqlite-category-{hashlib.sha256(seed.encode()).hexdigest()[:32]}"


def build_plan(sqlite_path: Path, library_ids: Sequence[int], orphan_parent_policy: str) -> dict[str, Any]:
    fingerprint_before = sha256_file(sqlite_path)
    data = load_migration_data(sqlite_path, library_ids, orphan_parent_policy)
    fingerprint = sha256_file(sqlite_path)
    if fingerprint != fingerprint_before:
        raise MigrationError("SQLite source changed while the read-only plan was being built")
    selected_ids = sorted(int(row["id"]) for row in data.libraries)
    return {
        "format_version": 1,
        "migration_key": migration_key(fingerprint, selected_ids, orphan_parent_policy),
        "source": {
            "kind": "sqlite",
            "path": str(sqlite_path.resolve()),
            "sha256": fingerprint,
        },
        "target": {
            "postgresql_minimum_version": 17,
            "milvus_collection": DEFAULT_COLLECTION,
            "embedding_dimension": EMBEDDING_DIMENSION,
        },
        "selection": {
            "library_ids": selected_ids,
            "orphan_parent_policy": orphan_parent_policy,
        },
        "counts": {
            "category_libraries": len(data.libraries),
            "categories": len(data.categories),
            "category_attributes": len(data.attributes),
            "detached_parents": len(data.detached_parent_ids),
        },
        "detached_parent_category_ids": list(data.detached_parent_ids),
    }


def write_plan(plan: dict[str, Any], output: Path | None) -> None:
    payload = json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if output is None:
        sys.stdout.write(payload)
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(payload, encoding="utf-8")
    print(f"Wrote read-only migration plan: {output}")


def require_confirmation(value: str | None) -> None:
    if value != CONFIRMATION:
        raise MigrationError(
            f"Write command refused. A human operator must pass --confirm {CONFIRMATION}"
        )


def _connect_postgres(url: str, *, autocommit: bool = False):
    if not url.startswith(("postgresql://", "postgres://")):
        raise MigrationError(
            "--postgres-url must be a libpq URL such as "
            "postgresql://user:password@host:15432/database"
        )
    try:
        import psycopg
    except ImportError as exc:
        raise MigrationError("Install backend requirements before using PostgreSQL commands") from exc
    return psycopg.connect(url, autocommit=autocommit)


def assert_postgres_17(connection: Any) -> None:
    version = int(connection.execute("SHOW server_version_num").fetchone()[0])
    if version < MIN_POSTGRES_VERSION:
        raise MigrationError(f"PostgreSQL 17+ required; server_version_num is {version}")


def create_aios_first(connection: Any, aios_sql_path: Path) -> None:
    if not aios_sql_path.is_file():
        raise MigrationError(f"AIOS DDL does not exist: {aios_sql_path}")
    connection.execute(aios_sql_path.read_text(encoding="utf-8"))


def prepare_postgres(postgres_url: str, aios_sql_path: Path, schema_sql_path: Path) -> None:
    if not schema_sql_path.is_file():
        raise MigrationError(f"PostgreSQL schema DDL does not exist: {schema_sql_path}")
    with _connect_postgres(postgres_url, autocommit=True) as connection:
        assert_postgres_17(connection)
        # Deliberately committed before any business schema statement.
        create_aios_first(connection, aios_sql_path)
        connection.execute(schema_sql_path.read_text(encoding="utf-8"))
    print("PostgreSQL 17+ schema prepared; public.aios was created first")


def _approved_plan(path: Path) -> dict[str, Any]:
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MigrationError(f"Cannot read approved plan {path}: {exc}") from exc
    if report.get("format_version") != 1:
        raise MigrationError("Unsupported approved plan format")
    return report


def _assert_plan_unchanged(approved: dict[str, Any], current: dict[str, Any]) -> None:
    if approved != current:
        raise MigrationError(
            "Source or selection changed after plan approval; generate and approve a new plan"
        )


def _values(row: dict[str, Any], columns: Sequence[str]) -> tuple[Any, ...]:
    return tuple(row[column] for column in columns)


LIBRARY_COLUMNS = ("id", "code", "name", "description", "enabled", "created_at", "updated_at")
CATEGORY_COLUMNS = (
    "id",
    "code",
    "name",
    "category_library_id",
    "parent_category_id",
    "description",
    "enabled",
    "created_at",
    "updated_at",
)
ATTRIBUTE_COLUMNS = (
    "id",
    "category_id",
    "name",
    "display_name_zh",
    "display_name_en",
    "attr_type",
    "options",
    "required",
    "allow_empty",
    "default_value",
    "sort_order",
    "created_at",
    "updated_at",
)


def _insert_sql(table: str, columns: Sequence[str]) -> str:
    names = ", ".join(columns)
    placeholders = ", ".join("%s" for _ in columns)
    return f"INSERT INTO {table} ({names}) VALUES ({placeholders})"


def _assert_target_available(connection: Any, data: MigrationData) -> None:
    checks = (
        ("category_libraries", [int(row["id"]) for row in data.libraries]),
        ("categories", [int(row["id"]) for row in data.categories]),
        ("category_attributes", [int(row["id"]) for row in data.attributes]),
    )
    for table, ids in checks:
        if not ids:
            continue
        count = connection.execute(
            f"SELECT count(*) FROM {table} WHERE id = ANY(%s)", (ids,)
        ).fetchone()[0]
        if count:
            raise MigrationError(f"Target {table} already contains {count} selected IDs")
    codes = [str(row["code"]) for row in data.categories]
    if codes:
        count = connection.execute(
            "SELECT count(*) FROM categories WHERE code = ANY(%s)", (codes,)
        ).fetchone()[0]
        if count:
            raise MigrationError(f"Target categories already contains {count} selected codes")
    library_codes = [str(row["code"]) for row in data.libraries]
    library_names = [str(row["name"]) for row in data.libraries]
    count = connection.execute(
        "SELECT count(*) FROM category_libraries WHERE code = ANY(%s) OR name = ANY(%s)",
        (library_codes, library_names),
    ).fetchone()[0]
    if count:
        raise MigrationError(
            f"Target category_libraries already contains {count} selected codes or names"
        )


def _reset_sequence(connection: Any, table: str) -> None:
    connection.execute(
        f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
        f"COALESCE((SELECT MAX(id) FROM {table}), 1), "
        f"(SELECT EXISTS (SELECT 1 FROM {table})))"
    )


def migrate_postgres(
    postgres_url: str,
    sqlite_path: Path,
    approved_plan_path: Path,
    aios_sql_path: Path,
) -> None:
    approved = _approved_plan(approved_plan_path)
    selection = approved["selection"]
    library_ids = [int(value) for value in selection["library_ids"]]
    policy = str(selection["orphan_parent_policy"])
    current = build_plan(sqlite_path, library_ids, policy)
    _assert_plan_unchanged(approved, current)
    data = load_migration_data(sqlite_path, library_ids, policy)

    with _connect_postgres(postgres_url) as connection:
        assert_postgres_17(connection)
        create_aios_first(connection, aios_sql_path)
        connection.commit()
        with connection.transaction():
            existing = connection.execute(
                "SELECT status FROM public.aios WHERE migration_key = %s",
                (current["migration_key"],),
            ).fetchone()
            if existing:
                raise MigrationError(
                    f"Migration {current['migration_key']} is already registered with status {existing[0]}"
                )
            _assert_target_available(connection, data)
            connection.execute(
                "INSERT INTO public.aios "
                "(migration_key, migration_type, source_system, source_fingerprint, "
                "library_ids, orphan_parent_policy, status, details) "
                "VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s::jsonb)",
                (
                    current["migration_key"],
                    "sqlite_categories_to_postgresql",
                    "sqlite",
                    current["source"]["sha256"],
                    json.dumps(library_ids),
                    policy,
                    "postgres_writing",
                    json.dumps(current, ensure_ascii=False),
                ),
            )
            library_rows = []
            for row in data.libraries:
                values = list(_values(row, LIBRARY_COLUMNS))
                values[4] = bool(values[4])
                values.insert(5, False)
                library_rows.append(tuple(values))
            connection.cursor().executemany(
                _insert_sql(
                    "category_libraries",
                    (*LIBRARY_COLUMNS[:5], "vector_index_enabled", *LIBRARY_COLUMNS[5:]),
                ),
                library_rows,
            )
            first_pass = []
            for row in data.categories:
                values = list(_values(row, CATEGORY_COLUMNS))
                values[4] = None
                values[6] = bool(values[6])
                first_pass.append(tuple(values))
            connection.cursor().executemany(
                _insert_sql("categories", CATEGORY_COLUMNS), first_pass
            )
            parent_updates = [
                (row["parent_category_id"], row["id"])
                for row in data.categories
                if row["parent_category_id"] is not None
            ]
            if parent_updates:
                connection.cursor().executemany(
                    "UPDATE categories SET parent_category_id = %s WHERE id = %s",
                    parent_updates,
                )
            if data.attributes:
                connection.cursor().executemany(
                    _insert_sql("category_attributes", ATTRIBUTE_COLUMNS),
                    [
                        (
                            *_values(row, ATTRIBUTE_COLUMNS)[:7],
                            bool(row["required"]),
                            bool(row["allow_empty"]),
                            *_values(row, ATTRIBUTE_COLUMNS)[9:],
                        )
                        for row in data.attributes
                    ],
                )
            for table in ("category_libraries", "categories", "category_attributes"):
                _reset_sequence(connection, table)
            connection.execute(
                "UPDATE public.aios SET status = 'postgres_completed', "
                "updated_at = now() WHERE migration_key = %s",
                (current["migration_key"],),
            )
    print(
        f"PostgreSQL migration completed: {len(data.libraries)} libraries, "
        f"{len(data.categories)} categories, {len(data.attributes)} attributes"
    )


def category_embedding(text: str, dimension: int = EMBEDDING_DIMENSION) -> list[float]:
    tokens = re.findall(r"[a-z0-9]+|[\u4e00-\u9fff]", text.lower())
    if not tokens:
        tokens = [text.lower().strip() or "empty"]
    features = tokens[:]
    features.extend("".join(tokens[index : index + 2]) for index in range(max(0, len(tokens) - 1)))
    features.extend("".join(tokens[index : index + 3]) for index in range(max(0, len(tokens) - 2)))
    vector = [0.0] * dimension
    for feature in features:
        digest = hashlib.sha256(feature.encode("utf-8")).digest()
        slot = int.from_bytes(digest[:4], "big") % dimension
        vector[slot] += 1.0 if digest[4] % 2 == 0 else -1.0
    norm = math.sqrt(sum(value * value for value in vector))
    return [0.0] * dimension if norm == 0 else [round(value / norm, 6) for value in vector]


def _milvus_records(rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {int(row["id"]): row for row in rows}
    cache: dict[int, list[str]] = {}

    def path_for(category_id: int, active: set[int] | None = None) -> list[str]:
        if category_id in cache:
            return cache[category_id]
        active = set() if active is None else active
        if category_id in active:
            raise MigrationError(f"PostgreSQL category cycle at ID {category_id}")
        active.add(category_id)
        row = by_id[category_id]
        parent_id = row["parent_category_id"]
        if parent_id is None:
            path = [str(row["name"])]
        elif int(parent_id) not in by_id:
            raise MigrationError(f"PostgreSQL category {category_id} has missing parent {parent_id}")
        else:
            path = path_for(int(parent_id), active) + [str(row["name"])]
        active.remove(category_id)
        cache[category_id] = path
        return path

    records: list[dict[str, Any]] = []
    for row in rows:
        category_id = int(row["id"])
        path = path_for(category_id)
        levels = (path + [""] * 5)[:5]
        path_string = " / ".join(path)
        embedding_text = f"{row['code']} {row['name']} {path_string}"
        records.append(
            {
                "category_id": category_id,
                "category_library_id": int(row["category_library_id"]),
                "embedding": category_embedding(embedding_text),
                "code": str(row["code"]),
                "level1": levels[0],
                "level2": levels[1],
                "level3": levels[2],
                "level4": levels[3],
                "level5": levels[4],
                "path_string": path_string,
                "source_updated_at": str(row["updated_at"]),
            }
        )
    return records


def _chunks(values: Sequence[dict[str, Any]], size: int) -> Iterable[Sequence[dict[str, Any]]]:
    for offset in range(0, len(values), size):
        yield values[offset : offset + size]


def rebuild_milvus(
    postgres_url: str,
    migration_key_value: str,
    milvus_uri: str,
    token: str,
    database: str,
    collection: str,
    batch_size: int,
) -> None:
    try:
        from pymilvus import DataType, MilvusClient
    except ImportError as exc:
        raise MigrationError("Install backend requirements before using Milvus commands") from exc

    with _connect_postgres(postgres_url) as connection:
        assert_postgres_17(connection)
        registry = connection.execute(
            "SELECT library_ids, status FROM public.aios WHERE migration_key = %s",
            (migration_key_value,),
        ).fetchone()
        if not registry:
            raise MigrationError(f"Unknown AIOS migration key: {migration_key_value}")
        if registry[1] != "postgres_completed":
            raise MigrationError(f"PostgreSQL migration status must be postgres_completed, got {registry[1]}")
        library_ids = [int(value) for value in registry[0]]
        query_rows = connection.execute(
            "SELECT id, code, name, category_library_id, parent_category_id, updated_at "
            "FROM categories WHERE category_library_id = ANY(%s) ORDER BY id",
            (library_ids,),
        ).fetchall()
        columns = ("id", "code", "name", "category_library_id", "parent_category_id", "updated_at")
        rows = [dict(zip(columns, row)) for row in query_rows]
        records = _milvus_records(rows)

    bootstrap_client = MilvusClient(uri=milvus_uri, token=token or None)
    if database not in bootstrap_client.list_databases():
        bootstrap_client.create_database(db_name=database)
    bootstrap_client.close()
    client = MilvusClient(uri=milvus_uri, token=token or None, db_name=database)
    if client.has_collection(collection_name=collection):
        raise MigrationError(
            f"Milvus collection {collection!r} already exists; this script will not drop or overwrite it"
        )
    schema = MilvusClient.create_schema(auto_id=False, enable_dynamic_field=False)
    schema.add_field(field_name="category_id", datatype=DataType.INT64, is_primary=True)
    schema.add_field(field_name="category_library_id", datatype=DataType.INT64)
    schema.add_field(
        field_name="embedding", datatype=DataType.FLOAT_VECTOR, dim=EMBEDDING_DIMENSION
    )
    for field, max_length in (
        ("code", 64),
        ("level1", 512),
        ("level2", 512),
        ("level3", 512),
        ("level4", 512),
        ("level5", 512),
        ("path_string", 4096),
        ("source_updated_at", 80),
    ):
        schema.add_field(
            field_name=field, datatype=DataType.VARCHAR, max_length=max_length
        )
    index_params = client.prepare_index_params()
    index_params.add_index(
        field_name="embedding",
        index_type="HNSW",
        metric_type="COSINE",
        params={"M": 16, "efConstruction": 200},
    )
    client.create_collection(
        collection_name=collection,
        schema=schema,
        index_params=index_params,
    )
    for batch in _chunks(records, batch_size):
        client.insert(collection_name=collection, data=list(batch))
    client.flush(collection_name=collection)
    client.close()

    with _connect_postgres(postgres_url) as connection:
        with connection.transaction():
            connection.execute(
                "UPDATE public.aios SET status = 'completed', milvus_collection = %s, "
                "updated_at = now(), completed_at = now() WHERE migration_key = %s",
                (collection, migration_key_value),
            )
    print(f"Milvus rebuild completed: {len(records)} entities in {collection}")


def verify_postgres(postgres_url: str, migration_key_value: str) -> None:
    with _connect_postgres(postgres_url) as connection:
        assert_postgres_17(connection)
        row = connection.execute(
            "SELECT library_ids, status, milvus_collection FROM public.aios "
            "WHERE migration_key = %s",
            (migration_key_value,),
        ).fetchone()
        if not row:
            raise MigrationError(f"Unknown AIOS migration key: {migration_key_value}")
        library_ids = [int(value) for value in row[0]]
        counts = {
            "category_libraries": connection.execute(
                "SELECT count(*) FROM category_libraries WHERE id = ANY(%s)", (library_ids,)
            ).fetchone()[0],
            "categories": connection.execute(
                "SELECT count(*) FROM categories WHERE category_library_id = ANY(%s)", (library_ids,)
            ).fetchone()[0],
            "category_attributes": connection.execute(
                "SELECT count(*) FROM category_attributes a JOIN categories c ON c.id = a.category_id "
                "WHERE c.category_library_id = ANY(%s)",
                (library_ids,),
            ).fetchone()[0],
        }
        print(
            json.dumps(
                {
                    "migration_key": migration_key_value,
                    "status": row[1],
                    "milvus_collection": row[2],
                    "counts": counts,
                },
                ensure_ascii=False,
                indent=2,
            )
        )


def _add_confirmation(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--confirm", help=f"required exact phrase: {CONFIRMATION}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Human-operated category migration; write commands are confirmation-gated"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan_parser = subparsers.add_parser("plan", help="read-only SQLite validation and report")
    plan_parser.add_argument("--sqlite", type=Path, required=True)
    plan_parser.add_argument("--library-id", type=int, action="append", required=True)
    plan_parser.add_argument(
        "--orphan-parent-policy", choices=("fail", "detach"), default="fail"
    )
    plan_parser.add_argument("--output", type=Path)

    prepare_parser = subparsers.add_parser(
        "prepare-postgres", help="create public.aios first, then the PostgreSQL schema"
    )
    prepare_parser.add_argument("--postgres-url", required=True)
    prepare_parser.add_argument("--aios-sql", type=Path, default=DEFAULT_AIOS_SQL)
    prepare_parser.add_argument("--schema-sql", type=Path, default=DEFAULT_SCHEMA_SQL)
    _add_confirmation(prepare_parser)

    migrate_parser = subparsers.add_parser(
        "migrate-postgres", help="copy an approved category selection to PostgreSQL"
    )
    migrate_parser.add_argument("--sqlite", type=Path, required=True)
    migrate_parser.add_argument("--postgres-url", required=True)
    migrate_parser.add_argument("--approved-plan", type=Path, required=True)
    migrate_parser.add_argument("--aios-sql", type=Path, default=DEFAULT_AIOS_SQL)
    _add_confirmation(migrate_parser)

    milvus_parser = subparsers.add_parser(
        "rebuild-milvus", help="build a new Milvus collection from PostgreSQL"
    )
    milvus_parser.add_argument("--postgres-url", required=True)
    milvus_parser.add_argument("--migration-key", required=True)
    milvus_parser.add_argument("--milvus-uri", default=DEFAULT_MILVUS_URI)
    milvus_parser.add_argument("--milvus-token", default="")
    milvus_parser.add_argument("--milvus-database", default="material_retrieval")
    milvus_parser.add_argument("--collection", default=DEFAULT_COLLECTION)
    milvus_parser.add_argument("--batch-size", type=int, default=500)
    _add_confirmation(milvus_parser)

    verify_parser = subparsers.add_parser(
        "verify-postgres", help="read-only PostgreSQL registry and count verification"
    )
    verify_parser.add_argument("--postgres-url", required=True)
    verify_parser.add_argument("--migration-key", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "plan":
            write_plan(
                build_plan(args.sqlite, args.library_id, args.orphan_parent_policy),
                args.output,
            )
        elif args.command == "prepare-postgres":
            require_confirmation(args.confirm)
            prepare_postgres(args.postgres_url, args.aios_sql, args.schema_sql)
        elif args.command == "migrate-postgres":
            require_confirmation(args.confirm)
            migrate_postgres(
                args.postgres_url, args.sqlite, args.approved_plan, args.aios_sql
            )
        elif args.command == "rebuild-milvus":
            require_confirmation(args.confirm)
            if args.batch_size < 1:
                raise MigrationError("--batch-size must be positive")
            rebuild_milvus(
                args.postgres_url,
                args.migration_key,
                args.milvus_uri,
                args.milvus_token,
                args.milvus_database,
                args.collection,
                args.batch_size,
            )
        elif args.command == "verify-postgres":
            verify_postgres(args.postgres_url, args.migration_key)
        return 0
    except MigrationError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
