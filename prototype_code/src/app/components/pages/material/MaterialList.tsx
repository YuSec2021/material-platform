import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Edit,
  FileInput,
  Image,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  apiClient,
  type Attribute,
  type Brand,
  type Category,
  type Material,
  type MaterialCodeRuleVersion,
  type MaterialLibrary,
  type MaterialPayload,
  type ProductName,
} from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { Badge } from "@/app/components/ui/badge";
import { ApiState } from "../../common/ApiState";
import { Modal } from "../../common/Modal";
import { MaterialAIModal, type AiModalType } from "./MaterialAIModal";

type MaterialFormState = {
  name: string;
  material_library_id: number | "";
  category_id: number | "";
  product_name_id: number | "";
  unit: string;
  brand_id: number | "";
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

const aiActionLabels: Record<AiModalType, string> = {
  治理: "AI物料治理",
  添加: "AI自然语言添加",
  匹配: "AI向量匹配",
};

const emptyForm: MaterialFormState = {
  name: "",
  material_library_id: "",
  category_id: "",
  product_name_id: "",
  unit: "",
  brand_id: "",
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
      className: "border-orange-200 bg-orange-50 text-orange-700",
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
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
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
    product_name_id: material.product_name_id,
    unit: material.unit,
    brand_id: material.brand_id ?? "",
    description: material.description,
    attributes,
    images: [],
    attachments: [],
  };
}

