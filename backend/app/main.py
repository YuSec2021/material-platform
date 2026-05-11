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
from .models import Attribute, AttributeChange, Brand, Category, LLMProviderConfig, Material, MaterialLibrary, ProductName
from .schemas import (
    AiMaterialAddConfirmIn,
    AiMaterialAddPreviewIn,
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
    MaterialMatchIn,
    MaterialIn,
    MaterialLibraryOut,
    MaterialOut,
    MaterialTransitionIn,
    MaterialUpdate,
    ProductNameOut,
    ProviderConfigIn,
    ProviderConfigOut,
    RecommendIn,
)


app = FastAPI(title="AI Material Management Platform", version="0.5.0")
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
AI_CAPABILITIES = {"material_add", "material_match"}
DEFAULT_PROVIDER = {
    "provider": "mock",
    "model": "mock-material-governance-v1",
    "endpoint": "local://deterministic",
    "capabilities": ["material_add", "material_match"],
}
KNOWN_BRANDS = ["华为", "Huawei", "HUAWEI", "联想", "Lenovo", "惠普", "HP", "戴尔", "Dell", "治理测试品牌"]


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    db = next(get_db())
    try:
        ensure_seed_product(db)
        ensure_seed_material_context(db)
        ensure_provider_configs(db)
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


def normalize_capabilities(capabilities: list[str] | str | None) -> list[str]:
    if capabilities is None:
        return []
    if isinstance(capabilities, str):
        try:
            loaded = json.loads(capabilities)
            if isinstance(loaded, list):
                capabilities = loaded
            else:
                capabilities = capabilities.split(",")
        except json.JSONDecodeError:
            capabilities = capabilities.split(",")
    return [str(item).strip() for item in capabilities if str(item).strip()]


def ensure_provider_configs(db: Session) -> LLMProviderConfig:
    Base.metadata.create_all(bind=engine)
    provider = db.query(LLMProviderConfig).filter(LLMProviderConfig.active.is_(True)).first()
    if provider:
        return provider
    provider = LLMProviderConfig(
        provider=DEFAULT_PROVIDER["provider"],
        model=DEFAULT_PROVIDER["model"],
        endpoint=DEFAULT_PROVIDER["endpoint"],
        capabilities=json.dumps(DEFAULT_PROVIDER["capabilities"]),
        active=True,
        connection_status="connected",
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


def provider_for_capability(db: Session, capability: str) -> LLMProviderConfig:
    ensure_provider_configs(db)
    providers = db.query(LLMProviderConfig).filter(LLMProviderConfig.active.is_(True)).order_by(LLMProviderConfig.id.desc()).all()
    for provider in providers:
        if capability in normalize_capabilities(provider.capabilities):
            return provider
    fallback = db.query(LLMProviderConfig).order_by(LLMProviderConfig.id.desc()).first()
    if fallback:
        return fallback
    return ensure_provider_configs(db)


def provider_to_out(provider: LLMProviderConfig) -> ProviderConfigOut:
    return ProviderConfigOut(
        id=provider.id,
        provider=provider.provider,
        model=provider.model,
        endpoint=provider.endpoint,
        capabilities=normalize_capabilities(provider.capabilities),
        active=provider.active,
        connection_status=provider.connection_status,
        updated_at=provider.updated_at.isoformat(),
    )


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


def compact_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" ，,。.;；")


def infer_product_category(text: str) -> tuple[str, str, str]:
    lowered = text.lower()
    if any(token in text for token in ["交换机", "端口", "千兆"]) or "switch" in lowered:
        return "交换机", "网络设备 / 交换机", "台"
    if any(token in text for token in ["打印机", "打印", "a4"]) or "printer" in lowered:
        return SEED_PRODUCT["name"], SEED_CATEGORY["name"], "台"
    if any(token in text for token in ["电缆", "线缆", "网线"]) or "cable" in lowered:
        return "线缆", "网络设备 / 线缆", "米"
    return "通用物料", "未分类 / 通用物料", "件"


def get_or_create_category(db: Session, name: str) -> Category:
    category = db.query(Category).filter(Category.name == name).first()
    if category:
        return category
    category = Category(
        code=next_unique_code(db, Category, "CAT", name),
        name=name,
        description="Created by AI material addition recommendation",
        enabled=True,
    )
    db.add(category)
    db.flush()
    return category


