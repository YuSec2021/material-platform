from __future__ import annotations

import json
import re
import base64
import binascii
import csv
from io import BytesIO, StringIO
from datetime import datetime, timezone
from hashlib import sha1
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import Attribute, AttributeChange, Brand, Category, Material, MaterialLibrary, ProductName
from .schemas import (
    AttributeIn,
    AttributeOut,
    AttributeUpdate,
    BrandIn,
    BrandLogo,
    BrandOut,
    BrandUpdate,
    CategoryOut,
    ChangeOut,
    GovernanceImportIn,
    GovernancePreviewIn,
    MaterialGovernanceImportIn,
    MaterialGovernancePreviewIn,
    MaterialIn,
    MaterialLibraryOut,
    MaterialOut,
    MaterialTransitionIn,
    MaterialUpdate,
    ProductNameOut,
    RecommendIn,
)


app = FastAPI(title="AI Material Management Platform", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SEED_PRODUCT = {
    "name": "Sprint 3 A4 彩色激光打印机",
    "unit": "台",
    "category": "办公设备 / 打印机",
}
SEED_LIBRARY = {
    "code": "MLIB-DEFAULT",
    "name": "Default Material Library",
    "description": "Default library for sprint verification materials",
}
SEED_CATEGORY = {
    "code": "CAT-PRINTER",
    "name": "办公设备 / 打印机",
    "description": "Default category bound to the seed product name",
}
MATERIAL_STATUSES = {"normal", "stop_purchase", "stop_use"}
MATERIAL_TRANSITIONS = {("normal", "stop_purchase"), ("stop_purchase", "stop_use")}


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    db = next(get_db())
    try:
        ensure_seed_product(db)
        ensure_seed_material_context(db)
    finally:
        db.close()


def ensure_seed_product(db: Session) -> ProductName:
    Base.metadata.create_all(bind=engine)
    product = db.query(ProductName).filter(ProductName.name == SEED_PRODUCT["name"]).first()
    if product:
        return product
    product = ProductName(**SEED_PRODUCT)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def ensure_seed_material_context(db: Session) -> tuple[MaterialLibrary, Category]:
    Base.metadata.create_all(bind=engine)
    library = db.query(MaterialLibrary).filter(MaterialLibrary.code == SEED_LIBRARY["code"]).first()
    if not library:
        library = MaterialLibrary(**SEED_LIBRARY)
        db.add(library)
    category = db.query(Category).filter(Category.code == SEED_CATEGORY["code"]).first()
    if not category:
        category = Category(**SEED_CATEGORY)
        db.add(category)
    db.commit()
    db.refresh(library)
    db.refresh(category)
    return library, category


def now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_options(value: list[str] | str | None) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [part.strip() for part in re.split(r"[,，、\s]+", value) if part.strip()]


def code_for(prefix: str, seed: str) -> str:
    digest = sha1(seed.encode("utf-8")).hexdigest()[:8].upper()
    return f"{prefix}-{digest}"


def next_unique_code(db: Session, model: type[Any], prefix: str, seed: str) -> str:
    base = code_for(prefix, seed)
    code = base
    suffix = 2
    while db.query(model).filter(model.code == code).first():
        code = f"{base}-{suffix}"
        suffix += 1
    return code


def product_by_payload(db: Session, product_name_id: int | None, product_name: str | None) -> ProductName:
    query = db.query(ProductName)
    product = query.filter(ProductName.id == product_name_id).first() if product_name_id else None
    if not product and product_name:
        product = query.filter(ProductName.name == product_name).first()
    if not product and product_name == SEED_PRODUCT["name"]:
        product = ensure_seed_product(db)
    if not product:
        raise HTTPException(status_code=404, detail="Product name not found")
    return product


def attribute_to_out(attribute: Attribute) -> AttributeOut:
    return AttributeOut(
        id=attribute.id,
        code=attribute.code,
        product_name_id=attribute.product_name_id,
        product_name=attribute.product_name.name,
        name=attribute.name,
        data_type=attribute.data_type,
        unit=attribute.unit,
        required=attribute.required,
        default_value=attribute.default_value,
        options=normalize_options(attribute.options),
        description=attribute.description,
        source=attribute.source,
        version=attribute.version,
        enabled=attribute.enabled,
    )


def change_to_out(change: AttributeChange) -> ChangeOut:
    return ChangeOut(
        id=change.id,
        attribute_id=change.attribute_id,
        attribute_code=change.attribute_code,
        attribute_name=change.attribute_name,
        version=change.version,
        operator=change.operator,
        changed_fields=json.loads(change.changed_fields or "[]"),
        before_values=json.loads(change.before_values or "{}"),
        after_values=json.loads(change.after_values or "{}"),
        created_at=change.created_at.isoformat(),
    )


def logo_to_model(brand: Brand, logo: BrandLogo) -> None:
    brand.logo_filename = logo.filename
    brand.logo_content_type = logo.content_type
    brand.logo_data_url = logo.data_url


def brand_to_out(brand: Brand) -> BrandOut:
    return BrandOut(
        id=brand.id,
        code=brand.code,
        name=brand.name,
        description=brand.description,
        enabled=brand.enabled,
        logo=BrandLogo(
            filename=brand.logo_filename,
            content_type=brand.logo_content_type,
            data_url=brand.logo_data_url,
        ),
    )


def library_to_out(library: MaterialLibrary) -> MaterialLibraryOut:
    return MaterialLibraryOut(
        id=library.id,
        code=library.code,
        name=library.name,
        description=library.description,
        enabled=library.enabled,
    )


def category_to_out(category: Category) -> CategoryOut:
    return CategoryOut(
        id=category.id,
        code=category.code,
        name=category.name,
        description=category.description,
        enabled=category.enabled,
    )


def material_attributes(value: str | dict[str, Any] | None) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not value:
        return {}
    try:
        loaded = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return loaded if isinstance(loaded, dict) else {}


def material_to_out(material: Material) -> MaterialOut:
    return MaterialOut(
        id=material.id,
        code=material.code,
        name=material.name,
        product_name_id=material.product_name_id,
        product_name=material.product_name.name,
        material_library_id=material.material_library_id,
        material_library=material.material_library.name,
        category_id=material.category_id,
        category=material.category.name,
        unit=material.unit,
        brand_id=material.brand_id,
        brand=material.brand.name if material.brand else "",
        status=material.status,
        description=material.description,
        attributes=material_attributes(material.attributes),
        enabled=material.enabled,
        created_at=material.created_at.isoformat(),
        updated_at=material.updated_at.isoformat(),
    )


def validate_material_status(status: str) -> str:
    if status not in MATERIAL_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unsupported material status: {status}")
    return status


def enforce_material_transition(current: str, target: str, reason: str | None = None) -> None:
    validate_material_status(target)
    if current == target:
        return
    if (current, target) not in MATERIAL_TRANSITIONS:
        raise HTTPException(
            status_code=400,
            detail="Material status is non-reversible and must follow normal -> stop_purchase -> stop_use",
        )
    if not reason or not reason.strip():
        raise HTTPException(status_code=422, detail="A transition or exemption reason is required")


def material_context_by_payload(
    db: Session,
    product_name_id: int | None,
    material_library_id: int | None,
    category_id: int | None,
) -> tuple[ProductName, MaterialLibrary, Category]:
    product = product_by_payload(db, product_name_id, None)
    library, category = ensure_seed_material_context(db)
    if material_library_id:
        library = db.get(MaterialLibrary, material_library_id)
    if category_id:
        category = db.get(Category, category_id)
    if not library:
        raise HTTPException(status_code=404, detail="Material library not found")
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return product, library, category


def material_row_value(row: dict[str, Any], keys: list[str]) -> str:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def attributes_from_row(row: dict[str, Any]) -> dict[str, Any]:
    known = {
        "name",
        "material_name",
        "物料名称",
        "unit",
        "单位",
        "brand",
        "品牌",
        "description",
        "描述",
        "attributes",
        "属性",
        "product_name",
        "product",
        "产品名称",
    }
    attributes: dict[str, Any] = {}
    raw = material_row_value(row, ["attributes", "属性"])
    if raw:
        try:
            loaded = json.loads(raw)
            if isinstance(loaded, dict):
                attributes.update({str(key): value for key, value in loaded.items()})
        except json.JSONDecodeError:
            for part in re.split(r"[;；|]+", raw):
                if not part.strip():
                    continue
                key, _, value = re.split(r"[:：=]", part, maxsplit=1)[0].strip(), "", ""
                if ":" in part:
                    key, value = part.split(":", 1)
                elif "：" in part:
                    key, value = part.split("：", 1)
                elif "=" in part:
                    key, value = part.split("=", 1)
                if key.strip() and value.strip():
                    attributes[key.strip()] = value.strip()
    for key, value in row.items():
        if key not in known and value is not None and str(value).strip():
            attributes[str(key).strip()] = str(value).strip()
    return attributes


def decode_uploaded_rows(file_name: str, file_content: str) -> list[dict[str, Any]]:
    if not file_name or not file_content:
        return []
    encoded = file_content.split(",", 1)[1] if "," in file_content[:80] else file_content
    try:
        data = base64.b64decode(encoded)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Unable to decode uploaded material file") from exc
    if file_name.lower().endswith(".xlsx"):
        try:
            from openpyxl import load_workbook
        except ImportError as exc:
            raise HTTPException(status_code=500, detail="Excel parser is unavailable") from exc
        workbook = load_workbook(BytesIO(data), read_only=True, data_only=True)
        sheet = workbook.active
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(cell or "").strip() for cell in rows[0]]
        return [
            {headers[index] or f"column_{index + 1}": value for index, value in enumerate(row)}
            for row in rows[1:]
            if any(cell is not None and str(cell).strip() for cell in row)
        ]
    text = data.decode("utf-8-sig")
    return list(csv.DictReader(StringIO(text)))


