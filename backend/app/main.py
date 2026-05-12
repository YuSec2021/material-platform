from __future__ import annotations

import json
import os
import re
import base64
import binascii
import csv
import secrets
import time
import uuid
import zipfile
from dataclasses import dataclass
from functools import wraps
from io import BytesIO, StringIO
from datetime import datetime, timezone
from hashlib import sha1, sha256
from typing import Any, Callable
from xml.sax.saxutils import escape as xml_escape

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine, get_db
from .models import (
    Attribute,
    AttributeChange,
    AuditLog,
    Brand,
    CapabilityModelMapping,
    Category,
    FeaturePermission,
    LLMProviderConfig,
    Material,
    MaterialLibrary,
    ModelConfig,
    ProductName,
    Role,
    RoleUser,
    SystemConfig,
    TracerSpan,
    User,
    WorkflowApplication,
    WorkflowHistory,
)
from .schemas import (
    AiMaterialAddConfirmIn,
    AiMaterialAddPreviewIn,
    AuditLogListOut,
    AuditLogOut,
    AuthLoginIn,
    AuthUserOut,
    AttributeIn,
    AttributeOut,
    AttributeUpdate,
    BrandIn,
    BrandLogo,
    BrandOut,
    BrandUpdate,
    CapabilityMappingIn,
    CapabilityMappingOut,
    CategoryOut,
    ChangeOut,
    GatewayInvokeIn,
    GovernanceImportIn,
    GovernancePreviewIn,
    MaterialGovernanceImportIn,
    MaterialGovernancePreviewIn,
    MaterialMatchIn,
    MaterialIn,
    MaterialLibraryIn,
    MaterialLibraryOut,
    MaterialLibraryUpdate,
    MaterialOut,
    MaterialTransitionIn,
    MaterialUpdate,
    ManualStopPurchaseIn,
    ProductNameOut,
    ProviderConfigIn,
    ProviderConfigOut,
    RecommendIn,
    PermissionEntry,
    PasswordResetOut,
    RoleIn,
    RoleOut,
    RolePermissionsIn,
    RolePermissionsOut,
    RoleUpdate,
    RoleUserBindingIn,
    RoleUserReplaceIn,
    ReasonOption,
    SystemConfigIn,
    SystemIcon,
    SystemConfigOut,
    TraceDetailOut,
    TraceSummaryOut,
    UserIn,
    UserOut,
    UserSummaryOut,
    UserUpdate,
    WorkflowActionIn,
    WorkflowApplicationIn,
    WorkflowApplicationOut,
    WorkflowHistoryOut,
)


app = FastAPI(title="AI Material Management Platform", version="0.5.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def operational_audit_middleware(request: Request, call_next: Callable):
    response = await call_next(request)
    mutating = request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.url.path.startswith("/api/v1/")
    excluded = request.url.path.startswith("/api/v1/audit-logs") or request.url.path.startswith("/api/v1/auth/")
    if mutating and not excluded and response.status_code < 400:
        db = SessionLocal()
        try:
            ensure_audit_log_schema()
            try:
                auth = current_auth(request, db)
            except Exception:
                auth = None
            source = "AI" if "/ai/" in request.url.path else "human"
            add_audit_log(
                db,
                auth,
                request.url.path.removeprefix("/api/v1/"),
                request.method.lower(),
                {},
                {"status_code": response.status_code, "path": request.url.path},
                source,
            )
            db.commit()
        finally:
            db.close()
    return response

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
AI_CAPABILITIES = {"material_add", "material_match", "category_match", "material_analysis", "attr_recommend", "material_governance"}
APPROVAL_MODES = {"simple", "multi_node"}
APPLICATION_TYPES = {"new_category", "new_material_code", "stop_purchase", "stop_use"}
TERMINAL_WORKFLOW_STATUSES = {"approved", "rejected"}
USER_STATUSES = {"active", "disabled"}
ACCOUNT_OWNERSHIPS = {"HCM", "local"}
SYSTEM_CONFIG_KEY = "system_configuration"
DEFAULT_SYSTEM_NAME = "AI Material Management Platform"
DEFAULT_SYSTEM_ICON = {
    "filename": "default-system-icon.svg",
    "content_type": "image/svg+xml",
    "data_url": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23205493'/%3E%3Cpath d='M18 42V22h9l5 10 5-10h9v20h-7V31l-5 11h-4l-5-11v11z' fill='white'/%3E%3C/svg%3E",
}
DEFAULT_STOP_PURCHASE_REASONS = ["供应商停产", "质量风险停采", "战略替代物料", "采购目录清理"]
DEFAULT_STOP_USE_REASONS = ["长期无库存且无业务需求", "安全合规风险", "技术标准淘汰", "资产归档完成"]
DEFAULT_PROVIDER = {
    "provider": "mock",
    "model": "mock-material-governance-v1",
    "endpoint": "local://deterministic",
    "capabilities": ["material_add", "material_match"],
}
KNOWN_BRANDS = ["华为", "Huawei", "HUAWEI", "联想", "Lenovo", "惠普", "HP", "戴尔", "Dell", "治理测试品牌"]
HCM_SEED_USERS = [
    {
        "username": "hcm_zhangsan",
        "display_name": "张三",
        "hcm_id": "HCM-1001",
        "unit": "华东事业部",
        "department": "采购管理部",
        "team": "标准化一组",
        "email": "zhangsan@example.com",
    },
    {
        "username": "hcm_lisi",
        "display_name": "李四",
        "hcm_id": "HCM-1002",
        "unit": "华北事业部",
        "department": "资产管理部",
        "team": "物料治理组",
        "email": "lisi@example.com",
    },
]
PERMISSION_CATALOG = [
    {"module": "material_archives", "permission_type": "directory", "permission_key": "directory.material_archives", "label": "Material Archives Directory"},
    {"module": "attribute_management", "permission_type": "directory", "permission_key": "directory.attribute_management", "label": "Attribute Management Directory"},
    {"module": "material_library", "permission_type": "directory", "permission_key": "directory.material_library", "label": "Material Library Directory"},
    {"module": "workflow", "permission_type": "directory", "permission_key": "directory.workflow", "label": "Workflow Directory"},
    {"module": "system_admin", "permission_type": "directory", "permission_key": "directory.system_admin", "label": "System Admin Directory"},
    {"module": "category_management", "permission_type": "directory", "permission_key": "directory.category_management", "label": "Category Management Directory"},
    {"module": "brand_management", "permission_type": "directory", "permission_key": "directory.brand_management", "label": "Brand Management Directory"},
    {"module": "product_name_management", "permission_type": "directory", "permission_key": "directory.product_name_management", "label": "Product Name Directory"},
    {"module": "material_archives", "permission_type": "button", "permission_key": "button.material_archives.create", "label": "Material Archive Create"},
    {"module": "material_archives", "permission_type": "button", "permission_key": "button.material_archives.edit", "label": "Material Archive Edit"},
    {"module": "material_archives", "permission_type": "button", "permission_key": "button.material_archives.delete", "label": "Material Archive Delete"},
    {"module": "material_archives", "permission_type": "button", "permission_key": "button.material_archives.import", "label": "Material Archive Import"},
    {"module": "material_archives", "permission_type": "button", "permission_key": "button.material_archives.export", "label": "Material Archive Export"},
    {"module": "material_archives", "permission_type": "button", "permission_key": "button.material_archives.approval", "label": "Material Lifecycle Approval"},
    {"module": "material_library", "permission_type": "button", "permission_key": "button.material_library.create", "label": "Material Library Create"},
    {"module": "material_library", "permission_type": "button", "permission_key": "button.material_library.edit", "label": "Material Library Edit"},
    {"module": "material_library", "permission_type": "button", "permission_key": "button.material_library.delete", "label": "Material Library Delete"},
    {"module": "material_library", "permission_type": "button", "permission_key": "button.material_library.import", "label": "Material Library Import"},
    {"module": "material_library", "permission_type": "button", "permission_key": "button.material_library.export", "label": "Material Library Export"},
    {"module": "material_library", "permission_type": "button", "permission_key": "button.material_library.approval", "label": "Material Library Approval"},
    {"module": "attribute_management", "permission_type": "button", "permission_key": "button.attribute_management.create", "label": "Attribute Create"},
    {"module": "attribute_management", "permission_type": "button", "permission_key": "button.attribute_management.edit", "label": "Attribute Edit"},
    {"module": "attribute_management", "permission_type": "button", "permission_key": "button.attribute_management.delete", "label": "Attribute Delete"},
    {"module": "attribute_management", "permission_type": "button", "permission_key": "button.attribute_management.import", "label": "Attribute Import"},
    {"module": "attribute_management", "permission_type": "button", "permission_key": "button.attribute_management.export", "label": "Attribute Export"},
    {"module": "workflow", "permission_type": "button", "permission_key": "button.workflow.submit", "label": "Workflow Submit"},
    {"module": "workflow", "permission_type": "button", "permission_key": "button.workflow.approve", "label": "Workflow Approve"},
    {"module": "workflow", "permission_type": "button", "permission_key": "button.workflow.reject", "label": "Workflow Reject"},
    {"module": "system_admin", "permission_type": "button", "permission_key": "button.users.create", "label": "Create Local User"},
    {"module": "system_admin", "permission_type": "button", "permission_key": "button.users.edit", "label": "Edit Local User"},
    {"module": "system_admin", "permission_type": "button", "permission_key": "button.users.delete", "label": "Delete Local User"},
    {"module": "system_admin", "permission_type": "button", "permission_key": "button.users.reset_password", "label": "Reset Local User Password"},
    {"module": "system_admin", "permission_type": "button", "permission_key": "button.roles.create", "label": "Create Role"},
    {"module": "system_admin", "permission_type": "button", "permission_key": "button.roles.edit", "label": "Edit Role"},
    {"module": "system_admin", "permission_type": "button", "permission_key": "button.roles.delete", "label": "Delete Role"},
    {"module": "system_admin", "permission_type": "button", "permission_key": "button.roles.bind_users", "label": "Bind Role Users"},
    {"module": "system_admin", "permission_type": "button", "permission_key": "button.roles.configure_permissions", "label": "Configure Role Permissions"},
    {"module": "material_library", "permission_type": "api", "permission_key": "api.GET./api/v1/material-libraries", "label": "GET /api/v1/material-libraries"},
    {"module": "material_library", "permission_type": "api", "permission_key": "api.POST./api/v1/material-libraries", "label": "POST /api/v1/material-libraries"},
    {"module": "material_library", "permission_type": "api", "permission_key": "api.GET./api/v1/material-libraries/{library_id}", "label": "GET /api/v1/material-libraries/{library_id}"},
    {"module": "material_library", "permission_type": "api", "permission_key": "api.PUT./api/v1/material-libraries/{library_id}", "label": "PUT /api/v1/material-libraries/{library_id}"},
    {"module": "material_library", "permission_type": "api", "permission_key": "api.DELETE./api/v1/material-libraries/{library_id}", "label": "DELETE /api/v1/material-libraries/{library_id}"},
    {"module": "material_archives", "permission_type": "api", "permission_key": "api.GET./api/v1/materials", "label": "GET /api/v1/materials"},
    {"module": "material_archives", "permission_type": "api", "permission_key": "api.POST./api/v1/materials", "label": "POST /api/v1/materials"},
    {"module": "material_archives", "permission_type": "api", "permission_key": "api.GET./api/v1/materials/{material_id}", "label": "GET /api/v1/materials/{material_id}"},
    {"module": "material_archives", "permission_type": "api", "permission_key": "api.PUT./api/v1/materials/{material_id}", "label": "PUT /api/v1/materials/{material_id}"},
    {"module": "material_archives", "permission_type": "api", "permission_key": "api.DELETE./api/v1/materials/{material_id}", "label": "DELETE /api/v1/materials/{material_id}"},
    {"module": "material_archives", "permission_type": "api", "permission_key": "api.PATCH./api/v1/materials/{material_id}/stop-purchase", "label": "PATCH /api/v1/materials/{material_id}/stop-purchase"},
    {"module": "material_archives", "permission_type": "api", "permission_key": "api.POST./api/v1/materials/{material_id}/transition", "label": "POST /api/v1/materials/{material_id}/transition"},
    {"module": "material_archives", "permission_type": "api", "permission_key": "api.POST./api/v1/materials/governance/preview", "label": "POST /api/v1/materials/governance/preview"},
    {"module": "material_archives", "permission_type": "api", "permission_key": "api.POST./api/v1/materials/governance/import", "label": "POST /api/v1/materials/governance/import"},
    {"module": "material_archives", "permission_type": "api", "permission_key": "api.POST./api/v1/materials/ai-add/preview", "label": "POST /api/v1/materials/ai-add/preview"},
    {"module": "material_archives", "permission_type": "api", "permission_key": "api.POST./api/v1/materials/ai-add/confirm", "label": "POST /api/v1/materials/ai-add/confirm"},
    {"module": "material_archives", "permission_type": "api", "permission_key": "api.POST./api/v1/materials/match", "label": "POST /api/v1/materials/match"},
    {"module": "attribute_management", "permission_type": "api", "permission_key": "api.GET./api/v1/attributes", "label": "GET /api/v1/attributes"},
    {"module": "attribute_management", "permission_type": "api", "permission_key": "api.POST./api/v1/attributes", "label": "POST /api/v1/attributes"},
    {"module": "attribute_management", "permission_type": "api", "permission_key": "api.PUT./api/v1/attributes/{attribute_id}", "label": "PUT /api/v1/attributes/{attribute_id}"},
    {"module": "attribute_management", "permission_type": "api", "permission_key": "api.DELETE./api/v1/attributes/{attribute_id}", "label": "DELETE /api/v1/attributes/{attribute_id}"},
    {"module": "attribute_management", "permission_type": "api", "permission_key": "api.GET./api/v1/attributes/changes", "label": "GET /api/v1/attributes/changes"},
    {"module": "attribute_management", "permission_type": "api", "permission_key": "api.GET./api/v1/attributes/{attribute_id}/changes", "label": "GET /api/v1/attributes/{attribute_id}/changes"},
    {"module": "attribute_management", "permission_type": "api", "permission_key": "api.POST./api/v1/attributes/governance/preview", "label": "POST /api/v1/attributes/governance/preview"},
    {"module": "attribute_management", "permission_type": "api", "permission_key": "api.POST./api/v1/attributes/governance/import", "label": "POST /api/v1/attributes/governance/import"},
    {"module": "attribute_management", "permission_type": "api", "permission_key": "api.POST./api/v1/ai/attribute-recommend", "label": "POST /api/v1/ai/attribute-recommend"},
    {"module": "workflow", "permission_type": "api", "permission_key": "api.GET./api/v1/workflows/applications", "label": "GET /api/v1/workflows/applications"},
    {"module": "workflow", "permission_type": "api", "permission_key": "api.POST./api/v1/workflows/applications", "label": "POST /api/v1/workflows/applications"},
    {"module": "workflow", "permission_type": "api", "permission_key": "api.GET./api/v1/workflows/applications/{application_id}", "label": "GET /api/v1/workflows/applications/{application_id}"},
    {"module": "workflow", "permission_type": "api", "permission_key": "api.POST./api/v1/workflows/applications/{application_id}/approve", "label": "POST /api/v1/workflows/applications/{application_id}/approve"},
    {"module": "workflow", "permission_type": "api", "permission_key": "api.POST./api/v1/workflows/applications/{application_id}/reject", "label": "POST /api/v1/workflows/applications/{application_id}/reject"},
    {"module": "workflow", "permission_type": "api", "permission_key": "api.GET./api/v1/workflows/tasks", "label": "GET /api/v1/workflows/tasks"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.GET./api/v1/users", "label": "GET /api/v1/users"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.POST./api/v1/users", "label": "POST /api/v1/users"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.GET./api/v1/users/{user_id}", "label": "GET /api/v1/users/{user_id}"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.PUT./api/v1/users/{user_id}", "label": "PUT /api/v1/users/{user_id}"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.DELETE./api/v1/users/{user_id}", "label": "DELETE /api/v1/users/{user_id}"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.POST./api/v1/users/{user_id}/password-reset", "label": "POST /api/v1/users/{user_id}/password-reset"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.GET./api/v1/roles", "label": "GET /api/v1/roles"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.POST./api/v1/roles", "label": "POST /api/v1/roles"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.GET./api/v1/roles/{role_id}", "label": "GET /api/v1/roles/{role_id}"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.PUT./api/v1/roles/{role_id}", "label": "PUT /api/v1/roles/{role_id}"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.DELETE./api/v1/roles/{role_id}", "label": "DELETE /api/v1/roles/{role_id}"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.PATCH./api/v1/roles/{role_id}/enable", "label": "PATCH /api/v1/roles/{role_id}/enable"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.PATCH./api/v1/roles/{role_id}/disable", "label": "PATCH /api/v1/roles/{role_id}/disable"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.GET./api/v1/roles/{role_id}/users", "label": "GET /api/v1/roles/{role_id}/users"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.POST./api/v1/roles/{role_id}/users", "label": "POST /api/v1/roles/{role_id}/users"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.PUT./api/v1/roles/{role_id}/users", "label": "PUT /api/v1/roles/{role_id}/users"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.DELETE./api/v1/roles/{role_id}/users/{user_id}", "label": "DELETE /api/v1/roles/{role_id}/users/{user_id}"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.GET./api/v1/roles/{role_id}/permissions", "label": "GET /api/v1/roles/{role_id}/permissions"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.PUT./api/v1/roles/{role_id}/permissions", "label": "PUT /api/v1/roles/{role_id}/permissions"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.GET./api/v1/permissions/catalog", "label": "GET /api/v1/permissions/catalog"},
    {"module": "category_management", "permission_type": "api", "permission_key": "api.GET./api/v1/categories", "label": "GET /api/v1/categories"},
    {"module": "product_name_management", "permission_type": "api", "permission_key": "api.GET./api/v1/product-names", "label": "GET /api/v1/product-names"},
    {"module": "brand_management", "permission_type": "api", "permission_key": "api.GET./api/v1/brands", "label": "GET /api/v1/brands"},
    {"module": "brand_management", "permission_type": "api", "permission_key": "api.POST./api/v1/brands", "label": "POST /api/v1/brands"},
    {"module": "brand_management", "permission_type": "api", "permission_key": "api.PUT./api/v1/brands/{brand_id}", "label": "PUT /api/v1/brands/{brand_id}"},
    {"module": "brand_management", "permission_type": "api", "permission_key": "api.DELETE./api/v1/brands/{brand_id}", "label": "DELETE /api/v1/brands/{brand_id}"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.GET./api/v1/system/config", "label": "GET /api/v1/system/config"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.PUT./api/v1/system/config", "label": "PUT /api/v1/system/config"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.GET./api/v1/audit-logs", "label": "GET /api/v1/audit-logs"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.GET./api/v1/audit-logs/{log_id}", "label": "GET /api/v1/audit-logs/{log_id}"},
    {"module": "system_admin", "permission_type": "api", "permission_key": "api.GET./api/v1/audit-logs/export", "label": "GET /api/v1/audit-logs/export"},
]


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_audit_log_schema()
    db = next(get_db())
    try:
        ensure_seed_product(db)
        ensure_seed_material_context(db)
        ensure_provider_configs(db)
        ensure_system_config(db)
        ensure_hcm_seed_users(db)
    finally:
        db.close()


def ensure_audit_log_schema() -> None:
    required = {"id", "user", "resource", "action", "before_value", "after_value", "timestamp", "source"}
    with engine.begin() as connection:
        if engine.dialect.name == "sqlite":
            table_exists = connection.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'"
            ).fetchone()
            if table_exists:
                columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(audit_log)").fetchall()}
                if not required.issubset(columns):
                    legacy_name = f"audit_log_legacy_{int(time.time())}"
                    connection.exec_driver_sql(f"ALTER TABLE audit_log RENAME TO {legacy_name}")
                    legacy_indexes = connection.exec_driver_sql(
                        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_audit_log_%'"
                    ).fetchall()
                    for index in legacy_indexes:
                        connection.exec_driver_sql(f"DROP INDEX IF EXISTS {index[0]}")
        AuditLog.__table__.create(bind=connection, checkfirst=True)


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


