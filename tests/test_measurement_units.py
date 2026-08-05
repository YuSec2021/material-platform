from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.sql.elements import TextClause
from sqlalchemy.orm import Session

import backend.app.main as main_module
from backend.app.database import Base
from backend.app.main import (
    AuthContext,
    create_product_name,
    create_measurement_unit,
    delete_measurement_unit,
    list_measurement_units,
    update_measurement_unit,
)
from backend.app.schemas import MeasurementUnitIn, MeasurementUnitUpdate, ProductNameIn


@pytest.fixture()
def db() -> Iterator[Session]:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.fixture()
def admin() -> AuthContext:
    return AuthContext(
        user=None,
        username="synthetic-admin",
        display_name="Synthetic Admin",
        permissions=set(),
        library_scope_ids=None,
        role_ids=set(),
        is_super_admin=True,
    )


def create_kg(db: Session, admin: AuthContext):
    return create_measurement_unit(
        MeasurementUnitIn(
            name="千克",
            symbol="kg",
            unit_type="mass",
            decimal_places=3,
        ),
        db,
        admin,
    )


def test_measurement_unit_crud_normalizes_code_and_reports_usage(
    db: Session, admin: AuthContext
) -> None:
    created = create_kg(db, admin)
    assert created.code.startswith("UNIT-")
    assert created.usage_count == 0

    updated = update_measurement_unit(
        created.id,
        MeasurementUnitUpdate(name="公斤", symbol="kg", enabled=True),
        db,
        admin,
    )
    assert updated.name == "公斤"

    listed = list_measurement_units("", "mass", True, db, admin)
    assert [unit.id for unit in listed] == [created.id]

    product = create_product_name(
        ProductNameIn(
            name="合成测试品名",
            unit_id=created.id,
            category="测试",
        ),
        db,
        admin,
    )
    assert product.unit_id == created.id
    assert product.unit == "kg"
    assert product.measurement_unit is not None
    assert product.measurement_unit.code == created.code

    with pytest.raises(HTTPException) as disable_exc:
        update_measurement_unit(
            created.id,
            MeasurementUnitUpdate(enabled=False),
            db,
            admin,
        )
    assert disable_exc.value.status_code == 409

    with pytest.raises(HTTPException) as exc_info:
        delete_measurement_unit(created.id, db, admin)
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "UNIT_IN_USE"
    assert exc_info.value.detail["usage"]["product_name_count"] == 1


def test_unused_unit_can_be_deleted_and_duplicate_name_is_rejected(
    db: Session, admin: AuthContext
) -> None:
    created = create_kg(db, admin)
    with pytest.raises(HTTPException) as exc_info:
        create_measurement_unit(
            MeasurementUnitIn(name="千克", symbol="公斤"),
            db,
            admin,
        )
    assert exc_info.value.status_code == 409

    result = delete_measurement_unit(created.id, db, admin)
    assert result == {"deleted": True, "id": created.id}
    assert list_measurement_units("", "", None, db, admin) == []


def test_explicit_unit_code_remains_supported_for_legacy_clients(
    db: Session, admin: AuthContext
) -> None:
    created = create_measurement_unit(
        MeasurementUnitIn(code=" kg ", name="千克", symbol="kg"),
        db,
        admin,
    )
    assert created.code == "KG"


def test_postgres_unit_schema_check_uses_sqlalchemy_bound_parameters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    executed: list[tuple[object, dict[str, str]]] = []

    class Result:
        @staticmethod
        def fetchone() -> tuple[int]:
            return (1,)

    class Connection:
        def execute(self, statement: object, parameters: dict[str, str]) -> Result:
            executed.append((statement, parameters))
            return Result()

        @staticmethod
        def exec_driver_sql(statement: str) -> None:
            assert statement.startswith("CREATE INDEX IF NOT EXISTS")

    connection = Connection()

    class Begin:
        @staticmethod
        def __enter__() -> Connection:
            return connection

        @staticmethod
        def __exit__(*args: object) -> None:
            return None

    class Dialect:
        name = "postgresql"

    class Engine:
        dialect = Dialect()

        @staticmethod
        def begin() -> Begin:
            return Begin()

    monkeypatch.setattr(main_module, "engine", Engine())
    monkeypatch.setattr(
        main_module.MeasurementUnit.__table__,
        "create",
        lambda **kwargs: None,
    )

    main_module.ensure_measurement_unit_schema()

    assert [parameters["table_name"] for _, parameters in executed] == [
        "product_names",
        "materials",
        "attributes",
    ]
    assert all(isinstance(statement, TextClause) for statement, _ in executed)
