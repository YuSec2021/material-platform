from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from hashlib import sha1
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import Attribute, AttributeChange, Brand, ProductName
from .schemas import (
    AttributeIn,
    AttributeOut,
    AttributeUpdate,
    BrandIn,
    BrandLogo,
    BrandOut,
    BrandUpdate,
    ChangeOut,
    GovernanceImportIn,
    GovernancePreviewIn,
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


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    db = next(get_db())
    try:
        ensure_seed_product(db)
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


def next_unique_code(db: Session, model: type[Attribute] | type[Brand], prefix: str, seed: str) -> str:
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