def encryption_key() -> bytes:
    raw = os.environ.get("LLM_GATEWAY_AES_KEY", "").strip()
    if raw:
        try:
            decoded = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
            if len(decoded) == 32:
                return decoded
        except (ValueError, binascii.Error):
            pass
        return sha256(raw.encode("utf-8")).digest()
    return sha256(b"material-retrieval-local-aes-256-key").digest()


def encrypt_api_key(api_key: str | None) -> str:
    if not api_key:
        return ""
    aes = AESGCM(encryption_key())
    nonce = secrets.token_bytes(12)
    ciphertext = aes.encrypt(nonce, api_key.encode("utf-8"), None)
    return base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")


def decrypt_api_key(encrypted_api_key: str | None) -> str:
    if not encrypted_api_key:
        return ""
    try:
        payload = base64.urlsafe_b64decode(encrypted_api_key.encode("ascii"))
        nonce, ciphertext = payload[:12], payload[12:]
        return AESGCM(encryption_key()).decrypt(nonce, ciphertext, None).decode("utf-8")
    except Exception:
        return ""


def masked_api_key(encrypted_api_key: str | None) -> str:
    api_key = decrypt_api_key(encrypted_api_key)
    if not api_key:
        return ""
    if len(api_key) <= 8:
        return "********"
    return f"{api_key[:2]}{'*' * max(6, len(api_key) - 6)}{api_key[-4:]}"


def provider_display_name(provider: str, model_name: str, fallback: str | None = None) -> str:
    name = compact_space(fallback or "")
    if name:
        return name
    return f"{provider}-{model_name}"


def ai_debug_enabled() -> bool:
    return os.environ.get("AI_DEBUG", "true").strip().lower() in {"1", "true", "yes", "on"}


def ensure_provider_configs(db: Session) -> ModelConfig:
    Base.metadata.create_all(bind=engine)
    provider = db.query(ModelConfig).filter(ModelConfig.enabled.is_(True)).first()
    if provider:
        return provider
    provider = ModelConfig(
        display_name=provider_display_name(DEFAULT_PROVIDER["provider"], DEFAULT_PROVIDER["model"], "Default Mock Model"),
        provider=DEFAULT_PROVIDER["provider"],
        model_name=DEFAULT_PROVIDER["model"],
        base_url=DEFAULT_PROVIDER["endpoint"],
        timeout_seconds=5,
        enabled=True,
        connection_status="connected",
        last_test_message="Local deterministic provider is available",
        last_test_at=now(),
    )
    db.add(provider)
    db.flush()
    for capability in DEFAULT_PROVIDER["capabilities"]:
        db.add(CapabilityModelMapping(capability=capability, primary_model_id=provider.id, enabled=True))
    db.commit()
    db.refresh(provider)
    return provider


def enabled_models_for_mapping(db: Session) -> list[ModelConfig]:
    ensure_provider_configs(db)
    return db.query(ModelConfig).filter(ModelConfig.enabled.is_(True)).order_by(ModelConfig.display_name).all()


def mapping_for_capability(db: Session, capability: str) -> CapabilityModelMapping | None:
    ensure_provider_configs(db)
    return (
        db.query(CapabilityModelMapping)
        .filter(CapabilityModelMapping.capability == capability, CapabilityModelMapping.enabled.is_(True))
        .first()
    )


def default_reason_options(values: list[str]) -> list[dict[str, Any]]:
    return [{"name": value, "enabled": True} for value in values]


def default_system_config() -> dict[str, Any]:
    return {
        "system_name": DEFAULT_SYSTEM_NAME,
        "icon": DEFAULT_SYSTEM_ICON,
        "stop_purchase_reasons": default_reason_options(DEFAULT_STOP_PURCHASE_REASONS),
        "stop_use_reasons": default_reason_options(DEFAULT_STOP_USE_REASONS),
        "approval_mode": "multi_node",
    }


