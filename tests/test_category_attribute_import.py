from __future__ import annotations

import asyncio
from typing import Any
import zipfile

from backend.app import main
from backend.app.models import Category, CategoryAttribute, CategoryLibrary


class FakeQuery:
    def __init__(self, values: list[Any]) -> None:
        self.values = values

    def join(self, *args: Any) -> FakeQuery:
        return self

    def filter(self, *args: Any) -> FakeQuery:
        return self

    def all(self) -> list[Any]:
        return self.values

    def first(self) -> Any:
        return self.values[0] if self.values else None

    def scalar(self) -> Any:
        return self.values[0] if self.values else None


class ValidationSession:
    def query(self, _model: Any) -> FakeQuery:
        return FakeQuery([])


class PreviewSession:
    def __init__(
        self,
        library: CategoryLibrary,
        categories: list[Category],
        attributes: list[CategoryAttribute],
    ) -> None:
        self.library = library
        self.categories = categories
        self.attributes = attributes

    def get(self, model: type[Any], item_id: int) -> Any:
        if model is CategoryLibrary and item_id == self.library.id:
            return self.library
        return None

    def query(self, model: type[Any]) -> FakeQuery:
        if model is Category:
            return FakeQuery(self.categories)
        if model is CategoryAttribute:
            return FakeQuery(self.attributes)
        raise AssertionError(f"Unexpected model: {model}")


class PreviewTransactionSession(PreviewSession):
    def __init__(
        self,
        library: CategoryLibrary,
        categories: list[Category],
        attributes: list[CategoryAttribute],
    ) -> None:
        super().__init__(library, categories, attributes)
        self.transaction_active = True
        self.rollback_count = 0

    def in_transaction(self) -> bool:
        return self.transaction_active

    def rollback(self) -> None:
        self.rollback_count += 1
        self.transaction_active = False


class ConfirmSession(PreviewSession):
    def __init__(
        self,
        library: CategoryLibrary,
        categories: list[Category],
        attributes: list[CategoryAttribute],
    ) -> None:
        super().__init__(library, categories, attributes)
        self.commit_count = 0
        self.rollback_count = 0

    def commit(self) -> None:
        self.commit_count += 1

    def rollback(self) -> None:
        self.rollback_count += 1


class JsonImportRequest:
    headers = {"content-type": "application/json"}

    def __init__(self, rows: list[dict[str, str]]) -> None:
        self.rows = rows

    async def json(self) -> list[dict[str, str]]:
        return self.rows


def sample_context() -> tuple[PreviewSession, Category]:
    library = CategoryLibrary(id=1, code="LIB-001", name="测试类目库")
    category = Category(
        id=10,
        code="CAT-001",
        name="打印设备",
        category_library_id=library.id,
        parent_category_id=None,
    )
    existing = CategoryAttribute(
        id=20,
        category_id=category.id,
        name="颜色模式",
        attr_type="enum",
        options='["黑白", "彩色"]',
    )
    return PreviewSession(library, [category], [existing]), category