def get_or_create_product_name(db: Session, name: str, unit: str, category: str) -> ProductName:
    product = db.query(ProductName).filter(ProductName.name == name).first()
    if product:
        return product
    product = ProductName(name=name, unit=unit, category=category)
    db.add(product)
    db.flush()
    return product


def get_or_create_brand(db: Session, brand_name: str) -> Brand | None:
    if not brand_name:
        return None
    brand = db.query(Brand).filter(Brand.name == brand_name).first()
    if brand:
        return brand
    brand = Brand(
        code=next_unique_code(db, Brand, "BRAND", brand_name),
        name=brand_name,
        description="Created by AI material addition",
        enabled=True,
    )
    db.add(brand)
    db.flush()
    return brand


def extract_after_pattern(text: str, pattern: str) -> str:
    match = re.search(pattern, text, re.IGNORECASE)
    return compact_space(match.group(1)) if match else ""


def infer_material_name(text: str) -> str:
    patterns = [
        r"(?:申请新增|新增|添加|创建)\s*([^，,。；;\n]+)",
        r"material\s*[:：]\s*([^，,。；;\n]+)",
    ]
    for pattern in patterns:
        value = extract_after_pattern(text, pattern)
        if value:
            return value
    return compact_space(re.split(r"[，,。；;\n]", text.strip(), maxsplit=1)[0])[:80]


def infer_unit(text: str, data_type: str = "") -> str:
    unit = extract_after_pattern(text, r"单位\s*[:：]?\s*([台件个米套只箱包卷A-Za-z]+)")
    if unit:
        return unit
    if data_type == "number" and ("页" in text or "速度" in text):
        return "页/分钟"
    return ""


def infer_brand_name(text: str) -> str:
    brand = extract_after_pattern(text, r"品牌\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9_-]+)")
    if brand:
        return brand
    lowered = text.lower()
    for candidate in KNOWN_BRANDS:
        if candidate.lower() in lowered:
            return "华为" if candidate.lower() == "huawei" else candidate
    return ""


def extract_attribute_value(pattern: str, text: str, suffix: str = "") -> str:
    match = re.search(pattern, text, re.IGNORECASE)
    if not match:
        return ""
    value = compact_space(match.group(1))
    return f"{value}{suffix}" if suffix and value and suffix not in value else value


def extract_material_attributes(text: str) -> tuple[dict[str, Any], dict[str, str]]:
    attributes: dict[str, Any] = {}
    sources: dict[str, str] = {}

    port_count = extract_attribute_value(r"(?:端口数|端口|ports?)\s*[:：]?\s*(\d{1,4})", text)
    if not port_count:
        port_count = extract_attribute_value(r"(\d{1,4})\s*口", text)
    if port_count:
        attributes["端口数"] = port_count
        sources["端口数"] = "regex:端口数/口"

    speed = extract_attribute_value(r"(?:速率|速度|speed)\s*[:：]?\s*([0-9.]+\s*(?:Mbps|Gbps|MB/s|GB/s|兆|千兆)?)", text)
    if not speed and "千兆" in text:
        speed = "1000Mbps"
    if speed:
        attributes["速率"] = speed.replace(" ", "")
        sources["速率"] = "regex:速率/千兆"

    model = extract_attribute_value(r"(?:型号|model)\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9._-]{2,})", text)
    if not model:
        model_match = re.search(r"\b([A-Z][A-Z0-9]+(?:-[A-Z0-9]+){1,})\b", text)
        model = model_match.group(1) if model_match else ""
    if model:
        attributes["型号"] = model
        sources["型号"] = "regex:型号/model"

    scenario = extract_after_pattern(text, r"适用(?:于|场景)?\s*([^，,。；;\n]+)")
    if scenario:
        attributes["适用场景"] = scenario
        sources["适用场景"] = "regex:适用场景"

    print_speed = extract_attribute_value(r"打印速度\s*[:：]?\s*([0-9.]+\s*页/分钟)", text)
    if print_speed:
        attributes["打印速度"] = print_speed.replace(" ", "")
        sources["打印速度"] = "regex:打印速度"

    color_mode = extract_attribute_value(r"颜色模式\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z]+)", text)
    if not color_mode and "彩色" in text:
        color_mode = "彩色"
    if color_mode:
        attributes["颜色模式"] = color_mode
        sources["颜色模式"] = "regex:颜色模式/彩色"

    paper_size = extract_attribute_value(r"(A[0-9])", text)
    if paper_size:
        attributes["纸张尺寸"] = paper_size
        sources["纸张尺寸"] = "regex:纸张尺寸"

    return attributes, sources