def safe_json_loads(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def normalize_reason_option(value: ReasonOption | str | dict[str, Any]) -> dict[str, Any]:
    if isinstance(value, ReasonOption):
        name = value.name.strip()
        enabled = value.enabled
    elif isinstance(value, dict):
        name = str(value.get("name") or value.get("label") or value.get("value") or "").strip()
        enabled = bool(value.get("enabled", True))
    else:
        name = str(value).strip()
        enabled = True
    if not name:
        raise HTTPException(status_code=422, detail="Reason option name is required")
    return {"name": name, "enabled": enabled}


def normalize_reason_options(values: list[ReasonOption | str] | list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for value in values:
        option = normalize_reason_option(value)
        if option["name"] in seen:
            continue
        normalized.append(option)
        seen.add(option["name"])
    return normalized


def sanitize_icon(icon: SystemIcon | dict[str, Any] | None) -> dict[str, str]:
    if not icon:
        return DEFAULT_SYSTEM_ICON.copy()
    if isinstance(icon, SystemIcon):
        data = icon.model_dump()
    else:
        data = dict(icon)
    return {
        "filename": str(data.get("filename") or "system-icon").strip()[:240],
        "content_type": str(data.get("content_type") or "image/png").strip()[:120],
        "data_url": str(data.get("data_url") or "").strip(),
    }


def system_config_payload(config: SystemConfig) -> dict[str, Any]:
    data = default_system_config()
    loaded = safe_json_loads(config.value, {})
    if isinstance(loaded, dict):
        data.update({key: value for key, value in loaded.items() if key in data})
    if data["approval_mode"] not in APPROVAL_MODES:
        data["approval_mode"] = "multi_node"
    data["system_name"] = compact_space(str(data.get("system_name") or DEFAULT_SYSTEM_NAME)) or DEFAULT_SYSTEM_NAME
    data["icon"] = sanitize_icon(data.get("icon"))
    data["stop_purchase_reasons"] = normalize_reason_options(data.get("stop_purchase_reasons") or default_reason_options(DEFAULT_STOP_PURCHASE_REASONS))
    data["stop_use_reasons"] = normalize_reason_options(data.get("stop_use_reasons") or default_reason_options(DEFAULT_STOP_USE_REASONS))
    return data


def ensure_system_config(db: Session) -> SystemConfig:
    Base.metadata.create_all(bind=engine)
    config = db.query(SystemConfig).filter(SystemConfig.key == SYSTEM_CONFIG_KEY).first()
    if config:
        return config
    legacy = db.query(SystemConfig).filter(SystemConfig.key == "approval_mode").first()
    data = default_system_config()
    if legacy and legacy.value in APPROVAL_MODES:
        data["approval_mode"] = legacy.value
    config = SystemConfig(key=SYSTEM_CONFIG_KEY, value=json.dumps(data, ensure_ascii=False), updated_by="system")
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def ensure_hcm_seed_users(db: Session) -> None:
    Base.metadata.create_all(bind=engine)
    changed = False
    for item in HCM_SEED_USERS:
        user = db.query(User).filter(User.username == item["username"]).first()
        if not user:
            db.add(
                User(
                    **item,
                    account_ownership="HCM",
                    status="active",
                )
            )
            changed = True
        else:
            for field in ["display_name", "hcm_id", "unit", "department", "team", "email"]:
                setattr(user, field, item[field])
            user.account_ownership = "HCM"
            user.status = user.status or "active"
            changed = True
    if changed:
        db.commit()


def approval_mode(db: Session) -> str:
    value = system_config_payload(ensure_system_config(db)).get("approval_mode")
    return value if value in APPROVAL_MODES else "multi_node"


def config_to_out(config: SystemConfig) -> SystemConfigOut:
    data = system_config_payload(config)
    return SystemConfigOut(
        system_name=data["system_name"],
        icon=SystemIcon(**data["icon"]),
        stop_purchase_reasons=[ReasonOption(**item) for item in data["stop_purchase_reasons"]],
        stop_use_reasons=[ReasonOption(**item) for item in data["stop_use_reasons"]],
        approval_mode=data["approval_mode"],
        updated_by=config.updated_by,
        updated_at=config.updated_at.isoformat(),
    )


def redact_sensitive(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            lowered = str(key).lower()
            if any(token in lowered for token in ["api_key", "apikey", "secret", "token", "password", "encrypted_api_key"]):
                redacted[str(key)] = "********"
            else:
                redacted[str(key)] = redact_sensitive(item)
        return redacted
    if isinstance(value, list):
        return [redact_sensitive(item) for item in value]
    return value


def audit_to_out(log: AuditLog) -> AuditLogOut:
    return AuditLogOut(
        id=log.id,
        user=log.user,
        resource=log.resource,
        action=log.action,
        before_value=redact_sensitive(safe_json_loads(log.before_value, {})),
        after_value=redact_sensitive(safe_json_loads(log.after_value, {})),
        timestamp=log.timestamp.isoformat(),
        source=log.source,
    )


def add_audit_log(
    db: Session,
    auth: AuthContext | None,
    resource: str,
    action: str,
    before_value: dict[str, Any] | None,
    after_value: dict[str, Any] | None,
    source: str = "human",
) -> None:
    ensure_audit_log_schema()
    db.add(
        AuditLog(
            user=auth.username if auth else "system",
            resource=resource,
            action=action,
            before_value=json.dumps(redact_sensitive(before_value or {}), ensure_ascii=False, sort_keys=True),
            after_value=json.dumps(redact_sensitive(after_value or {}), ensure_ascii=False, sort_keys=True),
            timestamp=now(),
            source=source,
        )
    )


def provider_for_capability(db: Session, capability: str) -> ModelConfig:
    mapping = mapping_for_capability(db, capability)
    if mapping and mapping.primary_model and mapping.primary_model.enabled:
        return mapping.primary_model
    fallback = db.query(ModelConfig).filter(ModelConfig.enabled.is_(True)).order_by(ModelConfig.id.desc()).first()
    if fallback:
        return fallback
    return ensure_provider_configs(db)


def capabilities_for_model(db: Session, provider: ModelConfig) -> list[str]:
    mappings = (
        db.query(CapabilityModelMapping)
        .filter(
            CapabilityModelMapping.enabled.is_(True),
            or_(
                CapabilityModelMapping.primary_model_id == provider.id,
                CapabilityModelMapping.fallback_model_id == provider.id,
            ),
        )
        .order_by(CapabilityModelMapping.capability)
        .all()
    )
    return [mapping.capability for mapping in mappings]


def provider_to_out(provider: ModelConfig, db: Session) -> ProviderConfigOut:
    capabilities = capabilities_for_model(db, provider)
    return ProviderConfigOut(
        id=provider.id,
        display_name=provider.display_name,
        provider=provider.provider,
        model=provider.model_name,
        model_name=provider.model_name,
        endpoint=provider.base_url,
        base_url=provider.base_url,
        api_key_masked=masked_api_key(provider.encrypted_api_key),
        capabilities=capabilities,
        active=provider.enabled,
        enabled=provider.enabled,
        timeout_seconds=provider.timeout_seconds,
        fallback_model_id=provider.fallback_model_id,
        connection_status=provider.connection_status,
        last_test_message=provider.last_test_message,
        last_test_at=provider.last_test_at.isoformat() if provider.last_test_at else None,
        updated_at=provider.updated_at.isoformat(),
    )


def mapping_to_out(mapping: CapabilityModelMapping) -> CapabilityMappingOut:
    return CapabilityMappingOut(
        id=mapping.id,
        capability=mapping.capability,
        primary_model_id=mapping.primary_model_id,
        primary_model_name=mapping.primary_model.display_name if mapping.primary_model else "",
        fallback_model_id=mapping.fallback_model_id,
        fallback_model_name=mapping.fallback_model.display_name if mapping.fallback_model else "",
        enabled=mapping.enabled,
        updated_at=mapping.updated_at.isoformat(),
    )


class SpanCollector:
    def __init__(self, operation_name: str, capability: str = ""):
        self.trace_id = f"trace-{uuid.uuid4().hex[:20]}"
        self.spans: list[dict[str, Any]] = []
        self.root_span_id = self.start_span(operation_name, "chain", capability=capability)

    def start_span(
        self,
        operation_name: str,
        span_type: str,
        *,
        capability: str = "",
        parent_span_id: str | None = None,
        provider: str = "",
        model: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> str:
        span_id = f"span-{uuid.uuid4().hex[:20]}"
        self.spans.append(
            {
                "trace_id": self.trace_id,
                "span_id": span_id,
                "parent_span_id": parent_span_id if parent_span_id is not None else "",
                "operation_name": operation_name,
                "span_type": span_type,
                "capability": capability,
                "provider": provider,
                "model": model,
                "status": "running",
                "start_time": now(),
                "end_time": None,
                "duration_ms": 0,
                "metadata": metadata or {},
                "error": "",
            }
        )
        return span_id

    def finish_span(self, span_id: str, status: str = "ok", error: str = "", metadata: dict[str, Any] | None = None) -> None:
        ended = now()
        for span in self.spans:
            if span["span_id"] != span_id:
                continue
            span["end_time"] = ended
            span["status"] = status
            span["error"] = error
            if metadata:
                span["metadata"].update(metadata)
            span["duration_ms"] = int((ended - span["start_time"]).total_seconds() * 1000)
            return

    def flush(self, db: Session) -> None:
        for span in self.spans:
            if span["status"] == "running":
                self.finish_span(span["span_id"])
            db.add(
                TracerSpan(
                    trace_id=span["trace_id"],
                    span_id=span["span_id"],
                    parent_span_id=span["parent_span_id"],
                    operation_name=span["operation_name"],
                    span_type=span["span_type"],
                    capability=span["capability"],
                    provider=span["provider"],
                    model=span["model"],
                    status=span["status"],
                    start_time=span["start_time"],
                    end_time=span["end_time"],
                    duration_ms=span["duration_ms"],
                    metadata_json=json.dumps(span["metadata"], ensure_ascii=False),
                    error=span["error"],
                )
            )
        db.commit()


def trace(operation_name: str, span_type: str = "chain") -> Callable:
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            collector: SpanCollector | None = kwargs.get("collector")
            if collector is None:
                return func(*args, **kwargs)
            model = kwargs.get("model_config")
            span_id = collector.start_span(
                operation_name,
                span_type,
                capability=kwargs.get("capability", ""),
                parent_span_id=kwargs.get("parent_span_id") or collector.root_span_id,
                provider=getattr(model, "provider", ""),
                model=getattr(model, "model_name", ""),
                metadata=kwargs.get("metadata") or {},
            )
            try:
                result = func(*args, **kwargs)
                collector.finish_span(span_id, "ok")
                return result
            except Exception as exc:
                collector.finish_span(span_id, "error", str(exc))
                raise

        return wrapper

    return decorator


def model_chat_url(model_config: ModelConfig) -> str:
    base_url = (model_config.base_url or "").rstrip("/")
    if not base_url or base_url.startswith("local://"):
        return ""
    if base_url.endswith("/v1/chat/completions"):
        return base_url
    return f"{base_url}/v1/chat/completions"


def local_model_completion(model_config: ModelConfig, prompt: str, capability: str) -> dict[str, Any]:
    return {
        "content": f"{model_config.model_name} handled {capability}: {prompt}",
        "provider": model_config.provider,
        "model": model_config.model_name,
        "raw": {"local": True},
    }


@trace("llm.provider.chat", "llm")
def call_model_config(
    *,
    model_config: ModelConfig,
    prompt: str,
    messages: list[dict[str, Any]],
    capability: str,
    collector: SpanCollector | None = None,
    parent_span_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if model_config.provider == "mock" or (model_config.base_url or "").startswith("local://"):
        return local_model_completion(model_config, prompt, capability)
    url = model_chat_url(model_config)
    if not url:
        raise RuntimeError("Model base URL is not configured")
    request_messages = messages or [{"role": "user", "content": prompt}]
    headers = {"Content-Type": "application/json"}
    api_key = decrypt_api_key(model_config.encrypted_api_key)
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    started = time.perf_counter()
    response = httpx.post(
        url,
        json={"model": model_config.model_name, "messages": request_messages, "temperature": 0},
        headers=headers,
        timeout=max(1, model_config.timeout_seconds),
    )
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    if response.status_code >= 500:
        raise RuntimeError(f"Provider returned HTTP {response.status_code}")
    if response.status_code >= 400:
        raise RuntimeError(f"Provider rejected request with HTTP {response.status_code}")
    body = response.json()
    content = ""
    choices = body.get("choices") if isinstance(body, dict) else None
    if choices and isinstance(choices, list):
        message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
        content = str(message.get("content") or choices[0].get("text") or "")
    return {
        "content": content,
        "provider": model_config.provider,
        "model": model_config.model_name,
        "latency_ms": elapsed_ms,
        "raw": body,
    }


def test_model_connection(model_config: ModelConfig) -> dict[str, Any]:
    try:
        result = call_model_config(
            model_config=model_config,
            prompt="connection test",
            messages=[{"role": "user", "content": "connection test"}],
            capability="connection_test",
        )
        return {
            "ok": True,
            "status": "connected",
            "message": f"Connection test succeeded for {result['model']}",
        }
    except (httpx.TimeoutException, httpx.ConnectError) as exc:
        return {"ok": False, "status": "failed", "message": f"Connection failed or timed out: {exc}"}
    except Exception as exc:
        return {"ok": False, "status": "failed", "message": str(exc)}


def invoke_gateway_capability(
    db: Session,
    capability: str,
    prompt: str,
    messages: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    mapping = mapping_for_capability(db, capability)
    primary = mapping.primary_model if mapping else provider_for_capability(db, capability)
    fallback = mapping.fallback_model if mapping and mapping.fallback_model_id else None
    if not fallback and primary.fallback_model_id:
        fallback = db.get(ModelConfig, primary.fallback_model_id)
    collector = SpanCollector(f"gateway.{capability}", capability)
    attempted: list[dict[str, Any]] = []
    try:
        try:
            result = call_model_config(
                model_config=primary,
                prompt=prompt,
                messages=messages or [],
                capability=capability,
                collector=collector,
                metadata={"role": "primary"},
            )
            attempted.append({"model_id": primary.id, "model": primary.model_name, "status": "ok"})
            collector.finish_span(collector.root_span_id, "ok", metadata={"fallback_used": False, "model": primary.model_name})
            return {
                "capability": capability,
                "trace_id": collector.trace_id,
                "provider": primary.provider,
                "model": primary.model_name,
                "content": result["content"],
                "raw": result.get("raw", {}),
                "fallback_used": False,
                "attempted_models": attempted,
            }
        except Exception as primary_error:
            attempted.append({"model_id": primary.id, "model": primary.model_name, "status": "error", "error": str(primary_error)})
            if not fallback or not fallback.enabled:
                collector.finish_span(collector.root_span_id, "error", str(primary_error), {"fallback_used": False})
                raise
            fallback_span = collector.start_span(
                "gateway.fallback_decision",
                "chain",
                capability=capability,
                parent_span_id=collector.root_span_id,
                metadata={"primary_model": primary.model_name, "reason": str(primary_error), "fallback_model": fallback.model_name},
            )
            collector.finish_span(fallback_span, "ok")
            result = call_model_config(
                model_config=fallback,
                prompt=prompt,
                messages=messages or [],
                capability=capability,
                collector=collector,
                metadata={"role": "fallback"},
            )
            attempted.append({"model_id": fallback.id, "model": fallback.model_name, "status": "ok"})
            collector.finish_span(collector.root_span_id, "ok", metadata={"fallback_used": True, "fallback_reason": str(primary_error)})
            return {
                "capability": capability,
                "trace_id": collector.trace_id,
                "provider": fallback.provider,
                "model": fallback.model_name,
                "content": result["content"],
                "raw": result.get("raw", {}),
                "fallback_used": True,
                "fallback_reason": str(primary_error),
                "attempted_models": attempted,
            }
    finally:
        collector.flush(db)


def model_values_from_payload(payload: ProviderConfigIn) -> dict[str, Any]:
    provider = compact_space(payload.provider or "mock")
    model_name = compact_space(payload.model_name or payload.model or "mock-material-governance-v1")
    display_name = provider_display_name(provider, model_name, payload.display_name or payload.name)
    base_url = compact_space(payload.base_url if payload.base_url is not None else payload.endpoint or "")
    enabled = payload.enabled if payload.enabled is not None else payload.active
    if enabled is None:
        enabled = True
    return {
        "display_name": display_name,
        "provider": provider,
        "model_name": model_name,
        "base_url": base_url,
        "enabled": bool(enabled),
        "timeout_seconds": max(1, min(120, int(payload.timeout_seconds or 10))),
        "fallback_model_id": payload.fallback_model_id,
    }


def apply_model_payload(db: Session, provider: ModelConfig, payload: ProviderConfigIn) -> ModelConfig:
    values = model_values_from_payload(payload)
    fallback_id = values.pop("fallback_model_id")
    if fallback_id:
        fallback = db.get(ModelConfig, fallback_id)
        if not fallback:
            raise HTTPException(status_code=404, detail="Fallback model not found")
        if fallback.id == provider.id:
            raise HTTPException(status_code=422, detail="Fallback model must be different from primary model")
    for field, value in values.items():
        setattr(provider, field, value)
    provider.fallback_model_id = fallback_id
    if payload.api_key and not payload.api_key.startswith("**"):
        provider.encrypted_api_key = encrypt_api_key(payload.api_key)
    provider.updated_at = now()
    db.flush()
    test_result = test_model_connection(provider)
    provider.connection_status = test_result["status"]
    provider.last_test_message = test_result["message"]
    provider.last_test_at = now()
    db.flush()
    sync_model_capabilities(db, provider, payload.capabilities)
    return provider


def sync_model_capabilities(db: Session, provider: ModelConfig, capabilities: list[str] | str | None) -> None:
    requested = [capability for capability in normalize_capabilities(capabilities) if capability in AI_CAPABILITIES]
    if not requested:
        return
    for capability in requested:
        mapping = db.query(CapabilityModelMapping).filter(CapabilityModelMapping.capability == capability).first()
        if not mapping:
            mapping = CapabilityModelMapping(capability=capability, primary_model_id=provider.id, enabled=True)
            db.add(mapping)
        else:
            mapping.primary_model_id = provider.id
            if mapping.fallback_model_id == provider.id:
                mapping.fallback_model_id = None
            mapping.enabled = True
        mapping.updated_at = now()


@dataclass
class AuthContext:
    user: User | None
    username: str
    display_name: str
    permissions: set[str]
    library_scope_ids: set[int] | None
    is_super_admin: bool = False

    def has(self, permission_key: str) -> bool:
        return self.is_super_admin or permission_key in self.permissions


def permission_catalog_entries(db: Session | None = None) -> list[PermissionEntry]:
    entries = [PermissionEntry(**item) for item in PERMISSION_CATALOG]
    if db is not None:
        ensure_seed_material_context(db)
        libraries = db.query(MaterialLibrary).order_by(MaterialLibrary.id).all()
        entries.extend(
            PermissionEntry(
                module="material_library",
                permission_type="scope",
                permission_key=f"scope.material_library.{library.id}",
                label=f"Material Library Scope: {library.name}",
            )
            for library in libraries
        )
    return entries


def permission_catalog_by_key(db: Session | None = None) -> dict[str, PermissionEntry]:
    return {item.permission_key: item for item in permission_catalog_entries(db)}


def super_admin_auth(db: Session | None = None) -> AuthContext:
    scope_ids = None
    permissions = set(permission_catalog_by_key(db).keys())
    return AuthContext(
        user=None,
        username="super_admin",
        display_name="Seeded Administrator",
        permissions=permissions,
        library_scope_ids=scope_ids,
        is_super_admin=True,
    )


def effective_auth_for_user(user: User, db: Session) -> AuthContext:
    if user.status != "active":
        raise HTTPException(status_code=403, detail="User account is disabled")
    permissions: set[str] = set()
    scope_ids: set[int] = set()
    has_scope_permissions = False
    enabled_roles = [link.role for link in user.role_links if link.role.enabled]
    for role in enabled_roles:
        for permission in role.permissions:
            if not permission.enabled:
                continue
            permissions.add(permission.permission_key)
            if permission.permission_key.startswith("scope.material_library."):
                has_scope_permissions = True
                try:
                    scope_ids.add(int(permission.permission_key.rsplit(".", 1)[1]))
                except ValueError:
                    continue
    return AuthContext(
        user=user,
        username=user.username,
        display_name=user.display_name,
        permissions=permissions,
        library_scope_ids=scope_ids if has_scope_permissions else None,
        is_super_admin=False,
    )


def current_auth(request: Request, db: Session) -> AuthContext:
    role_header = request.headers.get("X-User-Role", "").strip()
    if role_header == "super_admin":
        return super_admin_auth(db)
    user_id = request.headers.get("X-User-Id", "").strip()
    username = request.headers.get("X-Username", "").strip()
    if not user_id and not username:
        return super_admin_auth(db)
    user = db.get(User, int(user_id)) if user_id.isdigit() else None
    if not user and username:
        if username == "super_admin":
            return super_admin_auth(db)
        user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=403, detail="Authenticated user not found")
    return effective_auth_for_user(user, db)


def require_api_permission(permission_key: str):
    def dependency(request: Request, db: Session = Depends(get_db)) -> AuthContext:
        auth = current_auth(request, db)
        if not auth.has(permission_key):
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission_key}")
        return auth

    return dependency


def require_button_permission(auth: AuthContext, permission_key: str) -> None:
    if not auth.has(permission_key):
        raise HTTPException(status_code=403, detail=f"Missing permission: {permission_key}")


def is_library_in_scope(auth: AuthContext, library_id: int) -> bool:
    return auth.is_super_admin or auth.library_scope_ids is None or library_id in auth.library_scope_ids


def require_library_scope(auth: AuthContext, library_id: int) -> None:
    if not is_library_in_scope(auth, library_id):
        raise HTTPException(status_code=403, detail="Material library is outside the user's permission scope")


def role_summary(role: Role) -> dict[str, Any]:
    return {"id": role.id, "name": role.name, "code": role.code, "enabled": role.enabled}


def user_summary(user: User) -> UserSummaryOut:
    return UserSummaryOut(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        unit=user.unit,
        department=user.department,
        team=user.team,
        account_ownership=user.account_ownership,
        status=user.status,
    )


def user_to_out(user: User) -> UserOut:
    roles = [role_summary(link.role) for link in sorted(user.role_links, key=lambda link: link.role.name)]
    return UserOut(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        hcm_id=user.hcm_id,
        unit=user.unit,
        department=user.department,
        team=user.team,
        email=user.email,
        account_ownership=user.account_ownership,
        account_owner=user.account_ownership,
        status=user.status,
        roles=roles,
        created_at=user.created_at.isoformat(),
        updated_at=user.updated_at.isoformat(),
    )


def permission_to_entry(permission: FeaturePermission) -> PermissionEntry:
    return PermissionEntry(
        module=permission.module,
        permission_type=permission.permission_type,
        permission_key=permission.permission_key,
        label=permission.label,
    )


def role_to_out(role: Role) -> RoleOut:
    users = [user_summary(link.user) for link in sorted(role.user_links, key=lambda link: link.user.username)]
    permissions = [
        permission_to_entry(permission)
        for permission in sorted(role.permissions, key=lambda item: (item.permission_type, item.permission_key))
        if permission.enabled
    ]
    return RoleOut(
        id=role.id,
        name=role.name,
        code=role.code,
        description=role.description,
        enabled=role.enabled,
        users=users,
        user_count=len(users),
        permissions=permissions,
        created_at=role.created_at.isoformat(),
        updated_at=role.updated_at.isoformat(),
    )


def require_local_user(user: User) -> None:
    if user.account_ownership != "local":
        raise HTTPException(status_code=409, detail="HCM-managed users cannot be locally edited, reset, or deleted")


def validate_user_status(status: str) -> str:
    if status not in USER_STATUSES:
        raise HTTPException(status_code=422, detail="User status must be active or disabled")
    return status


def validate_role_uniqueness(db: Session, name: str, code: str, role_id: int | None = None) -> None:
    query = db.query(Role).filter(or_(Role.name == name, Role.code == code))
    if role_id is not None:
        query = query.filter(Role.id != role_id)
    existing = query.first()
    if existing:
        field = "name" if existing.name == name else "code"
        raise HTTPException(status_code=409, detail=f"Role {field} must be unique")


def get_role_or_404(db: Session, role_id: int) -> Role:
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


def get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def validate_bindable_role(role: Role) -> None:
    if not role.enabled:
        raise HTTPException(status_code=409, detail="Disabled roles cannot be bound to users")


def normalize_permission_payload(payload: RolePermissionsIn, db: Session) -> list[PermissionEntry]:
    catalog = permission_catalog_by_key(db)
    entries: list[PermissionEntry] = []
    seen: set[str] = set()
    for key in payload.permission_keys:
        if key not in catalog:
            raise HTTPException(status_code=422, detail=f"Unknown permission identifier: {key}")
        if key not in seen:
            entries.append(catalog[key])
            seen.add(key)
    for item in payload.permissions:
        if item.permission_key not in catalog:
            raise HTTPException(status_code=422, detail=f"Unknown permission identifier: {item.permission_key}")
        if item.permission_key not in seen:
            entries.append(catalog[item.permission_key])
            seen.add(item.permission_key)
    return entries


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
    attributes = material_attributes(material.attributes)
    lifecycle_history = attributes.get("_lifecycle_history", [])
    if not isinstance(lifecycle_history, list):
        lifecycle_history = []
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
        attributes=attributes,
        lifecycle_history=lifecycle_history,
        enabled=material.enabled,
        created_at=material.created_at.isoformat(),
        updated_at=material.updated_at.isoformat(),
    )


def workflow_payload(value: str | dict[str, Any] | None) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not value:
        return {}
    try:
        loaded = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return loaded if isinstance(loaded, dict) else {}


def history_to_out(item: WorkflowHistory) -> WorkflowHistoryOut:
    return WorkflowHistoryOut(
        id=item.id,
        actor=item.actor,
        node=item.node,
        action=item.action,
        from_status=item.from_status,
        to_status=item.to_status,
        comment=item.comment,
        created_at=item.created_at.isoformat(),
    )


def workflow_to_out(application: WorkflowApplication) -> WorkflowApplicationOut:
    return WorkflowApplicationOut(
        id=application.id,
        application_no=application.application_no,
        type=application.type,
        status=application.status,
        applicant=application.applicant,
        current_node=application.current_node,
        business_reason=application.business_reason,
        rejection_reason=application.rejection_reason,
        data=workflow_payload(application.payload),
        approval_history=[history_to_out(item) for item in application.history],
        created_resource_type=application.created_resource_type,
        created_resource_id=application.created_resource_id,
        created_at=application.created_at.isoformat(),
        updated_at=application.updated_at.isoformat(),
    )


def add_workflow_history(
    application: WorkflowApplication,
    action: str,
    actor: str,
    node: str,
    from_status: str,
    to_status: str,
    comment: str = "",
) -> None:
    application.history.append(
        WorkflowHistory(
            actor=actor,
            node=node,
            action=action,
            from_status=from_status,
            to_status=to_status,
            comment=comment,
        )
    )


def initial_workflow_state(mode: str) -> tuple[str, str]:
    if mode == "simple":
        return "pending_approval", "approver"
    return "pending_department_head", "department_head"


def next_approval_state(current_node: str, mode: str) -> tuple[str, str]:
    if mode == "simple" or current_node == "approver":
        return "approved", "approved"
    if current_node == "department_head":
        return "pending_asset_management", "asset_management"
    if current_node == "asset_management":
        return "approved", "approved"
    raise HTTPException(status_code=409, detail=f"Invalid workflow node for approval: {current_node}")


def application_no(seed: str) -> str:
    return f"APP-{sha1(seed.encode('utf-8')).hexdigest()[:10].upper()}"


def validate_reference_url(value: str) -> str:
    link = value.strip()
    if not re.match(r"^https?://[^\s]+$", link):
        raise HTTPException(status_code=422, detail="A valid reference mall link URL is required")
    return link


def normalize_reference_images(images: list[dict[str, Any] | str]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, image in enumerate(images, start=1):
        if isinstance(image, dict):
            data_url = str(image.get("data_url") or image.get("url") or image.get("content") or "").strip()
            filename = str(image.get("filename") or f"reference-{index}.png")
            content_type = str(image.get("content_type") or "image/png")
        else:
            data_url = str(image).strip()
            filename = f"reference-{index}.png"
            content_type = "image/png"
        if data_url:
            normalized.append({"filename": filename, "content_type": content_type, "data_url": data_url})
    if len(normalized) < 3:
        raise HTTPException(status_code=422, detail="Three required reference images must be uploaded before submission")
    return normalized


def material_summary(material: Material) -> dict[str, Any]:
    return {
        "material_id": material.id,
        "material_code": material.code,
        "material_name": material.name,
        "material_library_id": material.material_library_id,
        "material_library": material.material_library.name,
        "category_id": material.category_id,
        "category": material.category.name,
        "product_name_id": material.product_name_id,
        "product_name": material.product_name.name,
        "current_material_status": material.status,
    }


def required_stop_reason(payload: WorkflowApplicationIn) -> tuple[str, str]:
    reason = (payload.reason or payload.reason_code or "").strip()
    reason_code = (payload.reason_code or reason).strip()
    if not reason:
        raise HTTPException(status_code=422, detail="A stop workflow reason option is required")
    return reason_code, reason


def record_material_lifecycle(
    material: Material,
    from_status: str,
    to_status: str,
    reason: str,
    source: str,
    actor: str,
    application_no: str = "",
) -> None:
    attrs = material_attributes(material.attributes)
    history = attrs.get("_lifecycle_history")
    if not isinstance(history, list):
        history = []
    history.append(
        {
            "from_status": from_status,
            "to_status": to_status,
            "reason": reason,
            "source": source,
            "actor": actor,
            "application_no": application_no,
            "created_at": now().isoformat(),
        }
    )
    attrs["_lifecycle_history"] = history
    material.attributes = json.dumps(attrs, ensure_ascii=False)


def build_stop_workflow_payload(payload: WorkflowApplicationIn, db: Session) -> dict[str, Any]:
    if payload.material_id is None:
        raise HTTPException(status_code=422, detail="Target material is required")
    material = db.get(Material, payload.material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    reason_code, reason = required_stop_reason(payload)
    if payload.type == "stop_purchase":
        if material.status != "normal":
            raise HTTPException(status_code=409, detail="Stop purchase requires a material in normal status")
        target_status = "stop_purchase"
    elif payload.type == "stop_use":
        if material.status != "stop_purchase":
            raise HTTPException(status_code=409, detail="Stop use requires prior stop_purchase status")
        target_status = "stop_use"
    else:
        raise HTTPException(status_code=422, detail="Unsupported stop workflow application type")
    data = material_summary(material)
    data.update(
        {
            "reason_code": reason_code,
            "reason": reason,
            "business_reason": payload.business_reason,
            "from_status": material.status,
            "target_status": target_status,
            "irreversible": payload.type == "stop_use",
            "acknowledge_terminal": payload.acknowledge_terminal,
        }
    )
    return data


def build_workflow_payload(payload: WorkflowApplicationIn, db: Session) -> dict[str, Any]:
    if payload.type not in APPLICATION_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported workflow application type")
    if not payload.business_reason.strip():
        raise HTTPException(status_code=422, detail="Business reason is required")

    if payload.type == "new_category":
        library = db.get(MaterialLibrary, payload.material_library_id) if payload.material_library_id else None
        if not library:
            raise HTTPException(status_code=404, detail="Material library not found")
        name = (payload.proposed_category_name or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="Proposed category name is required")
        parent = db.get(Category, payload.parent_category_id) if payload.parent_category_id else None
        if payload.parent_category_id and not parent:
            raise HTTPException(status_code=404, detail="Parent category not found")
        code = (payload.proposed_category_code or "").strip() or next_unique_code(db, Category, "CAT", name)
        return {
            "material_library_id": library.id,
            "material_library": library.name,
            "parent_category_id": parent.id if parent else None,
            "parent_category": parent.name if parent else "",
            "proposed_category_name": name,
            "proposed_category_code": code,
            "category_path_preview": f"{parent.name} / {name}" if parent else name,
            "description": payload.description,
            "business_reason": payload.business_reason,
        }

    if payload.type in {"stop_purchase", "stop_use"}:
        return build_stop_workflow_payload(payload, db)

    product, material_library, category = material_context_by_payload(
        db,
        payload.product_name_id,
        payload.material_library_id,
        payload.category_id,
    )
    name = (payload.material_name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Material name is required")
    if not payload.unit.strip() and not product.unit:
        raise HTTPException(status_code=422, detail="Unit is required")
    existing = db.query(Material).filter(Material.product_name_id == product.id, Material.name == name).first()
    duplicate_matches = material_matches(
        db,
        material_library.id,
        material_search_text(name, "", payload.description, payload.attributes),
        "",
        payload.attributes,
        3,
    )
    brand = db.get(Brand, payload.brand_id) if payload.brand_id else None
    if payload.brand_id and not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return {
        "material_library_id": material_library.id,
        "material_library": material_library.name,
        "category_id": category.id,
        "category": category.name,
        "product_name_id": product.id,
        "product_name": product.name,
        "material_name": name,
        "unit": payload.unit.strip() or product.unit,
        "brand_id": brand.id if brand else None,
        "brand": brand.name if brand else "",
        "attributes": payload.attributes,
        "description": payload.description,
        "reference_mall_link": validate_reference_url(payload.reference_mall_link),
        "reference_images": normalize_reference_images(payload.reference_images),
        "duplicate_warning": {
            "existing_material": material_to_out(existing).model_dump() if existing else None,
            "top_matches": duplicate_matches,
        },
        "business_reason": payload.business_reason,
    }


def complete_workflow_application(application: WorkflowApplication, db: Session) -> None:
    data = workflow_payload(application.payload)
    if application.type == "new_category":
        name = str(data.get("proposed_category_name", "")).strip()
        existing = db.query(Category).filter(Category.name == name).first()
        proposed_code = str(data.get("proposed_category_code") or "").strip()
        accepted_code = proposed_code if proposed_code and not db.query(Category).filter(Category.code == proposed_code).first() else ""
        category = existing or Category(
            code=accepted_code or next_unique_code(db, Category, "CAT", name),
            name=name,
            description=str(data.get("description") or data.get("business_reason") or ""),
            enabled=True,
        )
        if not existing:
            db.add(category)
            db.flush()
        application.created_resource_type = "category"
        application.created_resource_id = category.id
        return

    if application.type in {"stop_purchase", "stop_use"}:
        material = db.get(Material, int(data.get("material_id") or 0))
        if not material:
            raise HTTPException(status_code=404, detail="Material not found")
        expected_from = "normal" if application.type == "stop_purchase" else "stop_purchase"
        target_status = "stop_purchase" if application.type == "stop_purchase" else "stop_use"
        if material.status != expected_from:
            detail = (
                "Stop purchase requires a material in normal status"
                if application.type == "stop_purchase"
                else "Stop use requires prior stop_purchase status"
            )
            raise HTTPException(status_code=409, detail=detail)
        material.status = target_status
        material.updated_at = now()
        record_material_lifecycle(
            material,
            expected_from,
            target_status,
            str(data.get("reason") or data.get("business_reason") or ""),
            "workflow",
            application.current_node,
            application.application_no,
        )
        data["current_material_status"] = target_status
        data["approved_at"] = material.updated_at.isoformat()
        application.payload = json.dumps(data, ensure_ascii=False)
        application.created_resource_type = "material"
        application.created_resource_id = material.id
        return

    product, library, category = material_context_by_payload(
        db,
        int(data.get("product_name_id") or 0),
        int(data.get("material_library_id") or 0),
        int(data.get("category_id") or 0),
    )
    name = str(data.get("material_name", "")).strip()
    existing = db.query(Material).filter(Material.product_name_id == product.id, Material.name == name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Material already exists for this product name")
    attrs = material_attributes(data.get("attributes"))
    attrs["_reference_mall_link"] = data.get("reference_mall_link")
    attrs["_reference_images"] = data.get("reference_images", [])
    material = Material(
        code=next_unique_code(db, Material, "MAT", f"{product.id}:{name}:{application.application_no}"),
        name=name,
        product_name_id=product.id,
        material_library_id=library.id,
        category_id=category.id,
        unit=str(data.get("unit") or product.unit),
        brand_id=data.get("brand_id"),
        status="normal",
        description=str(data.get("description") or data.get("business_reason") or ""),
        attributes=json.dumps(attrs, ensure_ascii=False),
        enabled=True,
    )
    db.add(material)
    db.flush()
    application.created_resource_type = "material"
    application.created_resource_id = material.id


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


def auth_to_out(auth: AuthContext) -> AuthUserOut:
    roles = [role_summary(link.role) for link in sorted(auth.user.role_links, key=lambda link: link.role.name)] if auth.user else []
    return AuthUserOut(
        id=auth.user.id if auth.user else None,
        username=auth.username,
        display_name=auth.display_name,
        is_super_admin=auth.is_super_admin,
        permissions=sorted(auth.permissions),
        material_library_scope_ids=None if auth.library_scope_ids is None else sorted(auth.library_scope_ids),
        roles=roles,
    )


@app.get("/api/v1/auth/me", response_model=AuthUserOut)
def get_current_user(request: Request, db: Session = Depends(get_db)) -> AuthUserOut:
    return auth_to_out(current_auth(request, db))


@app.post("/api/v1/auth/login", response_model=AuthUserOut)
def login(payload: AuthLoginIn, db: Session = Depends(get_db)) -> AuthUserOut:
    username = payload.username.strip()
    if username == "super_admin":
        return auth_to_out(super_admin_auth(db))
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return auth_to_out(effective_auth_for_user(user, db))


@app.get("/api/v1/product-names", response_model=list[ProductNameOut])
def list_product_names(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/product-names")),
) -> list[ProductNameOut]:
    ensure_seed_product(db)
    products = db.query(ProductName).order_by(ProductName.id).all()
    return [ProductNameOut(id=p.id, name=p.name, unit=p.unit, category=p.category) for p in products]


@app.get("/api/v1/material-libraries", response_model=list[MaterialLibraryOut])
def list_material_libraries(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/material-libraries")),
) -> list[MaterialLibraryOut]:
    ensure_seed_material_context(db)
    query = db.query(MaterialLibrary)
    if not auth.is_super_admin and auth.library_scope_ids is not None:
        query = query.filter(MaterialLibrary.id.in_(auth.library_scope_ids or {-1}))
    libraries = query.order_by(MaterialLibrary.id).all()
    return [library_to_out(library) for library in libraries]


@app.post("/api/v1/material-libraries", response_model=MaterialLibraryOut)
def create_material_library(
    payload: MaterialLibraryIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/material-libraries")),
) -> MaterialLibraryOut:
    require_button_permission(auth, "button.material_library.create")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Material library name is required")
    if db.query(MaterialLibrary).filter(MaterialLibrary.name == name).first():
        raise HTTPException(status_code=409, detail="Material library name must be unique")
    library = MaterialLibrary(
        code=next_unique_code(db, MaterialLibrary, "MLIB", f"{name}:{now().isoformat()}"),
        name=name,
        description=payload.description.strip(),
        enabled=payload.enabled,
    )
    db.add(library)
    db.commit()
    db.refresh(library)
    return library_to_out(library)


@app.get("/api/v1/material-libraries/{library_id}", response_model=MaterialLibraryOut)
def get_material_library(
    library_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/material-libraries/{library_id}")),
) -> MaterialLibraryOut:
    library = db.get(MaterialLibrary, library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Material library not found")
    require_library_scope(auth, library.id)
    return library_to_out(library)


@app.put("/api/v1/material-libraries/{library_id}", response_model=MaterialLibraryOut)
def update_material_library(
    library_id: int,
    payload: MaterialLibraryUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/material-libraries/{library_id}")),
) -> MaterialLibraryOut:
    require_button_permission(auth, "button.material_library.edit")
    library = db.get(MaterialLibrary, library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Material library not found")
    require_library_scope(auth, library.id)
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Material library name is required")
        duplicate = db.query(MaterialLibrary).filter(MaterialLibrary.name == name, MaterialLibrary.id != library.id).first()
        if duplicate:
            raise HTTPException(status_code=409, detail="Material library name must be unique")
        library.name = name
    if payload.description is not None:
        library.description = payload.description.strip()
    if payload.enabled is not None:
        library.enabled = payload.enabled
    library.updated_at = now()
    db.commit()
    db.refresh(library)
    return library_to_out(library)


@app.delete("/api/v1/material-libraries/{library_id}")
def delete_material_library(
    library_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.DELETE./api/v1/material-libraries/{library_id}")),
) -> dict[str, Any]:
    require_button_permission(auth, "button.material_library.delete")
    library = db.get(MaterialLibrary, library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Material library not found")
    require_library_scope(auth, library.id)
    if db.query(Material).filter(Material.material_library_id == library.id).first():
        raise HTTPException(status_code=409, detail="Material library cannot be deleted while it contains materials")
    db.delete(library)
    db.commit()
    return {"deleted": True, "id": library_id}


@app.get("/api/v1/categories", response_model=list[CategoryOut])
def list_categories(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/categories")),
) -> list[CategoryOut]:
    ensure_seed_material_context(db)
    categories = db.query(Category).order_by(Category.id).all()
    return [category_to_out(category) for category in categories]


@app.get("/api/v1/system/config", response_model=SystemConfigOut)
def get_system_config(
    request: Request,
    db: Session = Depends(get_db),
) -> SystemConfigOut:
    current_auth(request, db)
    return config_to_out(ensure_system_config(db))


@app.put("/api/v1/system/config", response_model=SystemConfigOut)
def update_system_config(
    payload: SystemConfigIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/system/config")),
) -> SystemConfigOut:
    config = ensure_system_config(db)
    before = system_config_payload(config)
    after = dict(before)
    if payload.system_name is not None:
        system_name = compact_space(payload.system_name)
        if not system_name:
            raise HTTPException(status_code=422, detail="system_name is required")
        after["system_name"] = system_name
    if payload.icon is not None:
        after["icon"] = sanitize_icon(payload.icon)
    if payload.stop_purchase_reasons is not None:
        after["stop_purchase_reasons"] = normalize_reason_options(payload.stop_purchase_reasons)
    if payload.stop_use_reasons is not None:
        after["stop_use_reasons"] = normalize_reason_options(payload.stop_use_reasons)
    if payload.approval_mode is not None:
        mode = payload.approval_mode.strip()
        if mode not in APPROVAL_MODES:
            raise HTTPException(status_code=422, detail="approval_mode must be simple or multi_node")
        after["approval_mode"] = mode
    config.value = json.dumps(after, ensure_ascii=False)
    config.updated_by = auth.username
    config.updated_at = now()
    add_audit_log(db, auth, "system_config", "update", before, after)
    db.commit()
    db.refresh(config)
    return config_to_out(config)


@app.post("/api/v1/system/config", response_model=SystemConfigOut)
def save_system_config(
    payload: SystemConfigIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/system/config")),
) -> SystemConfigOut:
    return update_system_config(payload, db, auth)


def audit_query(
    db: Session,
    user: str = "",
    resource: str = "",
    action: str = "",
    source: str = "",
    start_time: str = "",
    end_time: str = "",
):
    query = db.query(AuditLog)
    if user:
        query = query.filter(AuditLog.user.like(f"%{user}%"))
    if resource:
        query = query.filter(AuditLog.resource == resource)
    if action:
        query = query.filter(AuditLog.action == action)
    if source:
        query = query.filter(AuditLog.source == source)
    if start_time:
        try:
            query = query.filter(AuditLog.timestamp >= datetime.fromisoformat(start_time.replace("Z", "+00:00")))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="start_time must be ISO-8601") from exc
    if end_time:
        try:
            query = query.filter(AuditLog.timestamp <= datetime.fromisoformat(end_time.replace("Z", "+00:00")))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="end_time must be ISO-8601") from exc
    return query


def xlsx_cell(value: Any) -> str:
    text = xml_escape(str(value if value is not None else ""))
    return f'<c t="inlineStr"><is><t>{text}</t></is></c>'


def build_audit_workbook(rows: list[list[Any]]) -> BytesIO:
    sheet_rows = "\n".join(
        f'<row r="{row_index}">' + "".join(xlsx_cell(value) for value in row) + "</row>"
        for row_index, row in enumerate(rows, start=1)
    )
    output = BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>""",
        )
        archive.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""",
        )
        archive.writestr(
            "xl/workbook.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Audit Logs" sheetId="1" r:id="rId1"/></sheets>
</workbook>""",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>""",
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            f"""<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>{sheet_rows}</sheetData>
</worksheet>""",
        )
    output.seek(0)
    return output


@app.get("/api/v1/audit-logs", response_model=AuditLogListOut)
def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: str = "",
    resource: str = "",
    action: str = "",
    source: str = "",
    start_time: str = "",
    end_time: str = "",
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/audit-logs")),
) -> AuditLogListOut:
    query = audit_query(db, user, resource, action, source, start_time, end_time)
    total = query.count()
    logs = (
        query.order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    pages = max(1, (total + page_size - 1) // page_size)
    return AuditLogListOut(items=[audit_to_out(log) for log in logs], total=total, page=page, page_size=page_size, pages=pages)


@app.get("/api/v1/audit-logs/export")
def export_audit_logs(
    user: str = "",
    resource: str = "",
    action: str = "",
    source: str = "",
    start_time: str = "",
    end_time: str = "",
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/audit-logs/export")),
) -> StreamingResponse:
    logs = audit_query(db, user, resource, action, source, start_time, end_time).order_by(AuditLog.timestamp.desc(), AuditLog.id.desc()).all()
    headers = ["timestamp", "user", "resource", "action", "source", "before value", "after value"]
    rows: list[list[Any]] = [headers]
    for log in logs:
        item = audit_to_out(log)
        rows.append(
            [
                item.timestamp,
                item.user,
                item.resource,
                item.action,
                item.source,
                json.dumps(item.before_value, ensure_ascii=False, sort_keys=True),
                json.dumps(item.after_value, ensure_ascii=False, sort_keys=True),
            ]
        )
    output = build_audit_workbook(rows)
    filename = f"audit-logs-{now().strftime('%Y%m%d%H%M%S')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/v1/audit-logs/{log_id}", response_model=AuditLogOut)
def get_audit_log(
    log_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/audit-logs/{log_id}")),
) -> AuditLogOut:
    log = db.get(AuditLog, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    return audit_to_out(log)


@app.get("/api/v1/users", response_model=list[UserOut])
def list_users(
    search: str = "",
    unit: str = "",
    department: str = "",
    team: str = "",
    account_ownership: str = "",
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/users")),
) -> list[UserOut]:
    ensure_hcm_seed_users(db)
    query = db.query(User)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(User.username.like(like), User.display_name.like(like), User.email.like(like)))
    if unit:
        query = query.filter(User.unit == unit)
    if department:
        query = query.filter(User.department == department)
    if team:
        query = query.filter(User.team == team)
    if account_ownership:
        if account_ownership not in ACCOUNT_OWNERSHIPS:
            raise HTTPException(status_code=422, detail="account_ownership must be HCM or local")
        query = query.filter(User.account_ownership == account_ownership)
    return [user_to_out(user) for user in query.order_by(User.account_ownership, User.id).all()]


@app.post("/api/v1/users", response_model=UserOut)
def create_user(
    payload: UserIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/users")),
) -> UserOut:
    require_button_permission(auth, "button.users.create")
    ensure_hcm_seed_users(db)
    username = payload.username.strip()
    display_name = payload.display_name.strip()
    if not username or not display_name:
        raise HTTPException(status_code=422, detail="username and display_name are required")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail="Username must be unique")
    user = User(
        username=username,
        display_name=display_name,
        unit=payload.unit.strip(),
        department=payload.department.strip(),
        team=payload.team.strip(),
        email=payload.email.strip(),
        account_ownership="local",
        status=validate_user_status(payload.status),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_out(user)


@app.get("/api/v1/users/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/users/{user_id}")),
) -> UserOut:
    ensure_hcm_seed_users(db)
    return user_to_out(get_user_or_404(db, user_id))


@app.put("/api/v1/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/users/{user_id}")),
) -> UserOut:
    require_button_permission(auth, "button.users.edit")
    user = get_user_or_404(db, user_id)
    require_local_user(user)
    for field in ["display_name", "unit", "department", "team", "email"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(user, field, value.strip())
    if payload.status is not None:
        user.status = validate_user_status(payload.status)
    if not user.display_name.strip():
        raise HTTPException(status_code=422, detail="display_name is required")
    user.updated_at = now()
    db.commit()
    db.refresh(user)
    return user_to_out(user)


@app.post("/api/v1/users/{user_id}/password-reset", response_model=PasswordResetOut)
def reset_user_password(
    user_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/users/{user_id}/password-reset")),
) -> PasswordResetOut:
    require_button_permission(auth, "button.users.reset_password")
    user = get_user_or_404(db, user_id)
    require_local_user(user)
    token = sha1(f"password-reset:{user.id}:{user.username}:{now().isoformat()}".encode("utf-8")).hexdigest()[:12].upper()
    user.password_reset_token = token
    user.updated_at = now()
    db.commit()
    return PasswordResetOut(
        user_id=user.id,
        username=user.username,
        reset_token=token,
        temporary_password=f"Temp-{token}",
        message="Local user password reset succeeded",
    )


@app.delete("/api/v1/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.DELETE./api/v1/users/{user_id}")),
) -> dict[str, Any]:
    require_button_permission(auth, "button.users.delete")
    user = get_user_or_404(db, user_id)
    require_local_user(user)
    db.delete(user)
    db.commit()
    return {"deleted": True, "id": user_id}


@app.get("/api/v1/permissions/catalog", response_model=list[PermissionEntry])
def get_permission_catalog(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/permissions/catalog")),
) -> list[PermissionEntry]:
    return permission_catalog_entries(db)


@app.get("/api/v1/roles", response_model=list[RoleOut])
def list_roles(
    search: str = "",
    enabled: bool | None = None,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/roles")),
) -> list[RoleOut]:
    query = db.query(Role)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(Role.name.like(like), Role.code.like(like), Role.description.like(like)))
    if enabled is not None:
        query = query.filter(Role.enabled.is_(enabled))
    return [role_to_out(role) for role in query.order_by(Role.id.desc()).all()]


@app.post("/api/v1/roles", response_model=RoleOut)
def create_role(
    payload: RoleIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/roles")),
) -> RoleOut:
    require_button_permission(auth, "button.roles.create")
    name = payload.name.strip()
    code = payload.code.strip()
    if not name or not code:
        raise HTTPException(status_code=422, detail="role name and code are required")
    validate_role_uniqueness(db, name, code)
    role = Role(name=name, code=code, description=payload.description.strip(), enabled=payload.enabled)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role_to_out(role)


@app.get("/api/v1/roles/{role_id}", response_model=RoleOut)
def get_role(
    role_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/roles/{role_id}")),
) -> RoleOut:
    return role_to_out(get_role_or_404(db, role_id))


@app.put("/api/v1/roles/{role_id}", response_model=RoleOut)
def update_role(
    role_id: int,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/roles/{role_id}")),
) -> RoleOut:
    require_button_permission(auth, "button.roles.edit")
    role = get_role_or_404(db, role_id)
    name = payload.name.strip() if payload.name is not None else role.name
    code = payload.code.strip() if payload.code is not None else role.code
    if not name or not code:
        raise HTTPException(status_code=422, detail="role name and code are required")
    validate_role_uniqueness(db, name, code, role.id)
    role.name = name
    role.code = code
    if payload.description is not None:
        role.description = payload.description.strip()
    if payload.enabled is not None:
        role.enabled = payload.enabled
    role.updated_at = now()
    db.commit()
    db.refresh(role)
    return role_to_out(role)


@app.patch("/api/v1/roles/{role_id}/enable", response_model=RoleOut)
def enable_role(
    role_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PATCH./api/v1/roles/{role_id}/enable")),
) -> RoleOut:
    require_button_permission(auth, "button.roles.edit")
    role = get_role_or_404(db, role_id)
    role.enabled = True
    role.updated_at = now()
    db.commit()
    db.refresh(role)
    return role_to_out(role)


@app.patch("/api/v1/roles/{role_id}/disable", response_model=RoleOut)
def disable_role(
    role_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PATCH./api/v1/roles/{role_id}/disable")),
) -> RoleOut:
    require_button_permission(auth, "button.roles.edit")
    role = get_role_or_404(db, role_id)
    role.enabled = False
    role.updated_at = now()
    db.commit()
    db.refresh(role)
    return role_to_out(role)


@app.delete("/api/v1/roles/{role_id}")
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.DELETE./api/v1/roles/{role_id}")),
) -> dict[str, Any]:
    require_button_permission(auth, "button.roles.delete")
    role = get_role_or_404(db, role_id)
    db.delete(role)
    db.commit()
    return {"deleted": True, "id": role_id}


