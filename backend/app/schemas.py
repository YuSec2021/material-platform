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
