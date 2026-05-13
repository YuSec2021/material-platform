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
import {
  apiClient,
  type Attribute,
  type Brand,
  type Category,
  type Material,
  type MaterialLibrary,
  type MaterialPayload,
  type ProductName,
} from "@/app/api/client";
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
      className: "border-gray-200 bg-gray-100 text-gray-700",
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
          selected ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
        }`}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="truncate">{category.name}</span>
      </button>
    </div>
  );
}

export function MaterialList() {
  const queryClient = useQueryClient();
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
    queryKey: ["materials", searchTerm, statusFilter],
    queryFn: () => apiClient.materials({ search: searchTerm.trim(), status: statusFilter }),
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
    if (selectedLibraryId === "" && libraries.length > 0) {
      setSelectedLibraryId(libraries[0]!.id);
      setExpandedLibraryIds([libraries[0]!.id]);
    }
  }, [librariesQuery.data, selectedLibraryId]);

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

  const saveMutation = useMutation({
    mutationFn: (payload: MaterialPayload) =>
      editingMaterial ? apiClient.updateMaterial(editingMaterial.id, payload) : apiClient.createMaterial(payload),
    onSuccess: async () => {
      setIsFormOpen(false);
      setEditingMaterial(null);
      setForm(emptyForm);
      setImageFeedback("");
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteMaterial(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });

  const lifecycleMutation = useMutation({
    mutationFn: ({ material, action, reason }: { material: Material; action: LifecycleAction; reason: string }) =>
      action === "stop_purchase"
        ? apiClient.stopPurchaseMaterial(material.id, reason)
        : apiClient.transitionMaterial(material.id, "stop_use", reason),
    onSuccess: async (_updated, variables) => {
      setLifecycleFeedback(`${variables.action === "stop_purchase" ? "停采" : "停用"}成功：${variables.reason}`);
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (error) => {
      setLifecycleFeedback(`操作失败：${error.message}`);
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

  return (
    <div className="flex h-full gap-6">
      <aside className="w-64 shrink-0 overflow-y-auto rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-medium text-gray-900">物料库 / 类目</h2>
        <ApiState
          isLoading={librariesQuery.isLoading || categoriesQuery.isLoading}
          isError={librariesQuery.isError || categoriesQuery.isError}
          isEmpty={!librariesQuery.isLoading && !categoriesQuery.isLoading && libraries.length === 0}
          emptyLabel="暂无物料库"
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
                      selectedLibraryId === library.id ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
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
      </aside>

      <main className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl text-gray-900">物料管理</h1>
            <p className="mt-1 text-sm text-gray-500">物料列表、筛选、导出、建档和生命周期操作均连接后端 API。</p>
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
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              导出
            </button>
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              新增物料
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex min-w-64 flex-1 items-center gap-2 text-sm text-gray-600">
              <Search className="h-5 w-5 text-gray-400" />
              <input
                type="search"
                placeholder="搜索物料名称、编码、描述或品名..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="flex-1 outline-none"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "" | "normal" | "stop_purchase" | "stop_use")}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              aria-label="状态筛选"
            >
              <option value="">全部状态</option>
              <option value="normal">正常</option>
              <option value="stop_purchase">停采</option>
              <option value="stop_use">停用</option>
            </select>
          </div>
        </div>

        <ApiState
          isLoading={materialsQuery.isLoading}
          isError={materialsQuery.isError}
          isEmpty={!materialsQuery.isLoading && !materialsQuery.isError && materialRows.length === 0}
          emptyLabel="后端暂无物料数据"
          onRetry={() => void materialsQuery.refetch()}
        >
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px]">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    {["物料编码", "物料名称", "所属类目", "品名", "物料库", "单位", "品牌", "属性", "状态", "操作"].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {materialRows.map((material) => {
                    const status = normalizeStatus(material.status);
                    const meta = statusMeta(material.status);
                    return (
                      <tr key={material.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-sm text-gray-700">{material.code}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{material.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{material.category}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{material.product_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{material.material_library}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{material.unit || "-"}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{material.brand || "-"}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
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
                              编辑
                            </button>
                            {status === "normal" && (
                              <button
                                type="button"
                                onClick={() => openLifecycle(material, "stop_purchase")}
                                className="rounded-md border border-orange-200 px-2 py-1 text-xs text-orange-700 hover:bg-orange-50"
                              >
                                停采
                              </button>
                            )}
                            {status === "stop_purchase" && (
                              <button
                                type="button"
                                onClick={() => openLifecycle(material, "stop_use")}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                              >
                                停用
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDelete(material)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              删除
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
        title={editingMaterial ? "编辑物料" : "新增物料"}
        size="xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!formReady || saveMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {saveMutation.isPending ? "保存中..." : "保存"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-gray-700">
              <span>物料名称</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span>物料编码</span>
              <input
                type="text"
                value={editingMaterial?.code ?? "保存后自动生成"}
                readOnly
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span>物料库</span>
              <select
                value={form.material_library_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, material_library_id: event.target.value ? Number(event.target.value) : "" }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">请选择物料库</option>
                {libraries.map((library) => (
                  <option key={library.id} value={library.id}>
                    {library.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span>类目级联选择</span>
              <select
                value={form.category_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, category_id: event.target.value ? Number(event.target.value) : "" }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">请选择类目</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span>品名</span>
              <select
                value={form.product_name_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, product_name_id: event.target.value ? Number(event.target.value) : "", attributes: {} }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">请选择品名</option>
                {productNames.map((productName) => (
                  <option key={productName.id} value={productName.id}>
                    {productName.name} / {productName.category}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span>品牌</span>
              <select
                value={form.brand_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, brand_id: event.target.value ? Number(event.target.value) : "" }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">无品牌</option>
                {brands.map((brand: Brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span>计量单位</span>
              <input
                type="text"
                value={form.unit}
                onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span>选择摘要</span>
              <input
                type="text"
                readOnly
                value={[
                  selectedName<MaterialLibrary>(libraries, form.material_library_id),
                  selectedName<Category>(categories, form.category_id),
                  selectedName<ProductName>(productNames, form.product_name_id),
                ].filter(Boolean).join(" / ") || "待选择"}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </label>
          </div>

          <section className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">动态属性</h3>
              {attributesQuery.isLoading && <span className="text-xs text-gray-500">属性加载中...</span>}
            </div>
            {form.product_name_id === "" ? (
              <p className="text-sm text-gray-500">选择品名后显示对应必填属性。</p>
            ) : dynamicAttributes.length === 0 ? (
              <p className="text-sm text-gray-500">该品名暂无后端属性定义。</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {dynamicAttributes.map((attribute) => (
                  <label
                    key={attribute.id}
                    className={`space-y-1 rounded-md border p-3 text-sm ${
                      attribute.required ? "border-amber-300 bg-amber-50 text-amber-900" : "border-gray-200 text-gray-700"
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
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 rounded-lg border-2 border-dashed border-gray-300 p-5 text-center text-sm text-gray-600 hover:border-blue-400">
              <Image className="mx-auto h-8 w-8 text-gray-400" />
              <span>图片上传，最多 3 张</span>
              <input type="file" accept="image/*" multiple onChange={handleImages} className="sr-only" />
              <span className="block text-xs text-gray-500">{form.images.map((file) => file.name).join("、") || "点击选择图片"}</span>
              {imageFeedback && <span className="block text-xs text-orange-700">{imageFeedback}</span>}
            </label>
            <label className="space-y-2 rounded-lg border-2 border-dashed border-gray-300 p-5 text-center text-sm text-gray-600 hover:border-blue-400">
              <FileInput className="mx-auto h-8 w-8 text-gray-400" />
              <span>附件上传</span>
              <input type="file" multiple onChange={handleAttachments} className="sr-only" />
              <span className="block text-xs text-gray-500">{form.attachments.map((file) => file.name).join("、") || "点击选择附件"}</span>
            </label>
          </div>

          <label className="space-y-1 text-sm text-gray-700">
            <span>描述</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={submitLifecycle}
              disabled={!lifecycleReason.trim() || lifecycleMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              确认
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {lifecycleMaterial?.code} {lifecycleMaterial?.name}
          </p>
          <label className="space-y-1 text-sm text-gray-700">
            <span>{lifecycleAction === "stop_purchase" ? "停采原因" : "停用原因"}</span>
            <textarea
              value={lifecycleReason}
              onChange={(event) => setLifecycleReason(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