@app.get("/api/v1/roles/{role_id}/users", response_model=list[UserSummaryOut])
def list_role_users(
    role_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/roles/{role_id}/users")),
) -> list[UserSummaryOut]:
    role = get_role_or_404(db, role_id)
    return [user_summary(link.user) for link in sorted(role.user_links, key=lambda link: link.user.username)]


@app.post("/api/v1/roles/{role_id}/users", response_model=RoleOut)
def add_role_user(
    role_id: int,
    payload: RoleUserBindingIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/roles/{role_id}/users")),
) -> RoleOut:
    require_button_permission(auth, "button.roles.bind_users")
    role = get_role_or_404(db, role_id)
    validate_bindable_role(role)
    user = get_user_or_404(db, payload.user_id)
    existing = db.query(RoleUser).filter(RoleUser.role_id == role.id, RoleUser.user_id == user.id).first()
    if not existing:
        db.add(RoleUser(role_id=role.id, user_id=user.id))
    role.updated_at = now()
    db.commit()
    db.refresh(role)
    return role_to_out(role)


@app.put("/api/v1/roles/{role_id}/users", response_model=RoleOut)
def replace_role_users(
    role_id: int,
    payload: RoleUserReplaceIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/roles/{role_id}/users")),
) -> RoleOut:
    require_button_permission(auth, "button.roles.bind_users")
    role = get_role_or_404(db, role_id)
    validate_bindable_role(role)
    user_ids = set(payload.user_ids)
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    found_ids = {user.id for user in users}
    missing = user_ids - found_ids
    if missing:
        raise HTTPException(status_code=404, detail=f"User not found: {sorted(missing)[0]}")
    db.query(RoleUser).filter(RoleUser.role_id == role.id).delete()
    for user_id in sorted(user_ids):
        db.add(RoleUser(role_id=role.id, user_id=user_id))
    role.updated_at = now()
    db.commit()
    db.refresh(role)
    return role_to_out(role)