def parse_material_rows(rows: str | list[str] | list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not rows:
        return []
    if isinstance(rows, list) and all(isinstance(row, dict) for row in rows):
        return [dict(row) for row in rows]
    if isinstance(rows, str):
        text = rows.strip()
        if not text:
            return []
        first_line = text.splitlines()[0]
        if "," in first_line and any(header in first_line for header in ["name", "物料名称", "unit", "单位"]):
            return list(csv.DictReader(StringIO(text)))
        raw_rows = text.splitlines()
    else:
        raw_rows = [str(row) for row in rows]
    parsed: list[dict[str, Any]] = []
    for row in raw_rows:
        parts = [part.strip() for part in re.split(r"[,，\t|]+", str(row)) if part.strip()]
        if not parts:
            continue
        parsed.append(
            {
                "name": parts[0],
                "unit": parts[1] if len(parts) > 1 else "",
                "brand": parts[2] if len(parts) > 2 else "",
                "description": parts[3] if len(parts) > 3 else "",
                "attributes": parts[4] if len(parts) > 4 else "",
            }
        )
    return parsed


def material_governance_items(
    payload: MaterialGovernancePreviewIn,
    db: Session,
) -> list[dict[str, Any]]:
    product = product_by_payload(db, payload.product_name_id, payload.product_name) if payload.product_name_id or payload.product_name else ensure_seed_product(db)
    library, category = ensure_seed_material_context(db)
    if payload.material_library_id:
        library = db.get(MaterialLibrary, payload.material_library_id) or library
    if payload.category_id:
        category = db.get(Category, payload.category_id) or category
    rows = decode_uploaded_rows(payload.file_name, payload.file_content) or parse_material_rows(payload.rows)
    items: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        name = material_row_value(row, ["name", "material_name", "物料名称"])
        unit = material_row_value(row, ["unit", "单位"]) or product.unit
        brand_name = material_row_value(row, ["brand", "品牌"])
        description = material_row_value(row, ["description", "描述"])
        attributes = attributes_from_row(row)
        errors: list[str] = []
        if not name:
            errors.append("Material name is required")
        validation_status = "valid" if not errors else "invalid"
        confidence = 0.93 if validation_status == "valid" and attributes else 0.86 if validation_status == "valid" else 0.42
        items.append(
            {
                "source_row": index,
                "name": name,
                "code": code_for("MAT", f"{product.id}:{name}:{index}"),
                "product_name_id": product.id,
                "product_name": product.name,
                "material_library_id": library.id,
                "material_library": library.name,
                "category_id": category.id,
                "category": category.name,
                "unit": unit,
                "brand_name": brand_name,
                "description": description,
                "attributes": attributes,
                "status": "normal",
                "validation_status": validation_status,
                "errors": errors,
                "selectable": validation_status == "valid",
                "confidence": confidence,
            }
        )
    return items


def governance_items(rows: str | list[str]) -> list[dict[str, Any]]:
    raw_rows = rows.splitlines() if isinstance(rows, str) else rows
    items: list[dict[str, Any]] = []
    for index, row in enumerate(raw_rows, start=1):
        text = str(row).strip()
        if not text:
            continue
        parts = [part.strip() for part in re.split(r"[/,，\t|]+", text) if part.strip()]
        name = parts[0] if parts else text
        raw_options = parts[1] if len(parts) > 1 else ""
        raw_type = parts[2] if len(parts) > 2 else raw_options
        data_type = normalize_data_type(raw_type)
        options = normalize_options(raw_options) if data_type == "enum" else []
        standardized_name = standardize_attribute_name(name)
        items.append(
            {
                "source_row": index,
                "source_text": text,
                "name": standardized_name,
                "data_type": data_type,
                "unit": infer_unit(text, data_type),
                "required": False,
                "default_value": options[0] if options else "",
                "options": options,
                "description": f"AI governance standardized from row {index}",
                "source": "AI governance import",
                "code": code_for("ATTR", standardized_name + text),
                "confidence": 0.92 if data_type in {"number", "enum"} else 0.84,
            }
        )
    return items


def standardize_attribute_name(name: str) -> str:
    mapping = {
        "速度": "打印速度",
        "每分钟页数": "打印速度",
        "打印颜色": "颜色模式",
        "纸张尺寸": "纸张尺寸",
    }
    return mapping.get(name, name)


def normalize_data_type(value: str) -> str:
    text = value.lower()
    if any(token in text for token in ["数值", "数字", "number", "每分钟"]):
        return "number"
    if any(token in text for token in ["枚举", "enum", "黑白", "彩色", "a4"]):
        return "enum"
    if any(token in text for token in ["日期", "date"]):
        return "date"
    return "text"


def infer_unit(text: str, data_type: str) -> str:
    if data_type == "number" and ("页" in text or "速度" in text):
        return "页/分钟"
    return ""


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/product-names", response_model=list[ProductNameOut])
def list_product_names(db: Session = Depends(get_db)) -> list[ProductNameOut]:
    ensure_seed_product(db)
    products = db.query(ProductName).order_by(ProductName.id).all()
    return [ProductNameOut(id=p.id, name=p.name, unit=p.unit, category=p.category) for p in products]


@app.get("/api/v1/material-libraries", response_model=list[MaterialLibraryOut])
def list_material_libraries(db: Session = Depends(get_db)) -> list[MaterialLibraryOut]:
    ensure_seed_material_context(db)
    libraries = db.query(MaterialLibrary).order_by(MaterialLibrary.id).all()
    return [library_to_out(library) for library in libraries]


@app.get("/api/v1/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)) -> list[CategoryOut]:
    ensure_seed_material_context(db)
    categories = db.query(Category).order_by(Category.id).all()
    return [category_to_out(category) for category in categories]


@app.get("/api/v1/materials", response_model=list[MaterialOut])
def list_materials(
    search: str = "",
    status: str = "",
    product_name_id: int | None = None,
    db: Session = Depends(get_db),
) -> list[MaterialOut]:
    ensure_seed_material_context(db)
    query = db.query(Material).join(ProductName).join(MaterialLibrary).join(Category)
    if product_name_id:
        query = query.filter(Material.product_name_id == product_name_id)
    if status:
        validate_material_status(status)
        query = query.filter(Material.status == status)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                Material.name.like(like),
                Material.code.like(like),
                Material.description.like(like),
                Material.attributes.like(like),
                ProductName.name.like(like),
            )
        )
    materials = query.order_by(Material.id.desc()).all()
    return [material_to_out(material) for material in materials]


