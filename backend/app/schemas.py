from typing import Any

from pydantic import BaseModel, Field


class ProductNameOut(BaseModel):
    id: int
    name: str
    unit: str
    category: str


class AttributeIn(BaseModel):
    product_name_id: int | None = None
    product_name: str | None = None
    name: str
    data_type: str = "text"
    unit: str = ""
    required: bool = False
    default_value: str = ""
    options: list[str] | str = Field(default_factory=list)
    description: str = ""
    source: str = "manual"


class AttributeUpdate(BaseModel):
    name: str | None = None
    data_type: str | None = None
    unit: str | None = None
    required: bool | None = None
    default_value: str | None = None
    options: list[str] | str | None = None
    description: str | None = None
    source: str | None = None
    enabled: bool | None = None


class AttributeOut(BaseModel):
    id: int
    code: str
    product_name_id: int
    product_name: str
    name: str
    data_type: str
    unit: str
    required: bool
    default_value: str
    options: list[str]
    description: str
    source: str
    version: int
    enabled: bool


class ChangeOut(BaseModel):
    id: int
    attribute_id: int
    attribute_code: str
    attribute_name: str
    version: int
    operator: str
    changed_fields: list[str]
    before_values: dict[str, Any]
    after_values: dict[str, Any]
    created_at: str


class GovernancePreviewIn(BaseModel):
    product_name_id: int | None = None
    product_name: str | None = None
    rows: str | list[str]


class GovernanceImportIn(BaseModel):
    product_name_id: int | None = None
    product_name: str | None = None
    items: list[dict[str, Any]]


class RecommendIn(BaseModel):
    product_name_id: int | None = None
    product_name: str | None = None


class BrandLogo(BaseModel):
    filename: str = ""
    content_type: str = ""
    data_url: str = ""


class BrandIn(BaseModel):
    name: str
    description: str = ""
    logo: BrandLogo = Field(default_factory=BrandLogo)
    enabled: bool = True


class BrandUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    logo: BrandLogo | None = None
    enabled: bool | None = None


class BrandOut(BaseModel):
    id: int
    code: str
    name: str
    description: str
    logo: BrandLogo
    enabled: bool


class MaterialLibraryOut(BaseModel):
    id: int
    code: str
    name: str
    description: str
    enabled: bool


class MaterialLibraryIn(BaseModel):
    name: str
    description: str = ""
    enabled: bool = True


class MaterialLibraryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None


class CategoryOut(BaseModel):
    id: int
    code: str
    name: str
    description: str
    enabled: bool


class MaterialIn(BaseModel):
    name: str
    product_name_id: int
    material_library_id: int
    category_id: int
    unit: str = ""
    brand_id: int | None = None
    status: str = "normal"
    description: str = ""
    attributes: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class MaterialUpdate(BaseModel):
    name: str | None = None
    product_name_id: int | None = None
    material_library_id: int | None = None
    category_id: int | None = None
    unit: str | None = None
    brand_id: int | None = None
    status: str | None = None
    transition_reason: str | None = None
    description: str | None = None
    attributes: dict[str, Any] | None = None
    enabled: bool | None = None


class MaterialTransitionIn(BaseModel):
    target_status: str
    reason: str


class ManualStopPurchaseIn(BaseModel):
    reason: str
    actor: str = "super_admin"


class MaterialOut(BaseModel):
    id: int
    code: str
    name: str
    product_name_id: int
    product_name: str
    material_library_id: int
    material_library: str
    category_id: int
    category: str
    unit: str
    brand_id: int | None
    brand: str
    status: str
    description: str
    attributes: dict[str, Any]
    lifecycle_history: list[dict[str, Any]] = Field(default_factory=list)
    enabled: bool
    created_at: str
    updated_at: str


class MaterialGovernancePreviewIn(BaseModel):
    product_name_id: int | None = None
    product_name: str | None = None
    material_library_id: int | None = None
    category_id: int | None = None
    rows: str | list[str] | list[dict[str, Any]] | None = None
    file_name: str = ""
    file_content: str = ""


class MaterialGovernanceImportIn(BaseModel):
    product_name_id: int | None = None
    product_name: str | None = None
    material_library_id: int | None = None
    category_id: int | None = None
    items: list[dict[str, Any]]


class AiMaterialAddPreviewIn(BaseModel):
    input_text: str
    material_library_id: int
    category_id: int | None = None
    product_name_id: int | None = None
    brand_id: int | None = None
    unit: str | None = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)


class AiMaterialAddConfirmIn(BaseModel):
    preview: dict[str, Any]
    allow_duplicate: bool = False


class MaterialMatchIn(BaseModel):
    material_library_id: int
    query: str | None = None
    name: str | None = None
    brand: str | None = None
    brand_id: int | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    description: str = ""
    top_k: int = 3


class ProviderConfigIn(BaseModel):
    display_name: str | None = None
    name: str | None = None
    provider: str = "mock"
    model: str | None = None
    model_name: str | None = None
    endpoint: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    capabilities: list[str] = Field(default_factory=lambda: ["material_add", "material_match"])
    active: bool | None = None
    enabled: bool | None = None
    timeout_seconds: int = 10
    fallback_model_id: int | None = None


class ProviderConfigOut(BaseModel):
    id: int
    display_name: str
    provider: str
    model: str
    model_name: str
    endpoint: str
    base_url: str
    api_key_masked: str
    capabilities: list[str]
    active: bool
    enabled: bool
    timeout_seconds: int
    fallback_model_id: int | None = None
    connection_status: str
    last_test_message: str = ""
    last_test_at: str | None = None
    updated_at: str