@app.delete("/api/v1/roles/{role_id}/users/{user_id}", response_model=RoleOut)
def remove_role_user(
    role_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.DELETE./api/v1/roles/{role_id}/users/{user_id}")),
) -> RoleOut:
    require_button_permission(auth, "button.roles.bind_users")
    role = get_role_or_404(db, role_id)
    get_user_or_404(db, user_id)
    link = db.query(RoleUser).filter(RoleUser.role_id == role.id, RoleUser.user_id == user_id).first()
    if link:
        db.delete(link)
    role.updated_at = now()
    db.commit()
    db.refresh(role)
    return role_to_out(role)


@app.get("/api/v1/roles/{role_id}/permissions", response_model=RolePermissionsOut)
def get_role_permissions(
    role_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/roles/{role_id}/permissions")),
) -> RolePermissionsOut:
    role = get_role_or_404(db, role_id)
    return RolePermissionsOut(
        role_id=role.id,
        role_name=role.name,
        permissions=[
            permission_to_entry(permission)
            for permission in sorted(role.permissions, key=lambda item: (item.permission_type, item.permission_key))
            if permission.enabled
        ],
        catalog=permission_catalog_entries(db),
    )


@app.put("/api/v1/roles/{role_id}/permissions", response_model=RolePermissionsOut)
def save_role_permissions(
    role_id: int,
    payload: RolePermissionsIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/roles/{role_id}/permissions")),
) -> RolePermissionsOut:
    require_button_permission(auth, "button.roles.configure_permissions")
    role = get_role_or_404(db, role_id)
    entries = normalize_permission_payload(payload, db)
    db.query(FeaturePermission).filter(FeaturePermission.role_id == role.id).delete()
    for entry in entries:
        db.add(
            FeaturePermission(
                role_id=role.id,
                module=entry.module,
                permission_type=entry.permission_type,
                permission_key=entry.permission_key,
                label=entry.label,
                enabled=True,
            )
        )
    role.updated_at = now()
    db.commit()
    db.refresh(role)
    return get_role_permissions(role.id, db, auth)