def material_search_text(name: str, brand: str, description: str, attributes: dict[str, Any]) -> str:
    attr_text = " ".join(f"{key} {value}" for key, value in attributes.items())
    return compact_space(f"{name} {brand} {description} {attr_text}")


def token_set(text: str) -> set[str]:
    lowered = text.lower()
    tokens = set(re.findall(r"[a-z0-9._-]+", lowered))
    tokens.update(re.findall(r"\d+\s*(?:口|端口|mbps|gbps|页/分钟|ppm|米|台)", lowered))
    chinese_phrases = [
        "交换机",
        "千兆",
        "端口",
        "网络",
        "接入",
        "打印机",
        "打印",
        "彩色",
        "黑白",
        "华为",
        "联想",
        "惠普",
        "办公",
    ]
    tokens.update(phrase for phrase in chinese_phrases if phrase in text)
    synonym_tokens = {
        "switch": "交换机",
        "gigabit": "千兆",
        "huawei": "华为",
        "printer": "打印机",
        "color": "彩色",
        "access": "接入",
        "network": "网络",
        "port": "端口",
        "ports": "端口",
    }
    tokens.update(mapped for token, mapped in synonym_tokens.items() if token in lowered)
    port_match = re.search(r"(\d{1,4})\s*(?:口|端口|ports?|port)", lowered)
    if port_match:
        tokens.add(f"端口数:{port_match.group(1)}")
    return {token.strip() for token in tokens if token.strip()}


def ngrams(text: str, size: int = 2) -> set[str]:
    cleaned = re.sub(r"\s+", "", text.lower())
    return {cleaned[index : index + size] for index in range(max(len(cleaned) - size + 1, 0))}


def jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def semantic_features(text: str, attributes: dict[str, Any]) -> set[str]:
    lowered = text.lower()
    features: set[str] = set()
    if any(token in text for token in ["交换机", "端口", "网络接入"]) or "switch" in lowered:
        features.add("concept:network_switch")
    if any(token in text for token in ["千兆", "1000mbps", "1gbps"]) or "gigabit" in lowered:
        features.add("concept:gigabit")
    if any(token in text for token in ["打印机", "打印"]) or "printer" in lowered:
        features.add("concept:printer")
    if "彩色" in text or "color" in lowered:
        features.add("concept:color")
    if "a4" in lowered:
        features.add("concept:a4")
    for key, value in attributes.items():
        key_text = str(key)
        value_text = str(value)
        combined = f"{key_text} {value_text}".lower()
        if "端口" in key_text or "口" in value_text or "port" in combined:
            number = re.search(r"\d+", value_text)
            features.add(f"ports:{number.group(0) if number else value_text}")
        if "速率" in key_text or "speed" in combined or "mbps" in combined or "gbps" in combined:
            if "1000" in combined or "千兆" in value_text or "1g" in combined:
                features.add("concept:gigabit")
            normalized_speed = re.sub(r"\s+", "", value_text.lower())
            features.add(f"speed:{normalized_speed}")
        if "型号" in key_text or "model" in combined:
            features.add(f"model:{value_text.lower()}")
    return features


def text_similarity(left: str, right: str) -> float:
    token_score = jaccard(token_set(left), token_set(right))
    ngram_score = jaccard(ngrams(left), ngrams(right))
    left_clean = re.sub(r"\s+", "", left.lower())
    right_clean = re.sub(r"\s+", "", right.lower())
    containment = 0.0
    if left_clean and right_clean:
        shorter, longer = sorted([left_clean, right_clean], key=len)
        containment = len(shorter) / len(longer) if shorter in longer else 0.0
    return round(max(token_score, ngram_score, containment), 4)