function selectedName<T extends { id: number; name: string }>(items: T[] | undefined, id: number | "") {
  return items?.find((item) => item.id === id)?.name ?? "";
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

function toPayload(form: MaterialFormState, attributes: Attribute[]): MaterialPayload {
  const attributePayload = attributes.reduce<Record<string, unknown>>((current, attribute) => {
    current[attribute.name] = form.attributes[attribute.name] ?? "";
    return current;
  }, {});

  return {
    name: form.name.trim(),
    material_library_id: Number(form.material_library_id),
    category_id: Number(form.category_id),
    product_name_id: Number(form.product_name_id),
    unit: form.unit.trim(),
    brand_id: form.brand_id === "" ? null : Number(form.brand_id),
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

function TreeCategory({
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

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onToggle(category.id);
          onSelect(category.id);
        }}
        className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm ${
          selected ? "bg-blue-50 text-blue-700" : "text-foreground hover:bg-accent"
        }`}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="truncate">{category.name}</span>
      </button>
    </div>
  );
}

export function MaterialList({ fixedLibraryId }: { fixedLibraryId?: number } = {}) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
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
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiModalType, setAiModalType] = useState<AiModalType>("治理");
  const [lifecycleMaterial, setLifecycleMaterial] = useState<Material | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction>("stop_purchase");
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [lifecycleFeedback, setLifecycleFeedback] = useState("");

  const materialsQuery = useQuery({
    queryKey: ["materials", searchTerm, statusFilter, selectedLibraryId],
    queryFn: () =>
      apiClient.materials({
        search: searchTerm.trim(),
        status: statusFilter,
        material_library_id: selectedLibraryId === "" ? null : selectedLibraryId,
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

  const brandsQuery = useQuery({
    queryKey: ["brands"],
    queryFn: apiClient.brands,
    retry: false,
  });

  const selectedProductNameId = form.product_name_id === "" ? null : Number(form.product_name_id);
  const attributesQuery = useQuery({
    queryKey: ["attributes", selectedProductNameId],
    queryFn: () => apiClient.attributes(selectedProductNameId),
    enabled: isFormOpen && selectedProductNameId !== null,
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
    const selectedProduct = productNamesQuery.data?.find((item) => item.id === selectedProductNameId);
    if (selectedProduct && !form.unit) {
      setForm((current) => ({ ...current, unit: selectedProduct.unit }));
    }
  }, [form.unit, productNamesQuery.data, selectedProductNameId]);

  const materialRows = useMemo(() => materialsQuery.data ?? [], [materialsQuery.data]);
  const libraries = librariesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const productNames = productNamesQuery.data ?? [];
  const brands = brandsQuery.data ?? [];
  const dynamicAttributes = attributesQuery.data ?? [];
  const selectedLibrary = libraries.find((library) => library.id === form.material_library_id);
  const selectedCategory = categories.find((category) => category.id === form.category_id);

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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteMaterial(id),
    onSuccess: async () => {
      toast.success(t("toast.deleteSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (error) => toast.error(`${t("toast.deleteFailed")}: ${error.message}`),
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
    saveMutation.mutate(toPayload(form, dynamicAttributes));
  };

  const handleDelete = (material: Material) => {
    if (window.confirm(`确定删除物料 ${material.name} 吗？该操作不可撤销。`)) {
      deleteMutation.mutate(material.id);
    }
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
    setSelectedLibraryId(id);
  };

  const toggleCategory = (id: number) => {
    setExpandedCategoryIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const formReady =
    form.name.trim() &&
    form.material_library_id !== "" &&
    form.category_id !== "" &&
    form.product_name_id !== "";
  const emptyLibraryLabel = auth.user?.is_super_admin ? t("state.emptyLibraries") : t("material.noAccessibleLibraries");
  const emptyMaterialLabel = auth.user?.is_super_admin ? t("state.emptyMaterials") : t("material.noAccessibleMaterials");

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row lg:gap-6">
      {!fixedLibraryId && <aside className="max-h-80 overflow-y-auto rounded-lg border border-border bg-card p-4 lg:max-h-none lg:w-64 lg:shrink-0">
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
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      selectedLibraryId === library.id ? "bg-blue-50 text-blue-700" : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <span className="truncate">{library.name}</span>
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  {expanded && (
                    <div className="mt-1 space-y-1 pl-3">
                      {categories.map((category) => (
                        <TreeCategory
                          key={`${library.id}-${category.id}`}
                          category={category}
                          selectedCategoryId={selectedCategoryId}
                          expandedCategoryIds={expandedCategoryIds}
                          onToggle={toggleCategory}
                          onSelect={setSelectedCategoryId}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ApiState>
      </aside>}

      <main className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl text-foreground">{t("page.materials")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("page.materialsHelp")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["治理", "添加", "匹配"] as AiModalType[]).map((label) => (
              <button
                key={label}
                type="button"
                aria-label={aiActionLabels[label]}
                onClick={() => {
                  setAiModalType(label);
                  setIsAIModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-md border border-blue-200 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
              >
                <Sparkles className="h-4 w-4" />
                {label === "治理" ? t("action.aiGovernance") : label === "添加" ? t("action.aiAdd") : t("action.aiMatch")}
              </button>
            ))}
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
              onClick={openCreateForm}
              disabled={libraries.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              <Plus className="h-4 w-4" />
              {t("action.addMaterial")}
            </button>
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
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "" | "normal" | "stop_purchase" | "stop_use")}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
              aria-label="状态筛选"
            >
              <option value="">{t("status.all")}</option>
              <option value="normal">{t("status.normal")}</option>
              <option value="stop_purchase">{t("status.stopPurchase")}</option>
              <option value="stop_use">{t("status.stopUse")}</option>
            </select>
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
              <table className="w-full min-w-[1120px]">
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    {[
                      t("field.materialCode"),
                      t("field.materialName"),
                      t("field.category"),
                      t("field.productName"),
                      t("field.library"),
                      t("field.unit"),
                      t("field.brand"),
                      t("field.attributes"),
                      t("field.status"),
                      t("action.operations"),
                    ].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                        {header}
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
                        <td className="px-4 py-3 font-mono text-sm text-foreground">{material.code}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{material.name}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{material.category}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{material.product_name}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{material.material_library}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{material.unit || "-"}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{material.brand || "-"}</td>
                        <td className="px-4 py-3 text-sm text-foreground">
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
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openEditForm(material)}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              {t("action.edit")}
                            </button>
                            {status === "normal" && (
                              <button
                                type="button"
                                onClick={() => openLifecycle(material, "stop_purchase")}
                                className="rounded-md border border-orange-200 px-2 py-1 text-xs text-orange-700 hover:bg-orange-50"
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
                            <button
                              type="button"
                              onClick={() => handleDelete(material)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {t("action.delete")}
                            </button>
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
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {saveMutation.isPending ? t("action.saving") : t("action.save")}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-foreground">
              <span>{t("field.materialName")}</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
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
                <span className={materialCodePreview.error ? "text-xs text-red-600" : "text-xs text-blue-700"}>
                  {currentRuleQuery.isLoading
                    ? t("material.autoCodeLoading")
                    : materialCodePreview.error ?? t("material.autoCodePreview")}
                </span>
              )}
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>{t("field.library")}</span>
              <select
                value={form.material_library_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, material_library_id: event.target.value ? Number(event.target.value) : "" }))
                }
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
              >
                <option value="">请选择物料库</option>
                {libraries.map((library) => (
                  <option key={library.id} value={library.id}>
                    {library.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>{t("field.category")}</span>
              <select
                value={form.category_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, category_id: event.target.value ? Number(event.target.value) : "" }))
                }
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
              >
                <option value="">请选择类目</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>{t("field.productName")}</span>
              <select
                value={form.product_name_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, product_name_id: event.target.value ? Number(event.target.value) : "", attributes: {} }))
                }
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
              >
                <option value="">请选择品名</option>
                {productNames.map((productName) => (
                  <option key={productName.id} value={productName.id}>
                    {productName.name} / {productName.category}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>{t("field.brand")}</span>
              <select
                value={form.brand_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, brand_id: event.target.value ? Number(event.target.value) : "" }))
                }
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
              >
                <option value="">无品牌</option>
                {brands.map((brand: Brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>{t("field.unit")}</span>
              <input
                type="text"
                value={form.unit}
                onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
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
                      attribute.required ? "border-amber-300 bg-amber-50 text-amber-900" : "border-border text-foreground"
                    }`}
                  >
                    <span>
                      {attribute.name}
                      {attribute.required && <span className="ml-1 text-red-600">*</span>}
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
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                    />
                  </label>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 rounded-lg border-2 border-dashed border-border p-5 text-center text-sm text-muted-foreground hover:border-blue-400">
              <Image className="mx-auto h-8 w-8 text-muted-foreground" />
              <span>图片上传，最多 3 张</span>
              <input type="file" accept="image/*" multiple onChange={handleImages} className="sr-only" />
              <span className="block text-xs text-muted-foreground">{form.images.map((file) => file.name).join("、") || "点击选择图片"}</span>
              {imageFeedback && <span className="block text-xs text-orange-700">{imageFeedback}</span>}
            </label>
            <label className="space-y-2 rounded-lg border-2 border-dashed border-border p-5 text-center text-sm text-muted-foreground hover:border-blue-400">
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
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          {saveMutation.isError && <p className="text-sm text-red-600">{saveMutation.error.message}</p>}
        </div>
      </Modal>

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
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
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
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          {lifecycleFeedback && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              {lifecycleFeedback}
            </div>
          )}
        </div>
      </Modal>

      <MaterialAIModal
        isOpen={isAIModalOpen}
        type={aiModalType}
        selectedLibraryId={selectedLibraryId}
        selectedCategoryId={selectedCategoryId}
        onClose={() => setIsAIModalOpen(false)}
        queryClient={queryClient}
      />
    </div>
  );
}
