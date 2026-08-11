import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Edit,
  FileInput,
  Image,
  Lock,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  apiClient,
  type Attribute,
  type Category,
  type CategoryAttribute,
  type Material,
  type MaterialCategoryMatch,
  type MaterialCodeRuleVersion,
  type MaterialLibrary,
  type MaterialPayload,
  type ProductName,
} from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Switch } from "@/app/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { ApiState } from "../../common/ApiState";
import { Modal } from "../../common/Modal";
import { SearchableSelect } from "../../common/SearchableSelect";
import { MaterialBulkImportModal } from "./MaterialBulkImportModal";

type MaterialFormState = {
  name: string;
  material_library_id: number | "";
  category_id: number | "";
  product_name_id: number | "";
  description: string;
  attributes: Record<string, string>;
  images: File[];
  attachments: File[];
};

type LifecycleAction = "stop_purchase" | "stop_use";
type SegmentType = "fixed" | "category_path" | "attribute_code" | "date" | "serial";

type CodePreview = {
  code: string;
  error: string | null;
};

const emptyForm: MaterialFormState = {
  name: "",
  material_library_id: "",
  category_id: "",
  product_name_id: "",
  description: "",
  attributes: {},
  images: [],
  attachments: [],
};

function normalizeStatus(status: Material["status"]): "normal" | "stop_purchase" | "stop_use" {
  if (status === "stop-purchase") {
    return "stop_purchase";
  }
  if (status === "stop-use") {
    return "stop_use";
  }
  return status;
}

function statusMeta(status: Material["status"]) {
  const normalized = normalizeStatus(status);
  if (normalized === "stop_purchase") {
    return {
      label: "停采",
      className: "border-warning/30 bg-warning/10 text-warning",
    };
  }
  if (normalized === "stop_use") {
    return {
      label: "停用",
      className: "border-border bg-accent text-foreground",
    };
  }
  return {
    label: "正常",
    className: "border-success/30 bg-success/10 text-success",
  };
}

function materialToForm(material: Material): MaterialFormState {
  const attributes = Object.fromEntries(
    Object.entries(material.attributes ?? {})
      .filter(([key]) => !key.startsWith("_"))
      .map(([key, value]) => [key, String(value ?? "")]),
  );

  return {
    name: material.name,
    material_library_id: material.material_library_id,
    category_id: material.category_id,
    product_name_id: material.product_name_id ?? "",
    description: material.description,
    attributes,
    images: [],
    attachments: [],
  };
}

function selectedName<T extends { id: number; name: string }>(items: T[] | undefined, id: number | "") {
  return items?.find((item) => item.id === id)?.name ?? "";
}

function categoryLibraryIdsForMaterialLibrary(library: MaterialLibrary | undefined): number[] {
  const ids = library?.category_library_ids?.length
    ? library.category_library_ids
    : library?.category_library_id
      ? [library.category_library_id]
      : [];
  return Array.from(new Set(ids.filter((id): id is number => typeof id === "number")));
}

function categoryAttributeLabel(attribute: CategoryAttribute, language: string) {
  if (language === "en-US") {
    return attribute.display_name_en || attribute.name;
  }
  return attribute.display_name_zh || attribute.name;
}

function sortedCategoryAttributes(attributes: CategoryAttribute[]) {
  return [...attributes].sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);
}

function segmentTypeFromRaw(raw: unknown): SegmentType {
  if (raw === "fixed_text") {
    return "fixed";
  }
  if (raw === "serial_number") {
    return "serial";
  }
  if (["fixed", "category_path", "attribute_code", "date", "serial"].includes(String(raw))) {
    return raw as SegmentType;
  }
  return "fixed";
}

function renderDateSegment(format: string) {
  const current = new Date();
  const year = String(current.getFullYear());
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");
  if (format === "YYYY") {
    return year;
  }
  if (format === "YYMM") {
    return `${year.slice(2)}${month}`;
  }
  return `${year}${month}${day}`;
}

function valueMapping(segment: Record<string, unknown>) {
  if (Array.isArray(segment.mappings)) {
    return Object.fromEntries(
      segment.mappings
        .map((item) => (typeof item === "object" && item ? item as Record<string, unknown> : null))
        .filter(Boolean)
        .map((item) => [String(item?.value ?? ""), String(item?.code ?? "")]),
    );
  }
  const mapping = segment.value_to_code ?? segment.value_to_code_mapping;
  return typeof mapping === "object" && mapping ? mapping as Record<string, string> : {};
}

function serialPreview(segment: Record<string, unknown>, materials: Material[]) {
  const length = Number(segment.length ?? segment.padding_length ?? 3) || 3;
  const start = Number(segment.start ?? segment.start_value ?? 1) || 1;
  const step = Number(segment.step ?? 1) || 1;
  const current = Math.max(0, materials.length) > 0 ? start + (materials.length - 1) * step : start - step;
  return String(current + step).padStart(length, "0");
}