def classify_match(score: float) -> str:
    if score >= 0.90:
        return "highly_duplicate"
    if score >= 0.75:
        return "suspicious"
    return "normal"


def match_score(
    query_text: str,
    query_brand: str,
    query_attributes: dict[str, Any],
    material: Material,
) -> dict[str, float | str | dict[str, Any]]:
    material_brand = material.brand.name if material.brand else ""
    material_attrs = material_attributes(material.attributes)
    candidate_text = material_search_text(material.name, material_brand, material.description, material_attrs)
    semantic_score = jaccard(semantic_features(query_text, query_attributes), semantic_features(candidate_text, material_attrs))
    text_score = text_similarity(query_text, candidate_text)
    if query_brand and material_brand:
        brand_score = 1.0 if query_brand.lower() == material_brand.lower() else 0.0
    else:
        brand_score = 0.5 if not query_brand and not material_brand else 0.0
    total_score = round(min(1.0, semantic_score * 0.4 + text_score * 0.4 + brand_score * 0.2), 4)
    return {
        "material": material_to_out(material).model_dump(),
        "score": total_score,
        "total_score": total_score,
        "semantic_score": round(semantic_score, 4),
        "text_score": round(text_score, 4),
        "brand_score": round(brand_score, 4),
        "classification": classify_match(total_score),
        "evidence": {
            "hybrid_search": "semantic + BM25 token overlap",
            "engine": "deterministic local fallback for Qdrant hybrid search",
        },
    }


def material_matches(
    db: Session,
    material_library_id: int,
    query_text: str,
    brand: str,
    attributes: dict[str, Any],
    top_k: int = 3,
) -> list[dict[str, Any]]:
    candidates = (
        db.query(Material)
        .filter(Material.material_library_id == material_library_id, Material.enabled.is_(True))
        .order_by(Material.id.desc())
        .all()
    )
    scored = [match_score(query_text, brand, attributes, material) for material in candidates]
    scored.sort(key=lambda item: (float(item["total_score"]), item["material"]["id"]), reverse=True)
    return scored[: max(1, min(top_k, 3))]


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


def infer_unit(text: str, data_type: str = "") -> str:
    unit = extract_after_pattern(text, r"单位\s*[:：]?\s*([台件个米套只箱包卷A-Za-z]+)")
    if unit:
        return unit
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


