from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.app.database import Base
from backend.app.main import (
    AuthContext,
    create_application_version,
    delete_application_version,
    get_current_application_version,
    list_application_versions,
    publish_application_version,
    update_application_version,
)
from backend.app.schemas import ApplicationVersionIn, ApplicationVersionUpdate


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
        username="version-admin",
        display_name="Version Admin",
        permissions=set(),
        library_scope_ids=None,
        role_ids=set(),
        is_super_admin=True,
    )


def test_about_version_falls_back_until_a_version_is_published(
    db: Session,
    admin: AuthContext,
) -> None:
    fallback = get_current_application_version(db, admin)
    assert fallback.version == "4.2.0"
    assert fallback.managed is False

    created = create_application_version(
        ApplicationVersionIn(
            version="v5.0.0",
            title="全新版本",
            release_notes="支持动态版本管理。",
        ),
        db,
        admin,
    )
    assert created.version == "5.0.0"
    assert created.status == "draft"
    assert get_current_application_version(db, admin).managed is False

    published = publish_application_version(created.id or 0, db, admin)
    assert published.status == "published"
    assert published.released_at is not None
    assert get_current_application_version(db, admin).version == "5.0.0"


def test_publishing_archives_previous_version_and_protects_current(
    db: Session,
    admin: AuthContext,
) -> None:
    first = create_application_version(
        ApplicationVersionIn(version="5.0.0", title="首发"),
        db,
        admin,
    )
    publish_application_version(first.id or 0, db, admin)
    second = create_application_version(
        ApplicationVersionIn(version="5.1.0", title="增强版"),
        db,
        admin,
    )
    update_application_version(
        second.id or 0,
        ApplicationVersionUpdate(release_notes="新增版本管理。"),
        db,
        admin,
    )
    publish_application_version(second.id or 0, db, admin)

    versions = list_application_versions(db, admin)
    statuses = {item.version: item.status for item in versions}
    assert statuses == {"5.0.0": "archived", "5.1.0": "published"}

    with pytest.raises(HTTPException) as exc_info:
        delete_application_version(second.id or 0, db, admin)
    assert exc_info.value.status_code == 409

    assert delete_application_version(first.id or 0, db, admin) == {
        "deleted": True,
        "id": first.id,
    }