function buildMaterialCodePreview(
  rule: MaterialCodeRuleVersion | undefined,
  form: MaterialFormState,
  category: Category | undefined,
  materials: Material[],
): CodePreview {
  if (!rule) {
    return { code: "", error: null };
  }

  const parts: string[] = [];
  for (const segment of rule.segments) {
    const type = segmentTypeFromRaw(segment.type);
    if (type === "fixed") {
      parts.push(String(segment.value ?? segment.text ?? segment.literal ?? "").trim().toUpperCase());
    } else if (type === "date") {
      parts.push(renderDateSegment(String(segment.format ?? "YYYYMMDD")));
    } else if (type === "category_path") {
      if (!category) {
        return { code: "", error: "请选择类目后预览自动编码。" };
      }
      const source = String(segment.source ?? "code");
      const raw = source === "name" ? category.name : category.code;
      const length = Number(segment.length ?? segment.max_length ?? 0) || 0;
      parts.push(raw.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase().slice(0, length || undefined));
    } else if (type === "attribute_code") {
      const attributeName = String(segment.attribute ?? segment.attribute_name ?? segment.name ?? "");
      const value = form.attributes[attributeName];
      if (value === undefined || value === "") {
        return { code: "", error: `请填写属性 ${attributeName} 后预览自动编码。` };
      }
      const mapped = valueMapping(segment)[String(value)] ?? String(value);
      parts.push(mapped.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase());
    } else if (type === "serial") {
      parts.push(serialPreview(segment, materials));
    }
  }
  return { code: parts.join(rule.separator ?? ""), error: null };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function toPayload(form: MaterialFormState, attributes: Attribute[], categoryProperties: CategoryAttribute[]): MaterialPayload {
  const attributePayload = attributes.reduce<Record<string, unknown>>((current, attribute) => {
    current[attribute.name] = form.attributes[attribute.name] ?? "";
    return current;
  }, {});
  for (const property of categoryProperties) {
    attributePayload[property.name] = form.attributes[property.name] ?? "";
  }

  return {
    name: form.name.trim(),
    material_library_id: Number(form.material_library_id),
    category_id: Number(form.category_id),
    product_name_id: form.product_name_id === "" ? null : Number(form.product_name_id),
    unit: "",
    unit_id: null,
    brand_id: null,
    description: form.description.trim(),
    status: "normal",
    attributes: {
      ...attributePayload,
      _images: form.images.map((file) => file.name),
      _attachments: form.attachments.map((file) => file.name),
    },
    enabled: true,
  };
}

function MaterialCategoryNode({
  category,
  selectedCategoryId,
  expandedCategoryIds,
  onToggle,
  onSelect,
}: {
  category: Category;
  selectedCategoryId: number | "";
  expandedCategoryIds: number[];
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
}) {
  const expanded = expandedCategoryIds.includes(category.id);
  const selected = selectedCategoryId === category.id;
  const childrenQuery = useQuery({
    queryKey: ["material-category-children", category.id],
    queryFn: () => apiClient.categoriesByParams({ parent_id: category.id, limit: 500 }),
    enabled: expanded,
    retry: false,
  });
  const children = childrenQuery.data ?? [];

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onToggle(category.id);
          onSelect(category.id);
        }}
        className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm ${
          selected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
        }`}
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="truncate">{category.name}</span>
      </button>
      {expanded && children.length > 0 && (
        <div className="mt-1 space-y-1 pl-3">
          {children.map((child) => (
            <MaterialCategoryNode
              key={child.id}
              category={child}
              selectedCategoryId={selectedCategoryId}
              expandedCategoryIds={expandedCategoryIds}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MaterialLibraryCategoryRoots({
  categoryLibraryIds,
  selectedCategoryId,
  expandedCategoryIds,
  onToggle,
  onSelect,
}: {
  categoryLibraryIds: number[];
  selectedCategoryId: number | "";
  expandedCategoryIds: number[];
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
}) {
  const rootQueries = useQueries({
    queries: categoryLibraryIds.map((categoryLibraryId) => ({
      queryKey: ["material-category-roots", categoryLibraryId],
      queryFn: () => apiClient.categoriesByParams({ category_library_id: categoryLibraryId, level: 1, limit: 500 }),
      retry: false,
    })),
  });
  const isLoading = rootQueries.some((query) => query.isLoading);
  const roots = rootQueries.flatMap((query) => query.data ?? []);

  if (categoryLibraryIds.length === 0) {
    return <p className="pl-3 py-1.5 text-xs text-muted-foreground">该物料库未关联类目库</p>;
  }
  if (isLoading) {
    return <p className="pl-3 py-1.5 text-xs text-muted-foreground">加载中...</p>;
  }
  if (roots.length === 0) {
    return <p className="pl-3 py-1.5 text-xs text-muted-foreground">该类目库暂无类目</p>;
  }
  return (
    <div className="mt-1 space-y-1 pl-3">
      {roots.map((category) => (
        <MaterialCategoryNode
          key={category.id}
          category={category}
          selectedCategoryId={selectedCategoryId}
          expandedCategoryIds={expandedCategoryIds}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function CategoryPropertyField({
  property,
  value,
  language,
  onChange,
}: {
  property: CategoryAttribute;
  value: string;
  language: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const required = property.required || !property.allow_empty;
  const label = categoryAttributeLabel(property, language);
  const inputClass =
    "w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/40";

  return (
    <label
      className={`space-y-1 rounded-md border p-3 text-sm ${
        required ? "border-warning/30 bg-warning/10 text-warning" : "border-border text-foreground"
      }`}
    >
      <span className="flex flex-wrap items-center gap-2">
        {property.is_inherited && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
        <span>{label}</span>
        {required && <span className="text-destructive">*</span>}
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
          {t(`categoryProperties.types.${property.attr_type}`)}
        </span>
      </span>
      <span className="block font-mono text-xs text-muted-foreground">{property.name}</span>
      {property.is_inherited && (
        <span className="block text-xs text-muted-foreground">
          {t("categoryProperties.sourceLabel", { name: property.inherited_from_category_name ?? property.source_category_name })}
        </span>
      )}
      {property.attr_type === "enum" ? (
        <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
          <option value="">{property.allow_empty ? t("categoryProperties.noDefault") : t("categoryProperties.defaultPlaceholder")}</option>
          {property.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={property.attr_type === "number" ? "number" : "text"}
          value={value}
          placeholder={property.default_value ?? t("categoryProperties.defaultPlaceholder")}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      )}
    </label>
  );
}

export function MaterialList({ fixedLibraryId }: { fixedLibraryId?: number } = {}) {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [selectedLibraryId, setSelectedLibraryId] = useState<number | "">("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "">("");
  const [expandedLibraryIds, setExpandedLibraryIds] = useState<number[]>([]);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "normal" | "stop_purchase" | "stop_use">("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [form, setForm] = useState<MaterialFormState>(emptyForm);
  const [imageFeedback, setImageFeedback] = useState("");
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [lifecycleMaterial, setLifecycleMaterial] = useState<Material | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction>("stop_purchase");
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [lifecycleFeedback, setLifecycleFeedback] = useState("");
  const [categoryMatches, setCategoryMatches] = useState<MaterialCategoryMatch[]>([]);
  const [selectedAiCategoryId, setSelectedAiCategoryId] = useState<number | null>(null);
  const [categoryMatchMessage, setCategoryMatchMessage] = useState("");
  const [materialPendingDelete, setMaterialPendingDelete] = useState<Material | null>(null);
  const categoryPropertiesSectionRef = useRef<HTMLElement | null>(null);

  const materialsQuery = useQuery({
    queryKey: ["materials", searchTerm, statusFilter, selectedLibraryId, selectedCategoryId],
    queryFn: () =>
      apiClient.materials({
        search: searchTerm.trim(),
        status: statusFilter,
        material_library_id: selectedLibraryId === "" ? null : selectedLibraryId,
        category_id: selectedCategoryId === "" ? null : selectedCategoryId,
      }),
    retry: false,
  });

  const librariesQuery = useQuery({
    queryKey: ["material-libraries"],
    queryFn: apiClient.materialLibraries,
    retry: false,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: apiClient.categories,
    retry: false,
  });

  const productNamesQuery = useQuery({
    queryKey: ["product-names"],
    queryFn: apiClient.productNames,
    retry: false,
  });

  const selectedProductNameId = form.product_name_id === "" ? null : Number(form.product_name_id);
  const selectedCategoryIdForProperties = form.category_id === "" ? null : Number(form.category_id);
  const attributesQuery = useQuery({
    queryKey: ["attributes", selectedProductNameId],
    queryFn: () => apiClient.attributes(selectedProductNameId),
    enabled: isFormOpen && selectedProductNameId !== null,
    retry: false,
  });

  const categoryPropertiesQuery = useQuery({
    queryKey: ["category-properties", selectedCategoryIdForProperties],
    queryFn: () => apiClient.categoryProperties(Number(selectedCategoryIdForProperties)),
    enabled: isFormOpen && selectedCategoryIdForProperties !== null,
    retry: false,
  });

  useEffect(() => {
    const libraries = librariesQuery.data ?? [];
    if (fixedLibraryId) {
      setSelectedLibraryId(fixedLibraryId);
      setExpandedLibraryIds([fixedLibraryId]);
      return;
    }
    if (libraries.length === 0) {
      setSelectedLibraryId("");
      setExpandedLibraryIds([]);
      return;
    }
    if (selectedLibraryId === "" || !libraries.some((library) => library.id === selectedLibraryId)) {
      const preferredLibrary = libraries.find((library) => (library.material_count ?? 0) > 0) ?? libraries[0]!;
      setSelectedLibraryId(preferredLibrary.id);
      setExpandedLibraryIds([preferredLibrary.id]);
    }
  }, [fixedLibraryId, librariesQuery.data, selectedLibraryId]);

  useEffect(() => {
    if (!isFormOpen || !categoryPropertiesQuery.data) {
      return;
    }
    setForm((current) => {
      const nextAttributes = { ...current.attributes };
      for (const property of categoryPropertiesQuery.data.properties) {
        if (!(property.name in nextAttributes) && property.default_value) {
          nextAttributes[property.name] = property.default_value;
        }
      }
      return { ...current, attributes: nextAttributes };
    });
  }, [categoryPropertiesQuery.data, isFormOpen]);

  useEffect(() => {
    if (!isFormOpen || !selectedCategoryIdForProperties || !categoryPropertiesQuery.data) {
      return;
    }
    window.requestAnimationFrame(() => {
      categoryPropertiesSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, [categoryPropertiesQuery.data, isFormOpen, selectedCategoryIdForProperties]);

  const materialRows = useMemo(() => materialsQuery.data ?? [], [materialsQuery.data]);
  const libraries = librariesQuery.data ?? [];
  const selectedLibrary = libraries.find((library) => library.id === form.material_library_id);
  const linkedCategoryLibraryIds = useMemo(
    () => categoryLibraryIdsForMaterialLibrary(selectedLibrary),
    [selectedLibrary],
  );
  const linkedCategoryQueries = useQueries({
    queries: linkedCategoryLibraryIds.map((categoryLibraryId) => ({
      queryKey: ["categories", "by-library", categoryLibraryId],
      queryFn: () => apiClient.categoriesByParams({ category_library_id: categoryLibraryId, limit: 1000 }),
      retry: false,
    })),
  });
  const categories = useMemo(() => {
    if (linkedCategoryLibraryIds.length === 0) {
      return categoriesQuery.data ?? [];
    }
    const merged = new Map<number, Category>();
    linkedCategoryQueries.forEach((query) => {
      (query.data ?? []).forEach((category) => merged.set(category.id, category));
    });
    return Array.from(merged.values());
  }, [categoriesQuery.data, linkedCategoryLibraryIds, linkedCategoryQueries]);
  const availableCategories = categories.filter(
    (category) =>
      linkedCategoryLibraryIds.length === 0 ||
      category.id === form.category_id ||
      (
        category.category_library_id !== null &&
        linkedCategoryLibraryIds.includes(category.category_library_id)
      ),
  );
  const selectedCategory = categories.find((category) => category.id === form.category_id);
  const productNames = (productNamesQuery.data ?? []).filter(
    (productName) =>
      productName.status === "active" &&
      (
        !selectedCategory ||
        (
          typeof productName.category_id === "number"
            ? productName.category_id === selectedCategory.id
            : !productName.category || productName.category === selectedCategory.name
        )
      ),
  );
  const dynamicAttributes = (attributesQuery.data ?? []).filter((attribute) => attribute.enabled);
  const inheritedCategoryProperties = useMemo(
    () => sortedCategoryAttributes(categoryPropertiesQuery.data?.inherited ?? []),
    [categoryPropertiesQuery.data?.inherited],
  );
  const ownCategoryProperties = useMemo(
    () => sortedCategoryAttributes(categoryPropertiesQuery.data?.own ?? []),
    [categoryPropertiesQuery.data?.own],
  );
  const effectiveCategoryProperties = useMemo(
    () => [...inheritedCategoryProperties, ...ownCategoryProperties],
    [inheritedCategoryProperties, ownCategoryProperties],
  );
  const missingRequiredCategoryProperties = effectiveCategoryProperties.filter((property) => {
    if (!(property.required || !property.allow_empty)) {
      return false;
    }
    return !String(form.attributes[property.name] ?? "").trim();
  });
  const canUseAiCategoryMatch = !editingMaterial && linkedCategoryLibraryIds.length > 0;

  const currentRuleQuery = useQuery({
    queryKey: ["material-code-rule-current", form.material_library_id],
    queryFn: () => apiClient.currentCodeRule(Number(form.material_library_id)),
    enabled: isFormOpen && !editingMaterial && Boolean(selectedLibrary?.auto_code_enabled && form.material_library_id),
    retry: false,
  });

  const materialCodePreview = useMemo(
    () => buildMaterialCodePreview(currentRuleQuery.data, form, selectedCategory, materialRows),
    [currentRuleQuery.data, form, materialRows, selectedCategory],
  );

  const resetCategoryMatchState = () => {
    setCategoryMatches([]);
    setSelectedAiCategoryId(null);
    setCategoryMatchMessage("");
  };

  const saveMutation = useMutation({
    mutationFn: (payload: MaterialPayload) =>
      editingMaterial ? apiClient.updateMaterial(editingMaterial.id, payload) : apiClient.createMaterial(payload),
    onSuccess: async () => {
      setIsFormOpen(false);
      setEditingMaterial(null);
      setForm(emptyForm);
      setImageFeedback("");
      toast.success(t("toast.saveSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (error) => toast.error(`${t("toast.saveFailed")}: ${error.message}`),
  });

  const categoryMatchMutation = useMutation({
    mutationFn: () =>
      apiClient.matchMaterialCategory({
        material_name: form.name.trim(),
        brand: "",
        description: form.description.trim(),
        category_library_ids: linkedCategoryLibraryIds,
      }),
    onMutate: () => {
      setCategoryMatches([]);
      setSelectedAiCategoryId(null);
      setCategoryMatchMessage("");
    },
    onSuccess: (result) => {
      const matches = result.matches ?? result.results ?? [];
      setCategoryMatches(matches);
      if (matches.length > 0) {
        const topMatch = matches[0]!;
        setSelectedAiCategoryId(topMatch.category_id);
        setForm((current) => ({ ...current, category_id: topMatch.category_id }));
        setCategoryMatchMessage("");
      } else {
        setCategoryMatchMessage(t("material.aiCategoryEmpty"));
      }
    },
    onError: (error) => {
      setCategoryMatches([]);
      setSelectedAiCategoryId(null);
      setCategoryMatchMessage(`${t("material.aiCategoryError")}: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteMaterial(id),
    onSuccess: async () => {
      setMaterialPendingDelete(null);
      toast.success(t("toast.deleteSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (error) => toast.error(`${t("toast.deleteFailed")}: ${error.message}`),
  });

  const enabledMutation = useMutation({
    mutationFn: ({ material, enabled }: { material: Material; enabled: boolean }) =>
      apiClient.updateMaterial(material.id, { enabled }),
    onSuccess: async () => {
      toast.success("物料启停状态已更新");
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const lifecycleMutation = useMutation({
    mutationFn: ({ material, action, reason }: { material: Material; action: LifecycleAction; reason: string }) =>
      action === "stop_purchase"
        ? apiClient.stopPurchaseMaterial(material.id, reason)
        : apiClient.transitionMaterial(material.id, "stop_use", reason),
    onSuccess: async (_updated, variables) => {
      setLifecycleFeedback(`${variables.action === "stop_purchase" ? "停采" : "停用"}成功：${variables.reason}`);
      toast.success(t("toast.lifecycleSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (error) => {
      setLifecycleFeedback(`操作失败：${error.message}`);
      toast.error(`${t("toast.lifecycleFailed")}: ${error.message}`);
    },
  });

  const openCreateForm = () => {
    setEditingMaterial(null);
    resetCategoryMatchState();
    setForm({
      ...emptyForm,
      material_library_id: selectedLibraryId,
      category_id: selectedCategoryId,
    });
    setImageFeedback("");
    setIsFormOpen(true);
  };

  const openEditForm = (material: Material) => {
    setEditingMaterial(material);
    resetCategoryMatchState();
    setForm(materialToForm(material));
    setImageFeedback("");
    setIsFormOpen(true);
  };

  const handleImages = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const nextImages = [...form.images, ...selected];
    if (nextImages.length > 3) {
      setImageFeedback("最多上传 3 张图片，已阻止第 4 张图片。");
      event.target.value = "";
      return;
    }
    setImageFeedback(selected.length > 0 ? `已选择 ${nextImages.length} / 3 张图片` : "");
    setForm((current) => ({ ...current, images: nextImages }));
    event.target.value = "";
  };

  const handleAttachments = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    setForm((current) => ({ ...current, attachments: [...current.attachments, ...selected] }));
    event.target.value = "";
  };

  const handleSubmit = () => {
    if (missingRequiredCategoryProperties.length > 0) {
      toast.error(
        t("categoryProperties.missingRequired", {
          names: missingRequiredCategoryProperties.map((property) => categoryAttributeLabel(property, i18n.language)).join(", "),
        }),
      );
      return;
    }
    saveMutation.mutate(toPayload(form, dynamicAttributes, effectiveCategoryProperties));
  };

  const openLifecycle = (material: Material, action: LifecycleAction) => {
    setLifecycleMaterial(material);
    setLifecycleAction(action);
    setLifecycleReason("");
    setLifecycleFeedback("");
  };

  const submitLifecycle = () => {
    if (!lifecycleMaterial || !lifecycleReason.trim()) {
      return;
    }
    lifecycleMutation.mutate({
      material: lifecycleMaterial,
      action: lifecycleAction,
      reason: lifecycleReason.trim(),
    });
  };

  const exportCsv = () => {
    const headers = ["物料编码", "物料名称", "物料库", "类目", "品名", "单位", "品牌", "状态", "描述"];
    const rows = materialRows.map((material) => [
      material.code,
      material.name,
      material.material_library,
      material.category,
      material.product_name,
      material.unit,
      material.brand,
      statusMeta(material.status).label,
      material.description,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "materials.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleLibrary = (id: number) => {
    setExpandedLibraryIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    setSelectedCategoryId("");
    setSelectedLibraryId(id);
  };

  const toggleCategory = (id: number) => {
    setExpandedCategoryIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const formReady =
    form.name.trim() &&
    form.material_library_id !== "" &&
    form.category_id !== "";
  const emptyLibraryLabel = auth.user?.is_super_admin ? t("state.emptyLibraries") : t("material.noAccessibleLibraries");
  const emptyMaterialLabel = auth.user?.is_super_admin ? t("state.emptyMaterials") : t("material.noAccessibleMaterials");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-6">
      {!fixedLibraryId && <aside className="max-h-[36vh] min-h-0 overflow-y-auto rounded-lg border border-border bg-card p-4 lg:max-h-none lg:w-64 lg:shrink-0">
        <h2 className="mb-4 text-sm font-medium text-foreground">物料库 / 类目</h2>
        <ApiState
          isLoading={librariesQuery.isLoading || categoriesQuery.isLoading}
          isError={librariesQuery.isError || categoriesQuery.isError}
          isEmpty={!librariesQuery.isLoading && !categoriesQuery.isLoading && libraries.length === 0}
          emptyLabel={emptyLibraryLabel}
          onRetry={() => {
            void librariesQuery.refetch();
            void categoriesQuery.refetch();
          }}
        >
          <div className="space-y-1">
            {libraries.map((library: MaterialLibrary) => {
              const expanded = expandedLibraryIds.includes(library.id);
              return (
                <div key={library.id}>
                  <button
                    type="button"
                    onClick={() => toggleLibrary(library.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                      selectedLibraryId === library.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
                    }`}
                  >
                    {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span className="truncate">{library.name}</span>
                  </button>
                  {expanded && (
                    <MaterialLibraryCategoryRoots
                      categoryLibraryIds={categoryLibraryIdsForMaterialLibrary(library)}
                      selectedCategoryId={selectedCategoryId}
                      expandedCategoryIds={expandedCategoryIds}
                      onToggle={toggleCategory}
                      onSelect={setSelectedCategoryId}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </ApiState>
      </aside>}

      <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl text-foreground">{t("page.materials")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("page.materialsHelp")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/40"
            >
              <Download className="h-4 w-4" />
              {t("action.export")}
            </button>
            <button
              type="button"
              onClick={() => setIsBulkImportOpen(true)}
              disabled={libraries.length === 0}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UploadCloud className="h-4 w-4" />
              批量添加物料
            </button>
            <Button
              type="button"
              onClick={openCreateForm}
              disabled={libraries.length === 0}
            >
              <Plus className="h-4 w-4" />
              {t("action.addMaterial")}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex min-w-64 flex-1 items-center gap-2 text-sm text-muted-foreground">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                type="search"
                placeholder={t("field.searchMaterials")}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="flex-1 outline-none"
              />
            </label>
            <div className="w-full md:w-48">
              <SearchableSelect
                ariaLabel="状态筛选"
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as "" | "normal" | "stop_purchase" | "stop_use")
                }
                options={[
                  { value: "normal", label: t("status.normal") },
                  { value: "stop_purchase", label: t("status.stopPurchase") },
                  { value: "stop_use", label: t("status.stopUse") },
                ]}
                placeholder={t("status.all")}
                clearLabel={t("status.all")}
                searchPlaceholder="搜索状态..."
                emptyText="暂无匹配状态"
              />
            </div>
          </div>
        </div>

        <ApiState
          isLoading={materialsQuery.isLoading}
          isError={materialsQuery.isError}
          isEmpty={!materialsQuery.isLoading && !materialsQuery.isError && materialRows.length === 0}
          emptyLabel={emptyMaterialLabel}
          onRetry={() => void materialsQuery.refetch()}
        >
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    {[
                      { label: t("field.materialCode") },
                      { label: t("field.materialName") },
                      { label: t("field.category") },
                      { label: t("field.productName") },
                      { label: t("field.unit") },
                      { label: t("field.brand") },
                      { label: t("field.attributes"), className: "min-w-[220px]" },
                      { label: t("field.status") },
                      { label: "启用状态" },
                      { label: t("action.operations") },
                    ].map((header) => (
                      <th
                        key={header.label}
                        className={`whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground ${header.className ?? ""}`}
                      >
                        {header.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {materialRows.map((material) => {
                    const status = normalizeStatus(material.status);
                    const meta = statusMeta(material.status);
                    return (
                      <tr key={material.id} className="hover:bg-muted/40">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-foreground">{material.code}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">{material.name}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">{material.category}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">{material.product_name}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">{material.unit || "-"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">{material.brand || "-"}</td>
                        <td className="max-w-xs whitespace-normal break-words px-4 py-3 text-sm text-foreground">
                          {Object.entries(material.attributes ?? {})
                            .filter(([key]) => !key.startsWith("_"))
                            .slice(0, 2)
                            .map(([key, value]) => `${key}: ${String(value)}`)
                            .join("；") || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={meta.className}>
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Switch
                            checked={material.enabled}
                            aria-label={`${material.name}${material.enabled ? "启用" : "停用"}`}
                            disabled={enabledMutation.isPending}
                            onCheckedChange={(enabled) => enabledMutation.mutate({ material, enabled })}
                            className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-red-600"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={() => openEditForm(material)}
                              variant="outline"
                              size="sm"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              {t("action.edit")}
                            </Button>
                            {status === "normal" && (
                              <button
                                type="button"
                                onClick={() => openLifecycle(material, "stop_purchase")}
                                className="rounded-md border border-warning/30 px-2 py-1 text-xs text-warning hover:bg-warning/10"
                              >
                                {t("action.stopPurchase")}
                              </button>
                            )}
                            {status === "stop_purchase" && (
                              <button
                                type="button"
                                onClick={() => openLifecycle(material, "stop_use")}
                                className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/40"
                              >
                                {t("action.stopUse")}
                              </button>
                            )}
                            <Button
                              type="button"
                              onClick={() => setMaterialPendingDelete(material)}
                              disabled={deleteMutation.isPending}
                              aria-busy={deleteMutation.isPending}
                              variant="destructive"
                              size="sm"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {t("action.delete")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </ApiState>
      </main>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingMaterial ? t("action.edit") : t("action.addMaterial")}
        size="xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/40"
            >
              {t("action.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!formReady || saveMutation.isPending}
              aria-busy={saveMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {saveMutation.isPending ? t("action.saving") : t("action.save")}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <section className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-3 text-xs text-muted-foreground">
              请按顺序选择物料库和类目，后续选项会根据上一步自动筛选；品名可选，物料默认按类目管理。
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { number: 1, label: "物料库", complete: form.material_library_id !== "" },
                { number: 2, label: "类目", complete: form.category_id !== "" },
                { number: 3, label: "品名（可选）", complete: form.product_name_id !== "" },
              ].map((step) => (
                <div
                  key={step.number}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    step.complete
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <span
                    className={`flex size-5 items-center justify-center rounded-full text-xs ${
                      step.complete
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.number}
                  </span>
                  {step.label}
                </div>
              ))}
            </div>
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-foreground">
              <span>{t("field.materialName")}</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
              />
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>{t("field.materialCode")}</span>
              <input
                type="text"
                value={editingMaterial?.code ?? (materialCodePreview.code || t("material.autoCodePending"))}
                readOnly
                className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              />
              {!editingMaterial && selectedLibrary?.auto_code_enabled && (
                <span className={materialCodePreview.error ? "text-xs text-destructive" : "text-xs text-primary"}>
                  {currentRuleQuery.isLoading
                    ? t("material.autoCodeLoading")
                    : materialCodePreview.error ?? t("material.autoCodePreview")}
                </span>
              )}
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>{t("field.library")}</span>
              <SearchableSelect
                ariaLabel={t("field.library")}
                value={form.material_library_id === "" ? "" : String(form.material_library_id)}
                onValueChange={(value) => {
                  resetCategoryMatchState();
                  setForm((current) => ({
                    ...current,
                    material_library_id: value ? Number(value) : "",
                    category_id: "",
                    product_name_id: "",
                    attributes: {},
                  }));
                }}
                options={libraries.map((library) => ({
                  value: String(library.id),
                  label: library.name,
                  keywords: library.code,
                }))}
                placeholder="请选择物料库"
                searchPlaceholder="搜索物料库名称或编码..."
                emptyText="暂无匹配物料库"
              />
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>{t("field.category")}</span>
              <SearchableSelect
                ariaLabel={t("field.category")}
                value={form.category_id === "" ? "" : String(form.category_id)}
                onValueChange={(value) => {
                  setSelectedAiCategoryId(null);
                  setForm((current) => ({
                    ...current,
                    category_id: value ? Number(value) : "",
                    product_name_id: "",
                    attributes: {},
                  }));
                }}
                options={availableCategories.map((category) => ({
                  value: String(category.id),
                  label: `${category.name} (${category.code})`,
                  keywords: category.code,
                }))}
                placeholder={form.material_library_id === "" ? "请先选择物料库" : "请选择类目"}
                searchPlaceholder="搜索类目名称或编码..."
                emptyText="当前物料库下暂无匹配类目"
                disabled={form.material_library_id === ""}
              />
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>{t("field.productName")}（可选）</span>
              <SearchableSelect
                ariaLabel={t("field.productName")}
                value={form.product_name_id === "" ? "" : String(form.product_name_id)}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    product_name_id: value ? Number(value) : "",
                    attributes: {},
                  }))
                }
                options={productNames.map((productName) => ({
                  value: String(productName.id),
                  label: productName.name,
                  keywords: `${productName.product_name_code} ${productName.category}`,
                }))}
                placeholder={form.category_id === "" ? "请先选择类目" : "请选择品名（可不选）"}
                searchPlaceholder="搜索品名或品名编码..."
                emptyText="当前类目下暂无可用品名"
                disabled={form.category_id === ""}
                clearLabel="不选择品名"
              />
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>选择摘要</span>
              <input
                type="text"
                readOnly
                value={[
                  selectedName<MaterialLibrary>(libraries, form.material_library_id),
                  selectedName<Category>(categories, form.category_id),
                  selectedName<ProductName>(productNames, form.product_name_id),
                ].filter(Boolean).join(" / ") || "待选择"}
                className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              />
            </label>
          </div>

          {canUseAiCategoryMatch && (
            <section className="rounded-lg border border-primary/30 bg-primary/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-foreground">{t("material.aiCategoryTitle")}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{t("material.aiCategoryHelp")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => categoryMatchMutation.mutate()}
                  disabled={!form.name.trim() || categoryMatchMutation.isPending}
                  aria-busy={categoryMatchMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-white hover:bg-primary disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                >
                  <Sparkles className="h-4 w-4" />
                  {categoryMatchMutation.isPending ? t("material.aiCategoryLoading") : t("material.aiCategoryAction")}
                </button>
              </div>
              {categoryMatchMutation.isPending && (
                <p className="mt-3 text-sm text-primary">{t("material.aiCategoryLoading")}</p>
              )}
              {!categoryMatchMutation.isPending && categoryMatchMessage && (
                <p className={categoryMatchMutation.isError ? "mt-3 text-sm text-destructive" : "mt-3 text-sm text-muted-foreground"}>
                  {categoryMatchMessage}
                </p>
              )}
              {categoryMatches.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {categoryMatches.map((match) => {
                    const selected = selectedAiCategoryId === match.category_id || form.category_id === match.category_id;
                    return (
                      <button
                        key={match.category_id}
                        type="button"
                        onClick={() => {
                          setSelectedAiCategoryId(match.category_id);
                          setForm((current) => ({ ...current, category_id: match.category_id }));
                        }}
                        className={`inline-flex max-w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                          selected ? "border-primary bg-white text-primary" : "border-primary/30 bg-white/70 text-foreground hover:bg-white"
                        }`}
                      >
                        <span className="truncate">{match.path_string}</span>
                        <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                          {t("material.aiCategoryConfidence", { value: Math.round(match.confidence * 100) })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <section ref={categoryPropertiesSectionRef} className="scroll-mt-6 rounded-lg border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">{t("categoryProperties.materialSectionTitle")}</h3>
              {categoryPropertiesQuery.isLoading && (
                <span className="text-xs text-muted-foreground">{t("categoryProperties.materialLoading")}</span>
              )}
            </div>
            {form.category_id === "" ? (
              <p className="text-sm text-muted-foreground">{t("categoryProperties.materialEmpty")}</p>
            ) : effectiveCategoryProperties.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("categoryProperties.emptyOwn")}</p>
            ) : (
              <div className="space-y-5">
                {inheritedCategoryProperties.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("categoryProperties.inheritedSection")}
                    </h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      {inheritedCategoryProperties.map((property) => (
                        <CategoryPropertyField
                          key={`${property.id}-${property.source_category_id}`}
                          property={property}
                          value={form.attributes[property.name] ?? ""}
                          language={i18n.language}
                          onChange={(value) =>
                            setForm((current) => ({
                              ...current,
                              attributes: { ...current.attributes, [property.name]: value },
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
                {ownCategoryProperties.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("categoryProperties.ownSection")}
                    </h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      {ownCategoryProperties.map((property) => (
                        <CategoryPropertyField
                          key={property.id}
                          property={property}
                          value={form.attributes[property.name] ?? ""}
                          language={i18n.language}
                          onChange={(value) =>
                            setForm((current) => ({
                              ...current,
                              attributes: { ...current.attributes, [property.name]: value },
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
                {missingRequiredCategoryProperties.length > 0 && (
                  <p className="text-sm text-destructive">
                    {t("categoryProperties.missingRequired", {
                      names: missingRequiredCategoryProperties
                        .map((property) => categoryAttributeLabel(property, i18n.language))
                        .join(", "),
                    })}
                  </p>
                )}
              </div>
            )}
            {categoryPropertiesQuery.isError && <p className="mt-3 text-sm text-destructive">{t("categoryProperties.loadFailed")}</p>}
          </section>

          <section className="rounded-lg border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">动态属性</h3>
              {attributesQuery.isLoading && <span className="text-xs text-muted-foreground">属性加载中...</span>}
            </div>
            {form.product_name_id === "" ? (
              <p className="text-sm text-muted-foreground">选择品名后显示对应必填属性。</p>
            ) : dynamicAttributes.length === 0 ? (
              <p className="text-sm text-muted-foreground">该品名暂无后端属性定义。</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {dynamicAttributes.map((attribute) => (
                  <label
                    key={attribute.id}
                    className={`space-y-1 rounded-md border p-3 text-sm ${
                      attribute.required ? "border-warning/30 bg-warning/10 text-warning" : "border-border text-foreground"
                    }`}
                  >
                    <span>
                      {attribute.name}
                      {attribute.required && <span className="ml-1 text-destructive">*</span>}
                    </span>
                    <input
                      type={attribute.data_type === "number" ? "number" : "text"}
                      value={form.attributes[attribute.name] ?? ""}
                      placeholder={attribute.description || attribute.default_value}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          attributes: { ...current.attributes, [attribute.name]: event.target.value },
                        }))
                      }
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
                    />
                  </label>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 rounded-lg border-2 border-dashed border-border p-5 text-center text-sm text-muted-foreground hover:border-primary/30">
              <Image className="mx-auto h-8 w-8 text-muted-foreground" />
              <span>图片上传，最多 3 张</span>
              <input type="file" accept="image/*" multiple onChange={handleImages} className="sr-only" />
              <span className="block text-xs text-muted-foreground">{form.images.map((file) => file.name).join("、") || "点击选择图片"}</span>
              {imageFeedback && <span className="block text-xs text-warning">{imageFeedback}</span>}
            </label>
            <label className="space-y-2 rounded-lg border-2 border-dashed border-border p-5 text-center text-sm text-muted-foreground hover:border-primary/30">
              <FileInput className="mx-auto h-8 w-8 text-muted-foreground" />
              <span>附件上传</span>
              <input type="file" multiple onChange={handleAttachments} className="sr-only" />
              <span className="block text-xs text-muted-foreground">{form.attachments.map((file) => file.name).join("、") || "点击选择附件"}</span>
            </label>
          </div>

          <label className="space-y-1 text-sm text-foreground">
            <span>{t("field.description")}</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
            />
          </label>
          {saveMutation.isError && <p className="text-sm text-destructive">{saveMutation.error.message}</p>}
        </div>
      </Modal>

      <AlertDialog
        open={Boolean(materialPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setMaterialPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除物料</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除物料“{materialPendingDelete?.name}”吗？该操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              aria-busy={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (materialPendingDelete) {
                  deleteMutation.mutate(materialPendingDelete.id);
                }
              }}
            >
              {deleteMutation.isPending ? "删除中…" : t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Modal
        isOpen={Boolean(lifecycleMaterial)}
        onClose={() => setLifecycleMaterial(null)}
        title={lifecycleAction === "stop_purchase" ? "物料停采确认" : "物料停用确认"}
        footer={
          <>
            <button
              type="button"
              onClick={() => setLifecycleMaterial(null)}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/40"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={submitLifecycle}
              disabled={!lifecycleReason.trim() || lifecycleMutation.isPending}
              aria-busy={lifecycleMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              确认
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {lifecycleMaterial?.code} {lifecycleMaterial?.name}
          </p>
          <label className="space-y-1 text-sm text-foreground">
            <span>{lifecycleAction === "stop_purchase" ? "停采原因" : "停用原因"}</span>
            <textarea
              value={lifecycleReason}
              onChange={(event) => setLifecycleReason(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
            />
          </label>
          {lifecycleFeedback && (
            <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
              {lifecycleFeedback}
            </div>
          )}
        </div>
      </Modal>

      <MaterialBulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        libraries={libraries}
        defaultLibraryId={selectedLibraryId}
      />
    </div>
  );
}
