from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.app.database import Base
from backend.app.main import (
    AuthContext,
    create_attribute,
    create_material,
    update_attribute,
    update_brand,
    update_material,
    update_product_name_status,
)
from backend.app.models import (
    Brand,
    Category,
    CategoryLibrary,
    Material,
    MaterialLibrary,
    ProductName,
    WorkflowApplication,
)
from backend.app.schemas import (
    AttributeIn,
    AttributeUpdate,
    BrandUpdate,
    MaterialIn,
    MaterialUpdate,
    ProductNameStatusUpdate,
)


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


def seed_brand_context(db: Session) -> tuple[ProductName, Brand, MaterialLibrary, Category]:
    product = ProductName(
        product_name_code="PN-SYNTHETIC",
        status="active",
        name="合成测试品名",
        unit="",
        category="测试",
    )
    brand = Brand(code="BRAND-SYNTHETIC", name="合成品牌", enabled=True)
    category_library = CategoryLibrary(code="CATLIB-SYNTHETIC", name="合成类目库")
    library = MaterialLibrary(
        code="LIB-SYNTHETIC",
        name="合成物料库",
        category_libraries=[category_library],
    )
    category = Category(
        code="CAT-SYNTHETIC",
        name="合成分类",
        category_library=category_library,
    )
    db.add_all([product, brand, category_library, library, category])
    db.commit()
    return product, brand, library, category


def test_attribute_supports_optional_enabled_brand(db: Session, admin: AuthContext) -> None:
    product, brand, _, _ = seed_brand_context(db)

    branded = create_attribute(
        AttributeIn(
            product_name_id=product.id,
            name="品牌属性",
            brand_id=brand.id,
        ),
        db,
        admin,
    )
    assert branded.brand_id == brand.id
    assert branded.brand is not None
    assert branded.brand.name == brand.name

    with pytest.raises(HTTPException) as brand_exc:
        update_brand(
            brand.id,
            BrandUpdate(enabled=False),
            db,
            admin,
        )
    assert brand_exc.value.status_code == 409

    without_brand = update_attribute(
        branded.id,
        AttributeUpdate(brand_id=None),
        db,
        admin,
    )
    assert without_brand.brand_id is None
    assert without_brand.brand is None

    brand.enabled = False
    db.commit()
    with pytest.raises(HTTPException) as exc_info:
        create_attribute(
            AttributeIn(
                product_name_id=product.id,
                name="不可选择停用品牌",
                brand_id=brand.id,
            ),
            db,
            admin,
        )
    assert exc_info.value.status_code == 422


def test_brand_cannot_be_disabled_while_referenced_by_material(
    db: Session, admin: AuthContext
) -> None:
    product, brand, library, category = seed_brand_context(db)
    material = Material(
        code="MAT-SYNTHETIC",
        name="合成物料",
        product_name_id=product.id,
        material_library_id=library.id,
        category_id=category.id,
        brand_id=brand.id,
    )
    db.add(material)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        update_brand(
            brand.id,
            BrandUpdate(enabled=False),
            db,
            admin,
        )
    assert exc_info.value.status_code == 409
    assert "1 个物料" in exc_info.value.detail
    db.refresh(brand)
    assert brand.enabled is True

    db.delete(material)
    db.commit()
    updated = update_brand(
        brand.id,
        BrandUpdate(enabled=False),
        db,
        admin,
    )
    assert updated.enabled is False


def test_product_attribute_and_material_status_guards(
    db: Session, admin: AuthContext
) -> None:
    product, brand, library, category = seed_brand_context(db)
    product.category_id = category.id
    product.category = category.name
    db.commit()
    attribute = create_attribute(
        AttributeIn(
            product_name_id=product.id,
            name="必选规格",
            required=True,
        ),
        db,
        admin,
    )

    with pytest.raises(HTTPException) as product_exc:
        update_product_name_status(
            product.id,
            ProductNameStatusUpdate(status="inactive"),
            db,
            admin,
        )
    assert product_exc.value.status_code == 409

    material = create_material(
        MaterialIn(
            name="链路物料",
            product_name_id=product.id,
            material_library_id=library.id,
            category_id=category.id,
            brand_id=brand.id,
            attributes={"必选规格": "A"},
        ),
        db,
        admin,
    )
    assert material.brand_id is None

    with pytest.raises(HTTPException) as attribute_exc:
        update_attribute(
            attribute.id,
            AttributeUpdate(enabled=False),
            db,
            admin,
        )
    assert attribute_exc.value.status_code == 409

    application = WorkflowApplication(
        application_no="WF-SYNTHETIC",
        type="stop_use",
        status="pending",
        payload=f'{{"material_id": {material.id}}}',
    )
    db.add(application)
    db.commit()
    with pytest.raises(HTTPException) as material_exc:
        update_material(
            material.id,
            MaterialUpdate(enabled=False),
            db,
            admin,
        )
    assert material_exc.value.status_code == 409