class CapabilityMappingIn(BaseModel):
    capability: str
    primary_model_id: int
    fallback_model_id: int | None = None
    enabled: bool = True


class CapabilityMappingOut(BaseModel):
    id: int
    capability: str
    primary_model_id: int
    primary_model_name: str
    fallback_model_id: int | None = None
    fallback_model_name: str = ""
    enabled: bool
    updated_at: str


class GatewayInvokeIn(BaseModel):
    prompt: str = "Sprint 10 gateway test"
    messages: list[dict[str, Any]] = Field(default_factory=list)


class TraceSummaryOut(BaseModel):
    trace_id: str
    operation_name: str
    capability: str
    status: str
    start_time: str
    duration_ms: int
    span_count: int


class TraceDetailOut(BaseModel):
    trace_id: str
    spans: list[dict[str, Any]]
    storage_table: str = "tracer.spans"


class ReasonOption(BaseModel):
    name: str
    enabled: bool = True


class SystemIcon(BaseModel):
    filename: str = ""
    content_type: str = ""
    data_url: str = ""


class SystemConfigIn(BaseModel):
    system_name: str | None = None
    icon: SystemIcon | None = None
    stop_purchase_reasons: list[ReasonOption | str] | None = None
    stop_use_reasons: list[ReasonOption | str] | None = None
    approval_mode: str | None = None


class SystemConfigOut(BaseModel):
    system_name: str
    icon: SystemIcon
    stop_purchase_reasons: list[ReasonOption]
    stop_use_reasons: list[ReasonOption]
    approval_mode: str
    updated_by: str
    updated_at: str


class AuditLogOut(BaseModel):
    id: int
    user: str
    resource: str
    action: str
    before_value: dict[str, Any]
    after_value: dict[str, Any]
    timestamp: str
    source: str


class AuditLogListOut(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    page_size: int
    pages: int


class WorkflowApplicationIn(BaseModel):
    type: str
    applicant: str = "material_manager"
    business_reason: str
    material_id: int | None = None
    reason_code: str | None = None
    reason: str | None = None
    acknowledge_terminal: bool = False
    material_library_id: int | None = None
    parent_category_id: int | None = None
    proposed_category_name: str | None = None
    proposed_category_code: str | None = None
    description: str = ""
    product_name_id: int | None = None
    category_id: int | None = None
    material_name: str | None = None
    unit: str = ""
    brand_id: int | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    reference_mall_link: str = ""
    reference_images: list[dict[str, Any] | str] = Field(default_factory=list)


class WorkflowActionIn(BaseModel):
    actor: str = "approver"
    node: str | None = None
    comment: str = ""


class WorkflowHistoryOut(BaseModel):
    id: int
    actor: str
    node: str
    action: str
    from_status: str
    to_status: str
    comment: str
    created_at: str


class WorkflowApplicationOut(BaseModel):
    id: int
    application_no: str
    type: str
    status: str
    applicant: str
    current_node: str
    business_reason: str
    rejection_reason: str
    data: dict[str, Any]
    approval_history: list[WorkflowHistoryOut]
    created_resource_type: str
    created_resource_id: int | None
    created_at: str
    updated_at: str


class RoleSummaryOut(BaseModel):
    id: int
    name: str
    code: str
    enabled: bool


class UserIn(BaseModel):
    username: str
    display_name: str
    unit: str = ""
    department: str = ""
    team: str = ""
    email: str = ""
    status: str = "active"


class UserUpdate(BaseModel):
    display_name: str | None = None
    unit: str | None = None
    department: str | None = None
    team: str | None = None
    email: str | None = None
    status: str | None = None


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    hcm_id: str
    unit: str
    department: str
    team: str
    email: str
    account_ownership: str
    account_owner: str
    status: str
    roles: list[RoleSummaryOut] = Field(default_factory=list)
    created_at: str
    updated_at: str


class PasswordResetOut(BaseModel):
    user_id: int
    username: str
    reset_token: str
    temporary_password: str
    message: str


class RoleIn(BaseModel):
    name: str
    code: str
    description: str = ""
    enabled: bool = True


class RoleUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    enabled: bool | None = None


class UserSummaryOut(BaseModel):
    id: int
    username: str
    display_name: str
    unit: str
    department: str
    team: str
    account_ownership: str
    status: str


class PermissionEntry(BaseModel):
    module: str
    permission_type: str
    permission_key: str
    label: str


class RoleOut(BaseModel):
    id: int
    name: str
    code: str
    description: str
    enabled: bool
    users: list[UserSummaryOut] = Field(default_factory=list)
    user_count: int = 0
    permissions: list[PermissionEntry] = Field(default_factory=list)
    created_at: str
    updated_at: str


class RoleUserBindingIn(BaseModel):
    user_id: int


class RoleUserReplaceIn(BaseModel):
    user_ids: list[int] = Field(default_factory=list)


class RolePermissionsIn(BaseModel):
    permission_keys: list[str] = Field(default_factory=list)
    permissions: list[PermissionEntry] = Field(default_factory=list)


class RolePermissionsOut(BaseModel):
    role_id: int
    role_name: str
    permissions: list[PermissionEntry]
    catalog: list[PermissionEntry]


class AuthLoginIn(BaseModel):
    username: str


class AuthUserOut(BaseModel):
    id: int | None
    username: str
    display_name: str
    is_super_admin: bool
    permissions: list[str] = Field(default_factory=list)
    material_library_scope_ids: list[int] | None = None
    roles: list[RoleSummaryOut] = Field(default_factory=list)
