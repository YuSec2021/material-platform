from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProductName(Base):
    __tablename__ = "product_names"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    unit: Mapped[str] = mapped_column(String(40), default="")
    category: Mapped[str] = mapped_column(String(160), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    attributes: Mapped[list["Attribute"]] = relationship(
        back_populates="product_name",
        cascade="all, delete-orphan",
    )


class Attribute(Base):
    __tablename__ = "attributes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    product_name_id: Mapped[int] = mapped_column(ForeignKey("product_names.id"), index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    data_type: Mapped[str] = mapped_column(String(40), default="text")
    unit: Mapped[str] = mapped_column(String(80), default="")
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    default_value: Mapped[str] = mapped_column(String(240), default="")
    options: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(160), default="manual")
    version: Mapped[int] = mapped_column(Integer, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    product_name: Mapped[ProductName] = relationship(back_populates="attributes")
    changes: Mapped[list["AttributeChange"]] = relationship(
        back_populates="attribute",
        cascade="all, delete-orphan",
        order_by="AttributeChange.id.desc()",
    )


class AttributeChange(Base):
    __tablename__ = "attribute_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    attribute_id: Mapped[int] = mapped_column(ForeignKey("attributes.id"), index=True)
    attribute_code: Mapped[str] = mapped_column(String(64), index=True)
    attribute_name: Mapped[str] = mapped_column(String(160), index=True)
    version: Mapped[int] = mapped_column(Integer)
    operator: Mapped[str] = mapped_column(String(80), default="super_admin")
    changed_fields: Mapped[str] = mapped_column(Text, default="")
    before_values: Mapped[str] = mapped_column(Text, default="{}")
    after_values: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    attribute: Mapped[Attribute] = relationship(back_populates="changes")


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    logo_filename: Mapped[str] = mapped_column(String(240), default="")
    logo_content_type: Mapped[str] = mapped_column(String(120), default="")
    logo_data_url: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MaterialLibrary(Base):
    __tablename__ = "material_libraries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_code_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    recode_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    current_rule_version_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    material_library_admin_id: Mapped[int | None] = mapped_column(ForeignKey("roles.id"), nullable=True, index=True)
    category_library_id: Mapped[int | None] = mapped_column(ForeignKey("category_libraries.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    materials: Mapped[list["Material"]] = relationship(back_populates="material_library")
    material_library_admin: Mapped["Role | None"] = relationship()
    category_library: Mapped["CategoryLibrary | None"] = relationship()
    code_rule_versions: Mapped[list["MaterialCodeRuleVersion"]] = relationship(
        back_populates="library",
        cascade="all, delete-orphan",
        foreign_keys="MaterialCodeRuleVersion.library_id",
    )


class CategoryLibrary(Base):
    __tablename__ = "category_libraries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    categories: Mapped[list["Category"]] = relationship(back_populates="category_library")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    category_library_id: Mapped[int | None] = mapped_column(ForeignKey("category_libraries.id"), nullable=True, index=True)
    parent_category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    category_library: Mapped[CategoryLibrary | None] = relationship(back_populates="categories")
    parent: Mapped["Category | None"] = relationship(remote_side=[id], back_populates="children")
    children: Mapped[list["Category"]] = relationship(back_populates="parent")
    materials: Mapped[list["Material"]] = relationship(back_populates="category")


class Material(Base):
    __tablename__ = "materials"
    __table_args__ = (UniqueConstraint("product_name_id", "name", name="uq_material_product_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(180), index=True)
    product_name_id: Mapped[int] = mapped_column(ForeignKey("product_names.id"), index=True)
    material_library_id: Mapped[int] = mapped_column(ForeignKey("material_libraries.id"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    unit: Mapped[str] = mapped_column(String(40), default="")
    brand_id: Mapped[int | None] = mapped_column(ForeignKey("brands.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(40), default="normal", index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    attributes: Mapped[str] = mapped_column(Text, default="{}")
    original_code: Mapped[str] = mapped_column(String(64), default="")
    previous_code: Mapped[str] = mapped_column(String(64), default="")
    code_rule_version_id: Mapped[int | None] = mapped_column(
        ForeignKey("material_code_rule_versions.id"),
        nullable=True,
        index=True,
    )
    code_change_count: Mapped[int] = mapped_column(Integer, default=0)
    code_status: Mapped[str] = mapped_column(String(40), default="manual", index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    product_name: Mapped[ProductName] = relationship()
    material_library: Mapped[MaterialLibrary] = relationship(back_populates="materials")
    category: Mapped[Category] = relationship(back_populates="materials")
    brand: Mapped[Brand | None] = relationship()
    code_rule_version: Mapped["MaterialCodeRuleVersion | None"] = relationship(
        foreign_keys=[code_rule_version_id],
    )


class MaterialCodeRuleVersion(Base):
    __tablename__ = "material_code_rule_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    library_id: Mapped[int] = mapped_column(ForeignKey("material_libraries.id"), index=True)
    version_no: Mapped[int] = mapped_column(Integer, index=True)
    rule_name: Mapped[str] = mapped_column(String(180), default="")
    rule_config: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(40), default="draft", index=True)
    change_reason: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(80), default="super_admin")
    effective_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    library: Mapped[MaterialLibrary] = relationship(
        back_populates="code_rule_versions",
        foreign_keys=[library_id],
    )


class MaterialCodeSerial(Base):
    __tablename__ = "material_code_serials"
    __table_args__ = (
        UniqueConstraint("library_id", "rule_version_id", "scope_key", name="uq_material_code_serial_scope"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    library_id: Mapped[int] = mapped_column(ForeignKey("material_libraries.id"), index=True)
    rule_version_id: Mapped[int] = mapped_column(ForeignKey("material_code_rule_versions.id"), index=True)
    scope_key: Mapped[str] = mapped_column(String(240), index=True)
    current_value: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MaterialCodeChangeBatch(Base):
    __tablename__ = "material_code_change_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    library_id: Mapped[int] = mapped_column(ForeignKey("material_libraries.id"), index=True)
    old_rule_version_id: Mapped[int | None] = mapped_column(ForeignKey("material_code_rule_versions.id"), nullable=True)
    new_rule_version_id: Mapped[int | None] = mapped_column(ForeignKey("material_code_rule_versions.id"), nullable=True)
    change_mode: Mapped[str] = mapped_column(String(40), default="manual")
    total_count: Mapped[int] = mapped_column(Integer, default=0)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(40), default="preview", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MaterialCodeChangeDetail(Base):
    __tablename__ = "material_code_change_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("material_code_change_batches.id"), index=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), index=True)
    old_code: Mapped[str] = mapped_column(String(64), default="")
    new_code: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MaterialCodeMapping(Base):
    __tablename__ = "material_code_mappings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    library_id: Mapped[int] = mapped_column(ForeignKey("material_libraries.id"), index=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), index=True)
    old_code: Mapped[str] = mapped_column(String(64), default="")
    new_code: Mapped[str] = mapped_column(String(64), default="")
    old_rule_version_id: Mapped[int | None] = mapped_column(ForeignKey("material_code_rule_versions.id"), nullable=True)
    new_rule_version_id: Mapped[int | None] = mapped_column(ForeignKey("material_code_rule_versions.id"), nullable=True)
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("material_code_change_batches.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LLMProviderConfig(Base):
    __tablename__ = "llm_provider_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    provider: Mapped[str] = mapped_column(String(80), index=True)
    model: Mapped[str] = mapped_column(String(160), index=True)
    endpoint: Mapped[str] = mapped_column(String(240), default="")
    capabilities: Mapped[str] = mapped_column(Text, default="[]")
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    connection_status: Mapped[str] = mapped_column(String(40), default="untested")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ModelConfig(Base):
    __tablename__ = "model_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    display_name: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    provider: Mapped[str] = mapped_column(String(80), index=True)
    model_name: Mapped[str] = mapped_column(String(180), index=True)
    base_url: Mapped[str] = mapped_column(String(320), default="")
    encrypted_api_key: Mapped[str] = mapped_column(Text, default="")
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=10)
    fallback_model_id: Mapped[int | None] = mapped_column(ForeignKey("model_config.id"), nullable=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    connection_status: Mapped[str] = mapped_column(String(40), default="untested", index=True)
    last_test_message: Mapped[str] = mapped_column(Text, default="")
    last_test_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    @property
    def model(self) -> str:
        return self.model_name

    @property
    def endpoint(self) -> str:
        return self.base_url

    @property
    def active(self) -> bool:
        return self.enabled


class AIAgentConfig(Base):
    __tablename__ = "ai_agent_config"
    __table_args__ = (UniqueConstraint("config_key", name="uq_ai_agent_config_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    config_key: Mapped[str] = mapped_column(String(120), index=True)
    provider: Mapped[str] = mapped_column(String(80), index=True)
    model_name: Mapped[str] = mapped_column(String(180), index=True)
    base_url: Mapped[str] = mapped_column(String(320), default="")
    encrypted_api_key: Mapped[str] = mapped_column(Text, default="")
    temperature: Mapped[float] = mapped_column(default=0.2)
    max_tokens: Mapped[int] = mapped_column(Integer, default=2048)
    timeout: Mapped[int] = mapped_column(Integer, default=30)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    connection_status: Mapped[str] = mapped_column(String(40), default="untested", index=True)
    last_test_message: Mapped[str] = mapped_column(Text, default="")
    last_test_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    @property
    def model(self) -> str:
        return self.model_name

    @property
    def endpoint(self) -> str:
        return self.base_url

    @property
    def timeout_seconds(self) -> int:
        return self.timeout


class CapabilityAgentMapping(Base):
    __tablename__ = "capability_agent_mapping"
    __table_args__ = (UniqueConstraint("capability", name="uq_capability_agent_mapping"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    capability: Mapped[str] = mapped_column(String(80), index=True)
    agent_config_id: Mapped[int] = mapped_column(ForeignKey("ai_agent_config.id"), index=True)
    fallback_agent_config_id: Mapped[int | None] = mapped_column(ForeignKey("ai_agent_config.id"), nullable=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    agent_config: Mapped[AIAgentConfig] = relationship(foreign_keys=[agent_config_id])
    fallback_agent_config: Mapped[AIAgentConfig | None] = relationship(foreign_keys=[fallback_agent_config_id])


class CapabilityModelMapping(Base):
    __tablename__ = "capability_model_mapping"
    __table_args__ = (UniqueConstraint("capability", name="uq_capability_model_mapping"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    capability: Mapped[str] = mapped_column(String(80), index=True)
    primary_model_id: Mapped[int] = mapped_column(ForeignKey("model_config.id"), index=True)
    fallback_model_id: Mapped[int | None] = mapped_column(ForeignKey("model_config.id"), nullable=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    primary_model: Mapped[ModelConfig] = relationship(foreign_keys=[primary_model_id])
    fallback_model: Mapped[ModelConfig | None] = relationship(foreign_keys=[fallback_model_id])


class TracerSpan(Base):
    __tablename__ = "tracer_spans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trace_id: Mapped[str] = mapped_column(String(80), index=True)
    span_id: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    parent_span_id: Mapped[str] = mapped_column(String(80), default="", index=True)
    operation_name: Mapped[str] = mapped_column(String(160), index=True)
    span_type: Mapped[str] = mapped_column(String(40), index=True)
    capability: Mapped[str] = mapped_column(String(80), default="", index=True)
    provider: Mapped[str] = mapped_column(String(80), default="", index=True)
    model: Mapped[str] = mapped_column(String(180), default="", index=True)
    status: Mapped[str] = mapped_column(String(40), default="ok", index=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")
    error: Mapped[str] = mapped_column(Text, default="")


class SystemConfig(Base):
    __tablename__ = "system_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_by: Mapped[str] = mapped_column(String(80), default="system")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user: Mapped[str] = mapped_column(String(120), default="system", index=True)
    resource: Mapped[str] = mapped_column(String(160), default="", index=True)
    action: Mapped[str] = mapped_column(String(80), default="", index=True)
    before_value: Mapped[str] = mapped_column(Text, default="{}")
    after_value: Mapped[str] = mapped_column(Text, default="{}")
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    source: Mapped[str] = mapped_column(String(40), default="human", index=True)


class WorkflowApplication(Base):
    __tablename__ = "workflow_applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    application_no: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(64), index=True)
    applicant: Mapped[str] = mapped_column(String(120), default="material_manager", index=True)
    current_node: Mapped[str] = mapped_column(String(80), default="")
    business_reason: Mapped[str] = mapped_column(Text, default="")
    rejection_reason: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[str] = mapped_column(Text, default="{}")
    created_resource_type: Mapped[str] = mapped_column(String(40), default="")
    created_resource_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    history: Mapped[list["WorkflowHistory"]] = relationship(
        back_populates="application",
        cascade="all, delete-orphan",
        order_by="WorkflowHistory.id",
    )


class WorkflowHistory(Base):
    __tablename__ = "workflow_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("workflow_applications.id"), index=True)
    actor: Mapped[str] = mapped_column(String(120), default="")
    node: Mapped[str] = mapped_column(String(80), default="")
    action: Mapped[str] = mapped_column(String(40), index=True)
    from_status: Mapped[str] = mapped_column(String(64), default="")
    to_status: Mapped[str] = mapped_column(String(64), default="")
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    application: Mapped[WorkflowApplication] = relationship(back_populates="history")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(160), index=True)
    hcm_id: Mapped[str] = mapped_column(String(80), default="", index=True)
    unit: Mapped[str] = mapped_column(String(160), default="", index=True)
    department: Mapped[str] = mapped_column(String(160), default="", index=True)
    team: Mapped[str] = mapped_column(String(160), default="", index=True)
    email: Mapped[str] = mapped_column(String(240), default="")
    account_ownership: Mapped[str] = mapped_column(String(40), default="local", index=True)
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    password_reset_token: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    role_links: Mapped[list["RoleUser"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user_links: Mapped[list["RoleUser"]] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
    )
    permissions: Mapped[list["FeaturePermission"]] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
    )


class RoleCodeSequence(Base):
    __tablename__ = "role_code_sequence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    current_value: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RoleUser(Base):
    __tablename__ = "role_users"
    __table_args__ = (UniqueConstraint("role_id", "user_id", name="uq_role_user_binding"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    role: Mapped[Role] = relationship(back_populates="user_links")
    user: Mapped[User] = relationship(back_populates="role_links")


class FeaturePermission(Base):
    __tablename__ = "feature_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_key", name="uq_role_permission_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), index=True)
    module: Mapped[str] = mapped_column(String(80), index=True)
    permission_type: Mapped[str] = mapped_column(String(40), index=True)
    permission_key: Mapped[str] = mapped_column(String(160), index=True)
    label: Mapped[str] = mapped_column(String(240), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    role: Mapped[Role] = relationship(back_populates="permissions")


class RuleCategory(Base):
    __tablename__ = "rule_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    display_name_zh: Mapped[str] = mapped_column(String(160), default="")
    display_name_en: Mapped[str] = mapped_column(String(160), default="")
    description_zh: Mapped[str] = mapped_column(Text, default="")
    description_en: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(80), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    rules: Mapped[list["Rule"]] = relationship(
        back_populates="category",
        cascade="all, delete-orphan",
    )


class Rule(Base):
    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("rule_categories.id"), index=True)
    name: Mapped[str] = mapped_column(String(180), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    pattern: Mapped[str] = mapped_column(Text, default="")
    value: Mapped[str] = mapped_column(Text, default="")
    options: Mapped[str] = mapped_column(Text, default="{}")
    priority: Mapped[int] = mapped_column(Integer, default=100, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    category: Mapped[RuleCategory] = relationship(back_populates="rules")
