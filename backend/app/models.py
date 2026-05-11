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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    materials: Mapped[list["Material"]] = relationship(back_populates="material_library")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

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
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    product_name: Mapped[ProductName] = relationship()
    material_library: Mapped[MaterialLibrary] = relationship(back_populates="materials")
    category: Mapped[Category] = relationship(back_populates="materials")
    brand: Mapped[Brand | None] = relationship()