@app.post("/api/v1/materials", response_model=MaterialOut)
def create_material(payload: MaterialIn, db: Session = Depends(get_db)) -> MaterialOut:
    status = validate_material_status(payload.status)
    if status != "normal":
        raise HTTPException(status_code=400, detail="New materials must start in normal status")
    product, library, category = material_context_by_payload(
        db,
        payload.product_name_id,
        payload.material_library_id,
        payload.category_id,
    )
    existing = db.query(Material).filter(Material.product_name_id == product.id, Material.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Material already exists for this product name")
    brand = db.get(Brand, payload.brand_id) if payload.brand_id else None
    if payload.brand_id and not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    material = Material(
        code=next_unique_code(db, Material, "MAT", f"{product.id}:{payload.name}:{now().isoformat()}"),
        name=payload.name,
        product_name_id=product.id,
        material_library_id=library.id,
        category_id=category.id,
        unit=payload.unit or product.unit,
        brand_id=brand.id if brand else None,
        status=status,
        description=payload.description,
        attributes=json.dumps(payload.attributes, ensure_ascii=False),
        enabled=payload.enabled,
    )
    db.add(material)
    db.commit()
    db.refresh(material)
    return material_to_out(material)


@app.put("/api/v1/materials/{material_id}", response_model=MaterialOut)
def update_material(material_id: int, payload: MaterialUpdate, db: Session = Depends(get_db)) -> MaterialOut:
    material = db.get(Material, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    if payload.product_name_id or payload.material_library_id or payload.category_id:
        product, library, category = material_context_by_payload(
            db,
            payload.product_name_id or material.product_name_id,
            payload.material_library_id or material.material_library_id,
            payload.category_id or material.category_id,
        )
        material.product_name_id = product.id
        material.material_library_id = library.id
        material.category_id = category.id
    if payload.name is not None and payload.name != material.name:
        exists = (
            db.query(Material)
            .filter(Material.product_name_id == material.product_name_id, Material.name == payload.name, Material.id != material.id)
            .first()
        )
        if exists:
            raise HTTPException(status_code=409, detail="Material already exists for this product name")
        material.name = payload.name
    for field in ["unit", "description", "enabled"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(material, field, value)
    if payload.brand_id is not None:
        brand = db.get(Brand, payload.brand_id) if payload.brand_id else None
        if payload.brand_id and not brand:
            raise HTTPException(status_code=404, detail="Brand not found")
        material.brand_id = brand.id if brand else None
    if payload.attributes is not None:
        material.attributes = json.dumps(payload.attributes, ensure_ascii=False)
    if payload.status is not None:
        enforce_material_transition(material.status, payload.status, payload.transition_reason)
        material.status = payload.status
    material.updated_at = now()
    db.commit()
    db.refresh(material)
    return material_to_out(material)


@app.post("/api/v1/materials/{material_id}/transition", response_model=MaterialOut)
def transition_material(
    material_id: int,
    payload: MaterialTransitionIn,
    db: Session = Depends(get_db),
) -> MaterialOut:
    material = db.get(Material, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    enforce_material_transition(material.status, payload.target_status, payload.reason)
    material.status = payload.target_status
    material.updated_at = now()
    db.commit()
    db.refresh(material)
    return material_to_out(material)


@app.delete("/api/v1/materials/{material_id}")
def delete_material(material_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    material = db.get(Material, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    db.delete(material)
    db.commit()
    return {"deleted": True, "id": material_id}


@app.post(
    "/api/v1/materials/governance/preview",
    description="AI material governance preview. capability: material_governance",
)
def preview_material_governance(
    payload: MaterialGovernancePreviewIn,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items = material_governance_items(payload, db)
    return {"capability": "material_governance", "items": items, "count": len(items)}


@app.post(
    "/api/v1/materials/governance/import",
    response_model=list[MaterialOut],
    description="AI material governance batch confirmation import. capability: material_governance",
)
def import_material_governance(
    payload: MaterialGovernanceImportIn,
    db: Session = Depends(get_db),
) -> list[MaterialOut]:
    product = product_by_payload(db, payload.product_name_id, payload.product_name) if payload.product_name_id or payload.product_name else ensure_seed_product(db)
    default_library, default_category = ensure_seed_material_context(db)
    imported: list[Material] = []
    for item in payload.items:
        if item.get("validation_status") == "invalid" or item.get("errors"):
            raise HTTPException(status_code=422, detail="Invalid preview rows cannot be imported")
        name = str(item.get("name", "")).strip()
        if not name:
            raise HTTPException(status_code=422, detail="Material name is required")
        item_product = db.get(ProductName, int(item.get("product_name_id") or product.id)) or product
        library = db.get(MaterialLibrary, int(item.get("material_library_id") or payload.material_library_id or default_library.id)) or default_library
        category = db.get(Category, int(item.get("category_id") or payload.category_id or default_category.id)) or default_category
        brand_id = item.get("brand_id")
        brand_name = str(item.get("brand_name", "")).strip()
        brand = db.get(Brand, int(brand_id)) if brand_id else None
        if not brand and brand_name:
            brand = db.query(Brand).filter(Brand.name == brand_name).first()
            if not brand:
                brand = Brand(
                    code=next_unique_code(db, Brand, "BRAND", brand_name),
                    name=brand_name,
                    description="Created during material governance import",
                    enabled=True,
                )
                db.add(brand)
                db.flush()
        existing = db.query(Material).filter(Material.product_name_id == item_product.id, Material.name == name).first()
        if existing:
            imported.append(existing)
            continue
        material = Material(
            code=next_unique_code(db, Material, "MAT", f"{item_product.id}:{name}:{item.get('source_row')}:{now().isoformat()}"),
            name=name,
            product_name_id=item_product.id,
            material_library_id=library.id,
            category_id=category.id,
            unit=str(item.get("unit") or item_product.unit),
            brand_id=brand.id if brand else None,
            status="normal",
            description=str(item.get("description", "")),
            attributes=json.dumps(material_attributes(item.get("attributes")), ensure_ascii=False),
            enabled=True,
        )
        db.add(material)
        db.flush()
        imported.append(material)
    db.commit()
    for material in imported:
        db.refresh(material)
    return [material_to_out(material) for material in imported]


@app.post("/api/v1/ai/material-governance/preview")
def preview_ai_material_governance(
    payload: MaterialGovernancePreviewIn,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return preview_material_governance(payload, db)


@app.post("/api/v1/ai/material-governance/import", response_model=list[MaterialOut])
def import_ai_material_governance(
    payload: MaterialGovernanceImportIn,
    db: Session = Depends(get_db),
) -> list[MaterialOut]:
    return import_material_governance(payload, db)


@app.get("/api/v1/attributes/changes", response_model=list[ChangeOut])
def list_attribute_changes(db: Session = Depends(get_db)) -> list[ChangeOut]:
    changes = db.query(AttributeChange).order_by(AttributeChange.id.desc()).all()
    return [change_to_out(change) for change in changes]


@app.post("/api/v1/attributes/governance/preview")
def preview_attribute_governance(payload: GovernancePreviewIn) -> dict[str, Any]:
    items = governance_items(payload.rows)
    return {"items": items, "count": len(items)}


@app.post("/api/v1/ai/attribute-governance/preview")
def preview_ai_attribute_governance(payload: GovernancePreviewIn) -> dict[str, Any]:
    return preview_attribute_governance(payload)


@app.post("/api/v1/attributes/governance/import", response_model=list[AttributeOut])
def import_attribute_governance(payload: GovernanceImportIn, db: Session = Depends(get_db)) -> list[AttributeOut]:
    product = product_by_payload(db, payload.product_name_id, payload.product_name)
    imported: list[Attribute] = []
    for item in payload.items:
        existing = (
            db.query(Attribute)
            .filter(Attribute.product_name_id == product.id, Attribute.name == item.get("name", ""))
            .first()
        )
        if existing:
            imported.append(existing)
            continue
        attribute = Attribute(
            code=next_unique_code(db, Attribute, "ATTR", f"{product.id}:{item.get('name')}:{item.get('source_row')}"),
            product_name_id=product.id,
            name=str(item.get("name", "")),
            data_type=str(item.get("data_type", "text")),
            unit=str(item.get("unit", "")),
            required=bool(item.get("required", False)),
            default_value=str(item.get("default_value", "")),
            options=",".join(normalize_options(item.get("options", []))),
            description=str(item.get("description", "")),
            source=str(item.get("source", "AI governance import")),
        )
        db.add(attribute)
        db.flush()
        add_change(attribute, ["created"], {}, snapshot(attribute), "AI governance")
        imported.append(attribute)
    db.commit()
    for attribute in imported:
        db.refresh(attribute)
    return [attribute_to_out(attribute) for attribute in imported]


@app.post("/api/v1/ai/attribute-governance/import", response_model=list[AttributeOut])
def import_ai_attribute_governance(
    payload: GovernanceImportIn,
    db: Session = Depends(get_db),
) -> list[AttributeOut]:
    return import_attribute_governance(payload, db)


@app.get("/api/v1/attributes", response_model=list[AttributeOut])
def list_attributes(
    product_name_id: int | None = None,
    search: str = "",
    db: Session = Depends(get_db),
) -> list[AttributeOut]:
    query = db.query(Attribute).join(ProductName)
    if product_name_id:
        query = query.filter(Attribute.product_name_id == product_name_id)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(Attribute.name.like(like), Attribute.code.like(like), Attribute.options.like(like)))
    attributes = query.order_by(Attribute.id.desc()).all()
    return [attribute_to_out(attribute) for attribute in attributes]


@app.post("/api/v1/attributes", response_model=AttributeOut)
def create_attribute(payload: AttributeIn, db: Session = Depends(get_db)) -> AttributeOut:
    product = product_by_payload(db, payload.product_name_id, payload.product_name)
    attribute = Attribute(
        code=next_unique_code(db, Attribute, "ATTR", f"{product.id}:{payload.name}:{func.now()}"),
        product_name_id=product.id,
        name=payload.name,
        data_type=payload.data_type,
        unit=payload.unit,
        required=payload.required,
        default_value=payload.default_value,
        options=",".join(normalize_options(payload.options)),
        description=payload.description,
        source=payload.source,
    )
    db.add(attribute)
    db.flush()
    add_change(attribute, ["created"], {}, snapshot(attribute), "super_admin")
    db.commit()
    db.refresh(attribute)
    return attribute_to_out(attribute)


@app.put("/api/v1/attributes/{attribute_id}", response_model=AttributeOut)
def update_attribute(attribute_id: int, payload: AttributeUpdate, db: Session = Depends(get_db)) -> AttributeOut:
    attribute = db.get(Attribute, attribute_id)
    if not attribute:
        raise HTTPException(status_code=404, detail="Attribute not found")
    before = snapshot(attribute)
    changed: list[str] = []
    for field in ["name", "data_type", "unit", "required", "default_value", "description", "source", "enabled"]:
        value = getattr(payload, field)
        if value is not None and getattr(attribute, field) != value:
            setattr(attribute, field, value)
            changed.append(field)
    if payload.options is not None:
        options = ",".join(normalize_options(payload.options))
        if attribute.options != options:
            attribute.options = options
            changed.append("options")
    if changed:
        attribute.version += 1
        attribute.updated_at = now()
        add_change(attribute, changed, {key: before[key] for key in changed}, {key: snapshot(attribute)[key] for key in changed}, "super_admin")
    db.commit()
    db.refresh(attribute)
    return attribute_to_out(attribute)


@app.delete("/api/v1/attributes/{attribute_id}")
def delete_attribute(attribute_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    attribute = db.get(Attribute, attribute_id)
    if not attribute:
        raise HTTPException(status_code=404, detail="Attribute not found")
    db.delete(attribute)
    db.commit()
    return {"deleted": True, "id": attribute_id}


@app.get("/api/v1/attributes/{attribute_id}/changes", response_model=list[ChangeOut])
def get_attribute_changes(attribute_id: int, db: Session = Depends(get_db)) -> list[ChangeOut]:
    changes = (
        db.query(AttributeChange)
        .filter(AttributeChange.attribute_id == attribute_id)
        .order_by(AttributeChange.id.desc())
        .all()
    )
    return [change_to_out(change) for change in changes]


@app.post("/api/v1/ai/attribute-recommend")
def recommend_attributes(payload: RecommendIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    product = product_by_payload(db, payload.product_name_id, payload.product_name)
    recommendations = [
        {
            "name": "打印速度",
            "data_type": "number",
            "unit": "页/分钟",
            "required": True,
            "default_value": "30",
            "options": [],
            "confidence": 0.95,
            "source": "category common attributes",
            "reason": f"{product.category}常用性能指标",
        },
        {
            "name": "颜色模式",
            "data_type": "enum",
            "unit": "",
            "required": True,
            "default_value": "彩色",
            "options": ["黑白", "彩色"],
            "confidence": 0.91,
            "source": "historical data",
            "reason": "同类物料历史属性高频出现",
        },
        {
            "name": "纸张尺寸",
            "data_type": "enum",
            "unit": "",
            "required": False,
            "default_value": "A4",
            "options": ["A4", "A5"],
            "confidence": 0.88,
            "source": "standard references",
            "reason": "办公打印设备标准属性",
        },
    ]
    return {"capability": "attr_recommend", "product_name": product.name, "recommendations": recommendations}


@app.get("/api/v1/brands", response_model=list[BrandOut])
def list_brands(search: str = "", db: Session = Depends(get_db)) -> list[BrandOut]:
    query = db.query(Brand)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(Brand.name.like(like), Brand.code.like(like), Brand.description.like(like)))
    brands = query.order_by(Brand.id.desc()).all()
    return [brand_to_out(brand) for brand in brands]


@app.post("/api/v1/brands", response_model=BrandOut)
def create_brand(payload: BrandIn, db: Session = Depends(get_db)) -> BrandOut:
    existing = db.query(Brand).filter(Brand.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Brand already exists")
    brand = Brand(
        code=next_unique_code(db, Brand, "BRAND", payload.name),
        name=payload.name,
        description=payload.description,
        enabled=payload.enabled,
    )
    logo_to_model(brand, payload.logo)
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return brand_to_out(brand)


@app.put("/api/v1/brands/{brand_id}", response_model=BrandOut)
def update_brand(brand_id: int, payload: BrandUpdate, db: Session = Depends(get_db)) -> BrandOut:
    brand = db.get(Brand, brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    for field in ["name", "description", "enabled"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(brand, field, value)
    if payload.logo is not None:
        logo_to_model(brand, payload.logo)
    brand.updated_at = now()
    db.commit()
    db.refresh(brand)
    return brand_to_out(brand)


@app.delete("/api/v1/brands/{brand_id}")
def delete_brand(brand_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    brand = db.get(Brand, brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    db.delete(brand)
    db.commit()
    return {"deleted": True, "id": brand_id}


def snapshot(attribute: Attribute) -> dict[str, Any]:
    return {
        "name": attribute.name,
        "data_type": attribute.data_type,
        "unit": attribute.unit,
        "required": attribute.required,
        "default_value": attribute.default_value,
        "options": normalize_options(attribute.options),
        "description": attribute.description,
        "source": attribute.source,
        "enabled": attribute.enabled,
    }


def add_change(
    attribute: Attribute,
    fields: list[str],
    before_values: dict[str, Any],
    after_values: dict[str, Any],
    operator: str,
) -> None:
    attribute.changes.append(
        AttributeChange(
            attribute_code=attribute.code,
            attribute_name=attribute.name,
            version=attribute.version,
            operator=operator,
            changed_fields=json.dumps(fields, ensure_ascii=False),
            before_values=json.dumps(before_values, ensure_ascii=False),
            after_values=json.dumps(after_values, ensure_ascii=False),
        )
    )