@app.get("/api/v1/workflows/applications", response_model=list[WorkflowApplicationOut])
def list_workflow_applications(
    applicant: str = "",
    status: str = "",
    type: str = "",
    material_id: int | None = None,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/workflows/applications")),
) -> list[WorkflowApplicationOut]:
    query = db.query(WorkflowApplication)
    if applicant:
        query = query.filter(WorkflowApplication.applicant == applicant)
    if status:
        query = query.filter(WorkflowApplication.status == status)
    if type:
        query = query.filter(WorkflowApplication.type == type)
    applications = query.order_by(WorkflowApplication.id.desc()).all()
    if material_id is not None:
        applications = [
            application
            for application in applications
            if int(workflow_payload(application.payload).get("material_id") or 0) == material_id
        ]
    return [workflow_to_out(application) for application in applications]


@app.post("/api/v1/workflows/applications", response_model=WorkflowApplicationOut)
def submit_workflow_application(
    payload: WorkflowApplicationIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/workflows/applications")),
) -> WorkflowApplicationOut:
    require_button_permission(auth, "button.workflow.submit")
    if payload.material_library_id:
        require_library_scope(auth, payload.material_library_id)
    if payload.material_id:
        material = db.get(Material, payload.material_id)
        if material:
            require_library_scope(auth, material.material_library_id)
    data = build_workflow_payload(payload, db)
    mode = approval_mode(db)
    status, node = initial_workflow_state(mode)
    seed = f"{payload.type}:{payload.applicant}:{now().isoformat()}:{data}"
    application = WorkflowApplication(
        application_no=application_no(seed),
        type=payload.type,
        status=status,
        applicant=payload.applicant.strip() or "material_manager",
        current_node=node,
        business_reason=payload.business_reason.strip(),
        payload=json.dumps(data, ensure_ascii=False),
    )
    db.add(application)
    db.flush()
    add_workflow_history(
        application,
        "submit",
        application.applicant,
        "applicant",
        "draft",
        status,
        payload.business_reason.strip(),
    )
    db.commit()
    db.refresh(application)
    return workflow_to_out(application)