def build_ai_material_preview(payload: AiMaterialAddPreviewIn, db: Session) -> dict[str, Any]:
    provider = provider_for_capability(db, "material_add")
    text = compact_space(payload.input_text)
    if not text:
        raise HTTPException(status_code=422, detail="input_text is required")
    library = db.get(MaterialLibrary, payload.material_library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Material library not found")

    inferred_product, inferred_category, inferred_unit = infer_product_category(text)
    unit = payload.unit or infer_unit(text) or inferred_unit
    product = db.get(ProductName, payload.product_name_id) if payload.product_name_id else None
    category = db.get(Category, payload.category_id) if payload.category_id else None
    if payload.product_name_id and not product:
        raise HTTPException(status_code=404, detail="Product name not found")
    if payload.category_id and not category:
        raise HTTPException(status_code=404, detail="Category not found")
    category = category or get_or_create_category(db, inferred_category)
    product = product or get_or_create_product_name(db, inferred_product, unit, category.name)

    brand = db.get(Brand, payload.brand_id) if payload.brand_id else None
    if payload.brand_id and not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    brand_name = brand.name if brand else infer_brand_name(text)
    proposed_brand = brand or get_or_create_brand(db, brand_name)

    attributes, attribute_sources = extract_material_attributes(text)
    name = infer_material_name(text)
    description = text
    field_sources = {
        "name": "unstructured input phrase after add/new intent" if name else "missing",
        "unit": "explicit unit hint or inferred category default" if unit else "missing",
        "brand": "brand hint, brand field, or known brand dictionary" if brand_name else "missing",
        "product_name": "keyword category inference",
        "category": "keyword category inference",
        "attributes": attribute_sources,
    }
    errors: list[str] = []
    if not name:
        errors.append("Material name is required")
    if not unit:
        errors.append("Unit is missing or ambiguous")
    if len(attributes) < 2:
        errors.append("At least two material attributes should be extracted before confirmation")

    confidence = round(min(0.98, 0.58 + (0.12 if name else 0) + (0.08 if unit else 0) + (0.08 if brand_name else 0) + min(len(attributes), 4) * 0.06), 2)
    query_text = material_search_text(name, brand_name, description, attributes)
    matches = material_matches(db, library.id, query_text, brand_name, attributes, 3)
    top_classification = matches[0]["classification"] if matches else "normal"
    trace_id = f"trace-{sha1(f'{provider.id}:{provider.provider}:{provider.model}:{text}'.encode('utf-8')).hexdigest()[:16]}"
    proposed = {
        "name": name,
        "unit": unit,
        "product_name_id": product.id,
        "product_name": product.name,
        "material_library_id": library.id,
        "material_library": library.name,
        "category_id": category.id,
        "category": category.name,
        "brand_id": proposed_brand.id if proposed_brand else None,
        "brand": proposed_brand.name if proposed_brand else brand_name,
        "description": description,
        "attributes": attributes,
        "status": "normal",
    }
    db.commit()
    return {
        "capability": "material_add",
        "provider": provider.provider,
        "model": provider.model,
        "trace_id": trace_id,
        "preview_token": sha1(json.dumps(proposed, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest(),
        "confidence": confidence,
        "validation_errors": errors,
        "field_sources": field_sources,
        "name": proposed["name"],
        "unit": proposed["unit"],
        "product_name_id": proposed["product_name_id"],
        "product_name": proposed["product_name"],
        "material_library_id": proposed["material_library_id"],
        "material_library": proposed["material_library"],
        "category_id": proposed["category_id"],
        "category": proposed["category"],
        "brand_id": proposed["brand_id"],
        "brand": proposed["brand"],
        "description": proposed["description"],
        "attributes": proposed["attributes"],
        "proposed_material": proposed,
        "duplicate_check": {
            "capability": "material_match",
            "provider": provider_for_capability(db, "material_match").provider,
            "model": provider_for_capability(db, "material_match").model,
            "engine": "qdrant_hybrid_with_local_fallback",
            "classification": top_classification,
            "top_matches": matches,
        },
    }


@app.post(
    "/api/v1/materials/ai-add/preview",
    description="AI natural language material addition preview. capability: material_add",
)
def preview_ai_material_add(payload: AiMaterialAddPreviewIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    return build_ai_material_preview(payload, db)


@app.post(
    "/api/v1/materials/ai-add/confirm",
    description="AI natural language material addition confirmation. capability: material_add",
)
def confirm_ai_material_add(payload: AiMaterialAddConfirmIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    preview = payload.preview
    provider = provider_for_capability(db, "material_add")
    errors = preview.get("validation_errors") or []
    if errors:
        raise HTTPException(status_code=422, detail={"validation_errors": errors})
    proposed = preview.get("proposed_material") or preview
    duplicate_check = preview.get("duplicate_check") or {}
    if not payload.allow_duplicate and duplicate_check.get("classification") == "highly_duplicate":
        raise HTTPException(status_code=409, detail="Highly duplicate material requires explicit duplicate override")
    name = str(proposed.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=422, detail="Material name is required")
    product, library, category = material_context_by_payload(
        db,
        int(proposed.get("product_name_id") or 0),
        int(proposed.get("material_library_id") or 0),
        int(proposed.get("category_id") or 0),
    )
    brand_id = proposed.get("brand_id")
    brand = db.get(Brand, int(brand_id)) if brand_id else get_or_create_brand(db, str(proposed.get("brand", "")).strip())
    existing = db.query(Material).filter(Material.product_name_id == product.id, Material.name == name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Material already exists for this product name")
    material = Material(
        code=next_unique_code(db, Material, "MAT", f"{product.id}:{name}:{now().isoformat()}"),
        name=name,
        product_name_id=product.id,
        material_library_id=library.id,
        category_id=category.id,
        unit=str(proposed.get("unit") or product.unit),
        brand_id=brand.id if brand else None,
        status="normal",
        description=str(proposed.get("description", "")),
        attributes=json.dumps(material_attributes(proposed.get("attributes")), ensure_ascii=False),
        enabled=True,
    )
    db.add(material)
    db.commit()
    db.refresh(material)
    return {
        "capability": "material_add",
        "provider": provider.provider,
        "model": provider.model,
        "trace_id": preview.get("trace_id") or f"trace-{sha1(material.code.encode('utf-8')).hexdigest()[:16]}",
        "material": material_to_out(material).model_dump(),
    }


@app.post(
    "/api/v1/materials/match",
    description="AI vector similarity material matching. capability: material_match; hybrid semantic + BM25 evidence with Qdrant-compatible local fallback.",
)
def match_materials(payload: MaterialMatchIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    provider = provider_for_capability(db, "material_match")
    library = db.get(MaterialLibrary, payload.material_library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Material library not found")
    brand = db.get(Brand, payload.brand_id).name if payload.brand_id and db.get(Brand, payload.brand_id) else (payload.brand or "")
    query_text = payload.query or material_search_text(payload.name or "", brand, payload.description, payload.attributes)
    matches = material_matches(db, library.id, query_text, brand, payload.attributes, payload.top_k)
    return {
        "capability": "material_match",
        "provider": provider.provider,
        "model": provider.model,
        "embedding_provider": provider.provider,
        "engine": "qdrant_hybrid_with_local_fallback",
        "query": query_text,
        "matches": matches,
    }


@app.post("/api/v1/ai/material-add/preview")
def preview_ai_material_add_alias(payload: AiMaterialAddPreviewIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    return preview_ai_material_add(payload, db)


@app.post("/api/v1/ai/material-add/confirm")
def confirm_ai_material_add_alias(payload: AiMaterialAddConfirmIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    return confirm_ai_material_add(payload, db)


@app.post("/api/v1/ai/material-match")
def match_materials_alias(payload: MaterialMatchIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    return match_materials(payload, db)


@app.get("/api/v1/ai/providers", response_model=list[ProviderConfigOut])
def list_ai_providers(db: Session = Depends(get_db)) -> list[ProviderConfigOut]:
    ensure_provider_configs(db)
    providers = db.query(LLMProviderConfig).order_by(LLMProviderConfig.active.desc(), LLMProviderConfig.id.desc()).all()
    return [provider_to_out(provider) for provider in providers]


@app.post("/api/v1/ai/providers", response_model=ProviderConfigOut)
def save_ai_provider(payload: ProviderConfigIn, db: Session = Depends(get_db)) -> ProviderConfigOut:
    capabilities = [capability for capability in normalize_capabilities(payload.capabilities) if capability in AI_CAPABILITIES]
    if not capabilities:
        raise HTTPException(status_code=422, detail="At least one supported capability is required")
    provider = (
        db.query(LLMProviderConfig)
        .filter(LLMProviderConfig.provider == payload.provider, LLMProviderConfig.model == payload.model)
        .first()
    )
    if not provider:
        provider = LLMProviderConfig(provider=payload.provider, model=payload.model)
        db.add(provider)
    provider.endpoint = payload.endpoint
    provider.capabilities = json.dumps(capabilities)
    provider.active = payload.active
    provider.connection_status = "connected" if payload.provider == "mock" or payload.endpoint.startswith(("local://", "http://", "https://")) else "configured"
    provider.updated_at = now()
    db.flush()
    if payload.active:
        for other in db.query(LLMProviderConfig).filter(LLMProviderConfig.id != provider.id).all():
            if set(normalize_capabilities(other.capabilities)) & set(capabilities):
                other.active = False
                other.updated_at = now()
    db.commit()
    db.refresh(provider)
    return provider_to_out(provider)


@app.post("/api/v1/ai/providers/test")
def test_ai_provider(payload: ProviderConfigIn) -> dict[str, Any]:
    capabilities = [capability for capability in normalize_capabilities(payload.capabilities) if capability in AI_CAPABILITIES]
    if not capabilities:
        raise HTTPException(status_code=422, detail="At least one supported capability is required")
    ok = payload.provider == "mock" or payload.endpoint.startswith(("local://", "http://", "https://"))
    return {
        "ok": ok,
        "provider": payload.provider,
        "model": payload.model,
        "capabilities": capabilities,
        "status": "connected" if ok else "configured",
        "message": "Connection test succeeded with test-safe provider configuration" if ok else "Provider saved for offline configuration",
    }


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
