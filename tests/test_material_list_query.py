from __future__ import annotations

from typing import Any

from backend.app import main
from backend.app.main import AuthContext
from backend.app.models import Category, Material


class RecordingQuery:
    def __init__(self) -> None:
        self.joins: list[tuple[Any, ...]] = []

    def join(self, *args: Any) -> RecordingQuery:
        self.joins.append(args)
        return self

    def outerjoin(self, *args: Any) -> RecordingQuery:
        self.joins.append(args)
        return self

    def order_by(self, *args: Any) -> RecordingQuery:
        return self

    def all(self) -> list[Any]:
        return []


class RecordingSession:
    def __init__(self) -> None:
        self.query_object = RecordingQuery()

    def query(self, *args: Any) -> RecordingQuery:
        return self.query_object


def test_material_list_joins_category_through_material(monkeypatch) -> None:
    session = RecordingSession()
    auth = AuthContext(
        user=None,
        username="synthetic-admin",
        display_name="Synthetic Admin",
        permissions=set(),
        library_scope_ids=None,
        role_ids=set(),
        is_super_admin=True,
    )
    monkeypatch.setattr(main, "ensure_seed_material_context", lambda db: None)

    result = main.list_materials(db=session, auth=auth)

    assert result == []
    category_join = session.query_object.joins[-1]
    assert category_join[0] is Category
    assert category_join[1].compare(Material.category_id == Category.id)