@app.post("/api/v1/workflows/applications/new-category", response_model=WorkflowApplicationOut)
def submit_new_category_application(
    payload: WorkflowApplicationIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/workflows/applications")),
) -> WorkflowApplicationOut:
    payload.type = "new_category"
    return submit_workflow_application(payload, db, auth)


@app.post("/api/v1/workflows/applications/new-material-code", response_model=WorkflowApplicationOut)
def submit_new_material_code_application(
    payload: WorkflowApplicationIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/workflows/applications")),
) -> WorkflowApplicationOut:
    payload.type = "new_material_code"
    return submit_workflow_application(payload, db, auth)


@app.post("/api/v1/workflows/applications/stop-purchase", response_model=WorkflowApplicationOut)
def submit_stop_purchase_application(
    payload: WorkflowApplicationIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/workflows/applications")),
) -> WorkflowApplicationOut:
    payload.type = "stop_purchase"
    return submit_workflow_application(payload, db, auth)


@app.post("/api/v1/workflows/applications/stop-use", response_model=WorkflowApplicationOut)
def submit_stop_use_application(
    payload: WorkflowApplicationIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/workflows/applications")),
) -> WorkflowApplicationOut:
    payload.type = "stop_use"
    return submit_workflow_application(payload, db, auth)


@app.get("/api/v1/workflows/tasks", response_model=list[WorkflowApplicationOut])
def list_workflow_tasks(
    node: str = "",
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/workflows/tasks")),
) -> list[WorkflowApplicationOut]:
    query = db.query(WorkflowApplication).filter(WorkflowApplication.status.notin_(TERMINAL_WORKFLOW_STATUSES))
    if node:
        query = query.filter(WorkflowApplication.current_node == node)
    applications = query.order_by(WorkflowApplication.id).all()
    return [workflow_to_out(application) for application in applications]