def test_category_attribute_xlsx_template_round_trip() -> None:
    rows = [
        main.CATEGORY_ATTRIBUTE_IMPORT_HEADERS,
        ["CAT-001", "办公设备 / 打印设备", "颜色模式", "颜色模式", "Color Mode", "enum", "打印输出的颜色模式", "黑白|彩色", "否", "是", "彩色", "20"],
    ]
    content = main.build_audit_workbook(rows).getvalue()

    parsed = main.parse_category_attribute_import_file(
        content,
        "category-attributes.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    assert parsed[0]["类目编码"] == "CAT-001"
    assert parsed[0]["属性定义"] == "打印输出的颜色模式"
    assert parsed[0]["枚举选项"] == "黑白|彩色"


def test_category_attribute_template_uses_descriptive_sheet_name() -> None:
    workbook = main.build_audit_workbook(
        [main.CATEGORY_ATTRIBUTE_IMPORT_HEADERS],
        sheet_name="类目属性导入模板",
    )

    with zipfile.ZipFile(workbook) as archive:
        workbook_xml = archive.read("xl/workbook.xml").decode("utf-8")

    assert 'sheet name="类目属性导入模板"' in workbook_xml
    assert 'sheet name="Audit Logs"' not in workbook_xml


def test_category_attribute_preview_supports_skip_and_update_conflicts() -> None:
    session, _category = sample_context()
    rows = [
        {
            "类目编码": "CAT-001",
            "属性名称": "颜色模式",
            "属性类型": "enum",
            "枚举选项": "黑白|彩色",
            "是否必填": "否",
            "是否允许为空": "是",
            "默认值": "彩色",
        },
        {
            "类目编码": "CAT-001",
            "属性名称": "打印速度",
            "属性类型": "number",
            "是否必填": "是",
            "是否允许为空": "否",
            "默认值": "30",
        },
    ]

    skipped = main.preview_category_attribute_import(session, 1, rows, "skip")
    updated = main.preview_category_attribute_import(session, 1, rows, "update")

    assert skipped["skipped_count"] == 1
    assert skipped["valid_count"] == 1
    assert updated["update_count"] == 1
    assert updated["create_count"] == 1
    assert updated["valid_count"] == 2


def test_category_attribute_preview_matches_category_by_path_without_code() -> None:
    session, _category = sample_context()
    rows = [
        {
            "类目路径": "打印设备",
            "属性名称": "打印速度",
            "属性类型": "number",
            "是否必填": "是",
            "是否允许为空": "否",
            "默认值": "30",
        },
    ]

    preview = main.preview_category_attribute_import(session, 1, rows, "skip")

    assert preview["error_count"] == 0
    assert preview["create_count"] == 1
    assert preview["items"][0]["category_id"] == _category.id
    assert preview["items"][0]["category_code"] == _category.code


def test_category_attribute_preview_path_takes_priority_over_mismatched_code() -> None:
    session, _category = sample_context()
    rows = [
        {
            "类目编码": "CODE-FROM-ANOTHER-SYSTEM",
            "类目路径": "打印设备",
            "属性名称": "打印速度",
            "属性类型": "number",
        },
    ]

    preview = main.preview_category_attribute_import(session, 1, rows, "skip")

    assert preview["error_count"] == 0
    assert preview["items"][0]["category_id"] == _category.id


def test_category_attribute_preview_flags_ambiguous_duplicate_paths() -> None:
    library = CategoryLibrary(id=1, code="LIB-001", name="测试类目库")
    first = Category(id=10, code="CAT-A", name="打印设备", category_library_id=1, parent_category_id=None)
    second = Category(id=11, code="CAT-B", name="打印设备", category_library_id=1, parent_category_id=None)
    session = PreviewSession(library, [first, second], [])

    preview = main.preview_category_attribute_import(
        session,
        1,
        [{"类目路径": "打印设备", "属性名称": "打印速度", "属性类型": "number"}],
        "skip",
    )

    assert preview["error_count"] == 1
    assert "类目路径匹配到多个类目" in preview["items"][0]["errors"][0]


def test_category_attribute_preview_matches_category_whose_name_contains_slash() -> None:
    library = CategoryLibrary(id=1, code="LIB-001", name="中检类目库")
    parent = Category(id=10, code="CAT-PARENT", name="化学类仪器设备", category_library_id=1, parent_category_id=None)
    child = Category(
        id=11,
        code="CAT-CHILD",
        name="腐蚀/老化试验",
        category_library_id=1,
        parent_category_id=parent.id,
    )
    session = PreviewSession(library, [parent, child], [])

    preview = main.preview_category_attribute_import(
        session,
        1,
        [
            {
                "类目路径": "化学类仪器设备 / 腐蚀/老化试验",
                "属性名称": "名称",
                "属性类型": "string",
            },
        ],
        "skip",
    )

    assert preview["error_count"] == 0
    assert preview["items"][0]["errors"] == []
    assert preview["items"][0]["category_id"] == child.id
    assert preview["create_count"] == 1


def test_category_attribute_preview_skips_attributes_inherited_from_ancestor() -> None:
    library = CategoryLibrary(id=1, code="LIB-001", name="测试类目库")
    parent = Category(id=10, code="CAT-PARENT", name="仪器设备", category_library_id=1)
    child = Category(
        id=11,
        code="CAT-CHILD",
        name="波谱分析",
        category_library_id=1,
        parent_category_id=parent.id,
    )
    inherited = CategoryAttribute(id=20, category_id=parent.id, name="名称", attr_type="string")
    session = PreviewSession(library, [parent, child], [inherited])

    preview = main.preview_category_attribute_import(
        session,
        1,
        [{"类目编码": "CAT-CHILD", "属性名称": "名称", "属性类型": "string"}],
        "update",
    )

    assert preview["valid_count"] == 0
    assert preview["skipped_count"] == 1
    assert preview["items"][0]["action"] == "skip"
    assert preview["items"][0]["existing_attribute_id"] == inherited.id


def test_category_attribute_preview_skips_child_duplicate_declared_with_parent_in_same_file() -> None:
    library = CategoryLibrary(id=1, code="LIB-001", name="测试类目库")
    parent = Category(id=10, code="CAT-PARENT", name="仪器设备", category_library_id=1)
    child = Category(
        id=11,
        code="CAT-CHILD",
        name="波谱分析",
        category_library_id=1,
        parent_category_id=parent.id,
    )
    session = PreviewSession(library, [parent, child], [])

    preview = main.preview_category_attribute_import(
        session,
        1,
        [
            {"类目编码": "CAT-CHILD", "属性名称": "名称", "属性类型": "string"},
            {"类目编码": "CAT-PARENT", "属性名称": "名称", "属性类型": "string"},
        ],
        "skip",
    )

    assert preview["create_count"] == 1
    assert preview["skipped_count"] == 1
    assert preview["items"][0]["action"] == "skip"
    assert preview["items"][1]["action"] == "create"


def test_category_attribute_preview_reports_row_validation_errors() -> None:
    session, _category = sample_context()

    preview = main.preview_category_attribute_import(
        session,
        1,
        [
            {
                "类目编码": "CAT-001",
                "属性名称": "颜色模式二",
                "属性类型": "enum",
                "枚举选项": "",
                "是否必填": "是",
                "是否允许为空": "是",
            }
        ],
        "skip",
    )

    assert preview["error_count"] == 1
    assert preview["valid_count"] == 0
    assert "枚举属性必须至少提供一个枚举选项" in preview["items"][0]["errors"]
    assert "必填属性不能同时允许为空" in preview["items"][0]["errors"]


def test_category_attribute_preview_endpoint_releases_read_transaction(monkeypatch: Any) -> None:
    base_session, category = sample_context()
    session = PreviewTransactionSession(base_session.library, [category], base_session.attributes)

    async def fake_rows_from_request(_request: Any) -> list[dict[str, str]]:
        return [{"类目编码": "CAT-001", "属性名称": "打印速度", "属性类型": "number"}]

    monkeypatch.setattr(main, "category_attribute_import_rows_from_request", fake_rows_from_request)
    monkeypatch.setattr(main, "require_button_permission", lambda *_args: None)

    preview = asyncio.run(
        main.preview_category_attribute_import_file(
            request=object(),
            category_library_id=1,
            conflict_strategy="skip",
            db=session,
            auth=object(),
        )
    )

    assert preview["error_count"] == 0
    assert session.rollback_count == 1
    assert session.transaction_active is False


def test_category_attribute_import_accepts_more_than_legacy_5000_rows() -> None:
    rows = [
        {"类目路径": "打印设备", "属性名称": f"属性-{index}", "属性类型": "string"}
        for index in range(5001)
    ]

    parsed = asyncio.run(main.category_attribute_import_rows_from_request(JsonImportRequest(rows)))

    assert len(parsed) == 5001


def test_category_attribute_import_keeps_a_large_file_safety_limit() -> None:
    rows = [{}] * (main.CATEGORY_ATTRIBUTE_IMPORT_MAX_ROWS + 1)

    try:
        asyncio.run(main.category_attribute_import_rows_from_request(JsonImportRequest(rows)))
    except main.HTTPException as exc:
        assert exc.status_code == 422
        assert "50000" in str(exc.detail)
    else:
        raise AssertionError("oversized category attribute imports must be rejected")


def test_category_attribute_validation_does_not_run_schema_ddl(monkeypatch: Any) -> None:
    _session, category = sample_context()

    def fail_if_schema_ddl_runs() -> None:
        raise AssertionError("schema DDL must not run inside an import transaction")

    monkeypatch.setattr(main, "ensure_category_attribute_schema", fail_if_schema_ddl_runs)

    values = main.validate_category_attribute_payload(
        ValidationSession(),
        category,
        main.CategoryAttributeCreate(
            name="打印速度",
            attr_type="number",
            required=True,
            allow_empty=False,
        ),
    )

    assert values["name"] == "打印速度"
    assert values["attr_type"] == "number"


def test_category_attribute_confirm_skips_inherited_attribute(monkeypatch: Any) -> None:
    library = CategoryLibrary(id=1, code="LIB-001", name="测试类目库")
    parent = Category(id=10, code="CAT-PARENT", name="仪器设备", category_library_id=1)
    child = Category(
        id=11,
        code="CAT-CHILD",
        name="波谱分析",
        category_library_id=1,
        parent_category_id=parent.id,
    )
    inherited = CategoryAttribute(id=20, category_id=parent.id, name="名称", attr_type="string")
    session = ConfirmSession(library, [parent, child], [inherited])
    monkeypatch.setattr(main, "require_button_permission", lambda *_args: None)
    monkeypatch.setattr(main, "add_audit_log", lambda *_args: None)

    result = main.confirm_category_attribute_import(
        main.CategoryAttributeImportConfirm(
            category_library_id=1,
            conflict_strategy="update",
            items=[
                {
                    "row_number": 2,
                    "category_id": child.id,
                    "attribute": {"name": "名称", "attr_type": "string"},
                }
            ],
        ),
        db=session,
        auth=object(),
    )

    assert result["created_count"] == 0
    assert result["updated_count"] == 0
    assert result["skipped_count"] == 1
    assert result["skipped"][0]["inherited_from_category_id"] == parent.id
    assert session.commit_count == 1
    assert session.rollback_count == 0


def test_category_attribute_import_routes_are_registered() -> None:
    paths = {route.path for route in main.app.routes}

    assert "/api/v1/category-attributes/import/template" in paths
    assert "/api/v1/category-attributes/import/preview" in paths
    assert "/api/v1/category-attributes/import/confirm" in paths