@app.get("/api/v1/workflows/applications/{application_id}", response_model=WorkflowApplicationOut)
def get_workflow_application(
    application_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/workflows/applications/{application_id}")),
) -> WorkflowApplicationOut:
    application = db.get(WorkflowApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Workflow application not found")
    return workflow_to_out(application)


@app.post("/api/v1/workflows/applications/{application_id}/approve", response_model=WorkflowApplicationOut)
def approve_workflow_application(
    application_id: int,
    payload: WorkflowActionIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/workflows/applications/{application_id}/approve")),
) -> WorkflowApplicationOut:
    require_button_permission(auth, "button.workflow.approve")
    application = db.get(WorkflowApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Workflow application not found")
    if application.status in TERMINAL_WORKFLOW_STATUSES:
        raise HTTPException(status_code=409, detail="Terminal workflow applications cannot be approved again")
    requested_node = payload.node or application.current_node
    if requested_node != application.current_node:
        raise HTTPException(status_code=409, detail=f"Current workflow node is {application.current_node}, not {requested_node}")
    from_status = application.status
    to_status, next_node = next_approval_state(application.current_node, approval_mode(db))
    application.status = to_status
    application.current_node = next_node
    application.updated_at = now()
    if to_status == "approved":
        complete_workflow_application(application, db)
    add_workflow_history(
        application,
        "approve",
        payload.actor.strip() or requested_node,
        requested_node,
        from_status,
        to_status,
        payload.comment,
    )
    db.commit()
    db.refresh(application)
    return workflow_to_out(application)


@app.post("/api/v1/workflows/applications/{application_id}/reject", response_model=WorkflowApplicationOut)
def reject_workflow_application(
    application_id: int,
    payload: WorkflowActionIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/workflows/applications/{application_id}/reject")),
) -> WorkflowApplicationOut:
    require_button_permission(auth, "button.workflow.reject")
    application = db.get(WorkflowApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Workflow application not found")
    if application.status in TERMINAL_WORKFLOW_STATUSES:
        raise HTTPException(status_code=409, detail="Terminal workflow applications cannot be rejected again")
    comment = payload.comment.strip()
    if not comment:
        raise HTTPException(status_code=422, detail="A rejection reason is required")
    requested_node = payload.node or application.current_node
    if requested_node != application.current_node:
        raise HTTPException(status_code=409, detail=f"Current workflow node is {application.current_node}, not {requested_node}")
    from_status = application.status
    application.status = "rejected"
    application.current_node = "rejected"
    application.rejection_reason = comment
    application.updated_at = now()
    add_workflow_history(
        application,
        "reject",
        payload.actor.strip() or requested_node,
        requested_node,
        from_status,
        "rejected",
        comment,
    )
    db.commit()
    db.refresh(application)
    return workflow_to_out(application)


@app.get("/api/v1/materials", response_model=list[MaterialOut])
def list_materials(
    search: str = "",
    status: str = "",
    product_name_id: int | None = None,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/materials")),
) -> list[MaterialOut]:
    ensure_seed_material_context(db)
    query = db.query(Material).join(ProductName).join(MaterialLibrary).join(Category)
    if not auth.is_super_admin and auth.library_scope_ids is not None:
        query = query.filter(Material.material_library_id.in_(auth.library_scope_ids or {-1}))
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
def create_material(
    payload: MaterialIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/materials")),
) -> MaterialOut:
    require_button_permission(auth, "button.material_archives.create")
    require_library_scope(auth, payload.material_library_id)
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
    text = compact_space(payload.input_text)
    if not text:
        raise HTTPException(status_code=422, detail="input_text is required")
    gateway_result = invoke_gateway_capability(db, "material_add", text)
    match_gateway = invoke_gateway_capability(db, "material_match", text)
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
    trace_id = gateway_result["trace_id"]
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
        "provider": gateway_result["provider"],
        "model": gateway_result["model"],
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
            "provider": match_gateway["provider"],
            "model": match_gateway["model"],
            "trace_id": match_gateway["trace_id"],
            "engine": "qdrant_hybrid_with_local_fallback",
            "classification": top_classification,
            "top_matches": matches,
        },
    }


@app.post(
    "/api/v1/materials/ai-add/preview",
    description="AI natural language material addition preview. capability: material_add",
)
def preview_ai_material_add(
    payload: AiMaterialAddPreviewIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/materials/ai-add/preview")),
) -> dict[str, Any]:
    require_library_scope(auth, payload.material_library_id)
    return build_ai_material_preview(payload, db)


@app.post(
    "/api/v1/materials/ai-add/confirm",
    description="AI natural language material addition confirmation. capability: material_add",
)
def confirm_ai_material_add(
    payload: AiMaterialAddConfirmIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/materials/ai-add/confirm")),
) -> dict[str, Any]:
    require_button_permission(auth, "button.material_archives.create")
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
    require_library_scope(auth, library.id)
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
def match_materials(
    payload: MaterialMatchIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/materials/match")),
) -> dict[str, Any]:
    library = db.get(MaterialLibrary, payload.material_library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Material library not found")
    require_library_scope(auth, library.id)
    brand = db.get(Brand, payload.brand_id).name if payload.brand_id and db.get(Brand, payload.brand_id) else (payload.brand or "")
    query_text = payload.query or material_search_text(payload.name or "", brand, payload.description, payload.attributes)
    gateway_result = invoke_gateway_capability(db, "material_match", query_text)
    matches = material_matches(db, library.id, query_text, brand, payload.attributes, payload.top_k)
    return {
        "capability": "material_match",
        "provider": gateway_result["provider"],
        "model": gateway_result["model"],
        "trace_id": gateway_result["trace_id"],
        "fallback_used": gateway_result["fallback_used"],
        "embedding_provider": gateway_result["provider"],
        "engine": "qdrant_hybrid_with_local_fallback",
        "query": query_text,
        "matches": matches,
    }


@app.post("/api/v1/ai/material-add/preview")
def preview_ai_material_add_alias(
    payload: AiMaterialAddPreviewIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/materials/ai-add/preview")),
) -> dict[str, Any]:
    return preview_ai_material_add(payload, db, auth)


@app.post("/api/v1/ai/material-add/confirm")
def confirm_ai_material_add_alias(
    payload: AiMaterialAddConfirmIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/materials/ai-add/confirm")),
) -> dict[str, Any]:
    return confirm_ai_material_add(payload, db, auth)


@app.post("/api/v1/ai/material-match")
def match_materials_alias(
    payload: MaterialMatchIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/materials/match")),
) -> dict[str, Any]:
    return match_materials(payload, db, auth)


@app.get("/api/v1/ai/providers", response_model=list[ProviderConfigOut])
def list_ai_providers(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/system/config")),
) -> list[ProviderConfigOut]:
    ensure_provider_configs(db)
    providers = db.query(ModelConfig).order_by(ModelConfig.enabled.desc(), ModelConfig.id.desc()).all()
    return [provider_to_out(provider, db) for provider in providers]


@app.post("/api/v1/ai/providers", response_model=ProviderConfigOut)
def save_ai_provider(
    payload: ProviderConfigIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/system/config")),
) -> ProviderConfigOut:
    values = model_values_from_payload(payload)
    provider = (
        db.query(ModelConfig)
        .filter(ModelConfig.display_name == values["display_name"])
        .first()
    )
    if not provider:
        provider = ModelConfig(display_name=values["display_name"], provider=values["provider"], model_name=values["model_name"])
        db.add(provider)
    apply_model_payload(db, provider, payload)
    db.commit()
    db.refresh(provider)
    return provider_to_out(provider, db)


@app.get("/api/v1/ai/providers/{provider_id}", response_model=ProviderConfigOut)
def get_ai_provider(
    provider_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/system/config")),
) -> ProviderConfigOut:
    provider = db.get(ModelConfig, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Model configuration not found")
    return provider_to_out(provider, db)


@app.put("/api/v1/ai/providers/{provider_id}", response_model=ProviderConfigOut)
def update_ai_provider(
    provider_id: int,
    payload: ProviderConfigIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/system/config")),
) -> ProviderConfigOut:
    provider = db.get(ModelConfig, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Model configuration not found")
    apply_model_payload(db, provider, payload)
    db.commit()
    db.refresh(provider)
    return provider_to_out(provider, db)


@app.patch("/api/v1/ai/providers/{provider_id}/disable", response_model=ProviderConfigOut)
def disable_ai_provider(
    provider_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/system/config")),
) -> ProviderConfigOut:
    provider = db.get(ModelConfig, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Model configuration not found")
    provider.enabled = False
    provider.updated_at = now()
    db.commit()
    db.refresh(provider)
    return provider_to_out(provider, db)


@app.delete("/api/v1/ai/providers/{provider_id}")
def delete_ai_provider(
    provider_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/system/config")),
) -> dict[str, Any]:
    provider = db.get(ModelConfig, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Model configuration not found")
    if db.query(CapabilityModelMapping).filter(
        or_(
            CapabilityModelMapping.primary_model_id == provider.id,
            CapabilityModelMapping.fallback_model_id == provider.id,
        )
    ).first():
        raise HTTPException(status_code=409, detail="Model is referenced by a capability mapping; disable it instead")
    db.delete(provider)
    db.commit()
    return {"deleted": True, "id": provider_id}


@app.post("/api/v1/ai/providers/test")
def test_ai_provider(
    payload: ProviderConfigIn,
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/system/config")),
) -> dict[str, Any]:
    values = model_values_from_payload(payload)
    provider = ModelConfig(
        display_name=values["display_name"],
        provider=values["provider"],
        model_name=values["model_name"],
        base_url=values["base_url"],
        timeout_seconds=values["timeout_seconds"],
        encrypted_api_key=encrypt_api_key(payload.api_key),
        enabled=values["enabled"],
    )
    result = test_model_connection(provider)
    return {
        "ok": result["ok"],
        "provider": provider.provider,
        "model": provider.model_name,
        "capabilities": [capability for capability in normalize_capabilities(payload.capabilities) if capability in AI_CAPABILITIES],
        "status": result["status"],
        "message": result["message"],
    }


@app.post("/api/v1/ai/providers/{provider_id}/test")
def test_saved_ai_provider(
    provider_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/system/config")),
) -> dict[str, Any]:
    provider = db.get(ModelConfig, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Model configuration not found")
    result = test_model_connection(provider)
    provider.connection_status = result["status"]
    provider.last_test_message = result["message"]
    provider.last_test_at = now()
    provider.updated_at = now()
    db.commit()
    return {"ok": result["ok"], "status": result["status"], "message": result["message"], "provider": provider.provider, "model": provider.model_name}


@app.get("/api/v1/ai/capability-mappings", response_model=list[CapabilityMappingOut])
def list_capability_mappings(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/system/config")),
) -> list[CapabilityMappingOut]:
    ensure_provider_configs(db)
    mappings = db.query(CapabilityModelMapping).order_by(CapabilityModelMapping.capability).all()
    return [mapping_to_out(mapping) for mapping in mappings]


@app.put("/api/v1/ai/capability-mappings/{capability}", response_model=CapabilityMappingOut)
def save_capability_mapping(
    capability: str,
    payload: CapabilityMappingIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/system/config")),
) -> CapabilityMappingOut:
    capability = capability or payload.capability
    if capability not in AI_CAPABILITIES:
        raise HTTPException(status_code=422, detail="Unsupported AI capability")
    primary = db.get(ModelConfig, payload.primary_model_id)
    if not primary or not primary.enabled:
        raise HTTPException(status_code=409, detail="Primary model must exist and be enabled")
    fallback = db.get(ModelConfig, payload.fallback_model_id) if payload.fallback_model_id else None
    if payload.fallback_model_id and (not fallback or not fallback.enabled):
        raise HTTPException(status_code=409, detail="Fallback model must exist and be enabled")
    mapping = db.query(CapabilityModelMapping).filter(CapabilityModelMapping.capability == capability).first()
    if not mapping:
        mapping = CapabilityModelMapping(capability=capability, primary_model_id=primary.id)
        db.add(mapping)
    mapping.primary_model_id = primary.id
    mapping.fallback_model_id = fallback.id if fallback else None
    mapping.enabled = payload.enabled
    mapping.updated_at = now()
    db.commit()
    db.refresh(mapping)
    return mapping_to_out(mapping)


@app.post("/api/v1/ai/capabilities/{capability}/invoke")
def invoke_ai_capability(
    capability: str,
    payload: GatewayInvokeIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/materials/ai-add/preview")),
) -> dict[str, Any]:
    if capability not in AI_CAPABILITIES:
        raise HTTPException(status_code=422, detail="Unsupported AI capability")
    return invoke_gateway_capability(db, capability, payload.prompt, payload.messages)


@app.get("/api/v1/debug/trace", response_model=list[TraceSummaryOut])
def list_traces(
    status: str = "",
    operation: str = "",
    capability: str = "",
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/system/config")),
) -> list[TraceSummaryOut]:
    if not ai_debug_enabled():
        raise HTTPException(status_code=403, detail="AI debug trace UI is disabled")
    query = db.query(TracerSpan)
    if status:
        query = query.filter(TracerSpan.status == status)
    if capability:
        query = query.filter(TracerSpan.capability == capability)
    if operation:
        query = query.filter(TracerSpan.operation_name.like(f"%{operation}%"))
    spans = query.order_by(TracerSpan.start_time.desc()).limit(500).all()
    grouped: dict[str, list[TracerSpan]] = {}
    for span in spans:
        grouped.setdefault(span.trace_id, []).append(span)
    summaries: list[TraceSummaryOut] = []
    for trace_id, trace_spans in grouped.items():
        root = next((span for span in trace_spans if not span.parent_span_id), trace_spans[0])
        summaries.append(
            TraceSummaryOut(
                trace_id=trace_id,
                operation_name=root.operation_name,
                capability=root.capability,
                status="error" if any(span.status == "error" for span in trace_spans) else root.status,
                start_time=root.start_time.isoformat(),
                duration_ms=sum(span.duration_ms for span in trace_spans if not span.parent_span_id) or root.duration_ms,
                span_count=len(trace_spans),
            )
        )
    return sorted(summaries, key=lambda item: item.start_time, reverse=True)


@app.get("/api/v1/debug/trace/{trace_id}", response_model=TraceDetailOut)
def get_trace_detail(
    trace_id: str,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/system/config")),
) -> TraceDetailOut:
    if not ai_debug_enabled():
        raise HTTPException(status_code=403, detail="AI debug trace UI is disabled")
    spans = db.query(TracerSpan).filter(TracerSpan.trace_id == trace_id).order_by(TracerSpan.start_time).all()
    if not spans:
        raise HTTPException(status_code=404, detail="Trace not found")
    return TraceDetailOut(
        trace_id=trace_id,
        spans=[
            {
                "span_id": span.span_id,
                "parent_span_id": span.parent_span_id,
                "operation_name": span.operation_name,
                "span_type": span.span_type,
                "capability": span.capability,
                "provider": span.provider,
                "model": span.model,
                "status": span.status,
                "start_time": span.start_time.isoformat(),
                "duration_ms": span.duration_ms,
                "metadata": json.loads(span.metadata_json or "{}"),
                "error": span.error,
            }
            for span in spans
        ],
    )


@app.put("/api/v1/materials/{material_id}", response_model=MaterialOut)
def update_material(
    material_id: int,
    payload: MaterialUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/materials/{material_id}")),
) -> MaterialOut:
    require_button_permission(auth, "button.material_archives.edit")
    material = db.get(Material, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    require_library_scope(auth, material.material_library_id)
    if payload.material_library_id:
        require_library_scope(auth, payload.material_library_id)
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
        existing_history = material_attributes(material.attributes).get("_lifecycle_history")
        attributes = dict(payload.attributes)
        if existing_history and "_lifecycle_history" not in attributes:
            attributes["_lifecycle_history"] = existing_history
        material.attributes = json.dumps(attributes, ensure_ascii=False)
    if payload.status is not None:
        enforce_material_transition(material.status, payload.status, payload.transition_reason)
        if material.status != payload.status:
            record_material_lifecycle(
                material,
                material.status,
                payload.status,
                payload.transition_reason or "",
                "manual",
                "super_admin",
            )
        material.status = payload.status
    material.updated_at = now()
    db.commit()
    db.refresh(material)
    return material_to_out(material)


@app.get("/api/v1/materials/{material_id}", response_model=MaterialOut)
def get_material(
    material_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/materials/{material_id}")),
) -> MaterialOut:
    material = db.get(Material, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    require_library_scope(auth, material.material_library_id)
    return material_to_out(material)


@app.patch("/api/v1/materials/{material_id}/stop-purchase", response_model=MaterialOut)
def admin_stop_purchase_material(
    material_id: int,
    payload: ManualStopPurchaseIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PATCH./api/v1/materials/{material_id}/stop-purchase")),
) -> MaterialOut:
    require_button_permission(auth, "button.material_archives.approval")
    material = db.get(Material, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    require_library_scope(auth, material.material_library_id)
    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(status_code=422, detail="An exemption reason is required for manual stop purchase")
    if material.status != "normal":
        raise HTTPException(status_code=409, detail="Manual stop purchase requires a material in normal status")
    actor = payload.actor.strip() or "super_admin"
    application = WorkflowApplication(
        application_no=application_no(f"manual-stop-purchase:{material.id}:{actor}:{now().isoformat()}"),
        type="stop_purchase",
        status="approved",
        applicant=actor,
        current_node="approved",
        business_reason=reason,
        payload=json.dumps(
            {
                **material_summary(material),
                "reason_code": reason,
                "reason": reason,
                "business_reason": reason,
                "from_status": "normal",
                "target_status": "stop_purchase",
                "source": "admin_manual",
                "exemption_reason": reason,
            },
            ensure_ascii=False,
        ),
        created_resource_type="material",
        created_resource_id=material.id,
    )
    db.add(application)
    db.flush()
    add_workflow_history(application, "manual_stop_purchase", actor, "super_admin", "normal", "stop_purchase", reason)
    material.status = "stop_purchase"
    material.updated_at = now()
    record_material_lifecycle(material, "normal", "stop_purchase", reason, "admin_manual", actor, application.application_no)
    data = workflow_payload(application.payload)
    data["current_material_status"] = "stop_purchase"
    data["approved_at"] = material.updated_at.isoformat()
    application.payload = json.dumps(data, ensure_ascii=False)
    db.commit()
    db.refresh(material)
    return material_to_out(material)


@app.post("/api/v1/materials/{material_id}/transition", response_model=MaterialOut)
def transition_material(
    material_id: int,
    payload: MaterialTransitionIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/materials/{material_id}/transition")),
) -> MaterialOut:
    require_button_permission(auth, "button.material_archives.edit")
    material = db.get(Material, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    require_library_scope(auth, material.material_library_id)
    enforce_material_transition(material.status, payload.target_status, payload.reason)
    if material.status != payload.target_status:
        record_material_lifecycle(material, material.status, payload.target_status, payload.reason, "manual", "super_admin")
    material.status = payload.target_status
    material.updated_at = now()
    db.commit()
    db.refresh(material)
    return material_to_out(material)


@app.delete("/api/v1/materials/{material_id}")
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.DELETE./api/v1/materials/{material_id}")),
) -> dict[str, Any]:
    require_button_permission(auth, "button.material_archives.delete")
    material = db.get(Material, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    require_library_scope(auth, material.material_library_id)
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
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/materials/governance/preview")),
) -> dict[str, Any]:
    if payload.material_library_id:
        require_library_scope(auth, payload.material_library_id)
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
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/materials/governance/import")),
) -> list[MaterialOut]:
    require_button_permission(auth, "button.material_archives.import")
    if payload.material_library_id:
        require_library_scope(auth, payload.material_library_id)
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
        require_library_scope(auth, library.id)
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
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/materials/governance/preview")),
) -> dict[str, Any]:
    return preview_material_governance(payload, db, auth)


@app.post("/api/v1/ai/material-governance/import", response_model=list[MaterialOut])
def import_ai_material_governance(
    payload: MaterialGovernanceImportIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/materials/governance/import")),
) -> list[MaterialOut]:
    return import_material_governance(payload, db, auth)


@app.get("/api/v1/attributes/changes", response_model=list[ChangeOut])
def list_attribute_changes(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/attributes/changes")),
) -> list[ChangeOut]:
    changes = db.query(AttributeChange).order_by(AttributeChange.id.desc()).all()
    return [change_to_out(change) for change in changes]


@app.post("/api/v1/attributes/governance/preview")
def preview_attribute_governance(
    payload: GovernancePreviewIn,
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/attributes/governance/preview")),
) -> dict[str, Any]:
    items = governance_items(payload.rows)
    return {"items": items, "count": len(items)}


@app.post("/api/v1/ai/attribute-governance/preview")
def preview_ai_attribute_governance(
    payload: GovernancePreviewIn,
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/attributes/governance/preview")),
) -> dict[str, Any]:
    return preview_attribute_governance(payload, auth)


@app.post("/api/v1/attributes/governance/import", response_model=list[AttributeOut])
def import_attribute_governance(
    payload: GovernanceImportIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/attributes/governance/import")),
) -> list[AttributeOut]:
    require_button_permission(auth, "button.attribute_management.import")
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
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/attributes/governance/import")),
) -> list[AttributeOut]:
    return import_attribute_governance(payload, db, auth)


@app.get("/api/v1/attributes", response_model=list[AttributeOut])
def list_attributes(
    product_name_id: int | None = None,
    search: str = "",
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/attributes")),
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
def create_attribute(
    payload: AttributeIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/attributes")),
) -> AttributeOut:
    require_button_permission(auth, "button.attribute_management.create")
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
def update_attribute(
    attribute_id: int,
    payload: AttributeUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/attributes/{attribute_id}")),
) -> AttributeOut:
    require_button_permission(auth, "button.attribute_management.edit")
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
def delete_attribute(
    attribute_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.DELETE./api/v1/attributes/{attribute_id}")),
) -> dict[str, Any]:
    require_button_permission(auth, "button.attribute_management.delete")
    attribute = db.get(Attribute, attribute_id)
    if not attribute:
        raise HTTPException(status_code=404, detail="Attribute not found")
    db.delete(attribute)
    db.commit()
    return {"deleted": True, "id": attribute_id}


@app.get("/api/v1/attributes/{attribute_id}/changes", response_model=list[ChangeOut])
def get_attribute_changes(
    attribute_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/attributes/{attribute_id}/changes")),
) -> list[ChangeOut]:
    changes = (
        db.query(AttributeChange)
        .filter(AttributeChange.attribute_id == attribute_id)
        .order_by(AttributeChange.id.desc())
        .all()
    )
    return [change_to_out(change) for change in changes]


@app.post("/api/v1/ai/attribute-recommend")
def recommend_attributes(
    payload: RecommendIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/ai/attribute-recommend")),
) -> dict[str, Any]:
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
def list_brands(
    search: str = "",
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.GET./api/v1/brands")),
) -> list[BrandOut]:
    query = db.query(Brand)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(Brand.name.like(like), Brand.code.like(like), Brand.description.like(like)))
    brands = query.order_by(Brand.id.desc()).all()
    return [brand_to_out(brand) for brand in brands]


@app.post("/api/v1/brands", response_model=BrandOut)
def create_brand(
    payload: BrandIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.POST./api/v1/brands")),
) -> BrandOut:
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
def update_brand(
    brand_id: int,
    payload: BrandUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.PUT./api/v1/brands/{brand_id}")),
) -> BrandOut:
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
def delete_brand(
    brand_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_api_permission("api.DELETE./api/v1/brands/{brand_id}")),
) -> dict[str, Any]:
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
