import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Edit, Plus, Power, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient, type ProductName, type ProductNamePayload } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";

type StatusFilter = "active" | "inactive" | "all";
type FormState = ProductNamePayload;
type PendingAction =
  | { type: "status"; product: ProductName; nextStatus: "active" | "inactive" }
  | { type: "delete"; product: ProductName }
  | null;

const emptyForm: FormState = {
  name: "",
  unit: "",
  category: "",
};

const labels = {
  "zh-CN": {
    title: "品名管理",
    description: "维护品名、PM编码和启停状态。",
    create: "新增品名",
    createTitle: "新增品名",
    editTitle: "编辑品名",
    code: "品名编码",
    generatedCode: "保存后自动生成",
    name: "品名",
    category: "所属类目",
    unit: "品名单位",
    status: "状态",
    active: "启用",
    inactive: "禁用",
    actions: "操作",
    edit: "编辑",
    delete: "删除",
    setActive: "启用",
    setInactive: "禁用",
    search: "搜索品名",
    searchPlaceholder: "搜索编码、品名、类目或单位...",
    empty: "暂无匹配品名数据",
    selectCategory: "请选择类目",
    currentStatus: "当前状态",
    cancel: "取消",
    confirm: "确认",
    save: "保存",
    saving: "保存中...",
    saveSuccess: "品名已保存",
    saveFailed: "品名保存失败",
    statusSuccess: "状态已更新",
    statusFailed: "状态更新失败",
    deleteSuccess: "品名已禁用",
    deleteFailed: "品名删除失败",
    statusTitle: "确认状态变更",
    statusConfirm: (name: string, status: string) => `确认将品名 ${name} 设置为 ${status} 吗？`,
    deleteTitle: "确认删除品名",
    deleteConfirm: (name: string) => `确认删除品名 ${name} 吗？删除后记录保留并转为禁用状态。`,
    filter: {
      active: "启用",
      inactive: "禁用",
      all: "全部",
    },
  },
  "en-US": {
    title: "Product Names",
    description: "Maintain product names, PM codes, and active status.",
    create: "New Product Name",
    createTitle: "New Product Name",
    editTitle: "Edit Product Name",
    code: "Product Name Code",
    generatedCode: "Generated after save",
    name: "Product Name",
    category: "Category",
    unit: "Unit",
    status: "Status",
    active: "active",
    inactive: "inactive",
    actions: "Actions",
    edit: "Edit",
    delete: "Delete",
    setActive: "Activate",
    setInactive: "Deactivate",
    search: "Search product names",
    searchPlaceholder: "Search code, name, category, or unit...",
    empty: "No matching product names",
    selectCategory: "Select category",
    currentStatus: "Current status",
    cancel: "Cancel",
    confirm: "Confirm",
    save: "Save",
    saving: "Saving...",
    saveSuccess: "Product name saved",
    saveFailed: "Product name save failed",
    statusSuccess: "Status updated",
    statusFailed: "Status update failed",
    deleteSuccess: "Product name deactivated",
    deleteFailed: "Product name delete failed",
    statusTitle: "Confirm status change",
    statusConfirm: (name: string, status: string) => `Set product name ${name} to ${status}?`,
    deleteTitle: "Confirm product name delete",
    deleteConfirm: (name: string) => `Delete product name ${name}? The record will be preserved and marked inactive.`,
    filter: {
      active: "Active",
      inactive: "Inactive",
      all: "All",
    },
  },
};

function initialStatusFilter(): StatusFilter {
  const saved = window.localStorage.getItem("product-name-status-filter");
  return saved === "inactive" || saved === "all" ? saved : "active";
}

function statusTone(status: ProductName["status"]) {
  return status === "active"
    ? "border-green-200 bg-green-50 text-green-700"
    : "border-border bg-muted text-muted-foreground";
}

export function ProductNameList() {
  const { i18n } = useTranslation();
  const text = i18n.language === "en-US" ? labels["en-US"] : labels["zh-CN"];
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductName | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const query = useQuery({
    queryKey: ["product-names"],
    queryFn: () => apiClient.productNamesByStatus("all"),
    retry: false,
  });
  const categoryQuery = useQuery({
    queryKey: ["categories"],
    queryFn: apiClient.categories,
    retry: false,
  });

  const categories = categoryQuery.data ?? [];

  const filteredData = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const productNames = query.data ?? [];
    return productNames.filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      if (!matchesStatus) {
        return false;
      }
      if (!term) {
        return true;
      }
      return [item.product_name_code, item.name, item.category, item.unit].some((value) =>
        value.toLowerCase().includes(term),
      );
    });
  }, [query.data, searchTerm, statusFilter]);

  const invalidateProductNames = () => {
    void queryClient.invalidateQueries({ queryKey: ["product-names"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: FormState) =>
      editingProduct
        ? apiClient.updateProductName(editingProduct.id, payload)
        : apiClient.createProductName(payload),
    onSuccess: () => {
      toast.success(text.saveSuccess);
      setIsFormOpen(false);
      setEditingProduct(null);
      setForm(emptyForm);
      invalidateProductNames();
    },
    onError: (error) => toast.error(`${text.saveFailed}: ${error.message}`),
  });

  const statusMutation = useMutation({
    mutationFn: ({ product, nextStatus }: { product: ProductName; nextStatus: "active" | "inactive" }) =>
      apiClient.updateProductNameStatus(product.id, nextStatus),
    onSuccess: () => {
      toast.success(text.statusSuccess);
      setPendingAction(null);
      invalidateProductNames();
    },
    onError: (error) => toast.error(`${text.statusFailed}: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (product: ProductName) => apiClient.deleteProductName(product.id),
    onSuccess: () => {
      toast.success(text.deleteSuccess);
      setPendingAction(null);
      invalidateProductNames();
    },
    onError: (error) => toast.error(`${text.deleteFailed}: ${error.message}`),
  });

  const setFilter = (value: StatusFilter) => {
    setStatusFilter(value);
    window.localStorage.setItem("product-name-status-filter", value);
  };

  const openCreate = () => {
    setEditingProduct(null);
    setForm({
      ...emptyForm,
      category: categories[0]?.name ?? "",
    });
    setIsFormOpen(true);
  };

  const openEdit = (product: ProductName) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      unit: product.unit,
      category: product.category,
    });
    setIsFormOpen(true);
  };

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveMutation.mutate(form);
  };

  const confirmPendingAction = () => {
    if (!pendingAction) {
      return;
    }
    if (pendingAction.type === "status") {
      statusMutation.mutate({ product: pendingAction.product, nextStatus: pendingAction.nextStatus });
      return;
    }
    deleteMutation.mutate(pendingAction.product);
  };

  const columns = [
    {
      header: text.code,
      accessor: (row: ProductName) => (
        <span className="font-mono text-xs font-medium text-foreground">{row.product_name_code}</span>
      ),
    },
    { header: text.name, accessor: "name" as keyof ProductName },
    { header: text.category, accessor: "category" as keyof ProductName },
    { header: text.unit, accessor: "unit" as keyof ProductName },
    {
      header: text.status,
      accessor: (row: ProductName) => (
        <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs ${statusTone(row.status)}`}>
          {text[row.status]}
        </span>
      ),
    },
    {
      header: text.actions,
      accessor: (row: ProductName) => {
        const nextStatus = row.status === "active" ? "inactive" : "active";
        return (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openEdit(row)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Edit className="h-3.5 w-3.5" />
              {text.edit}
            </button>
            <button
              type="button"
              onClick={() => setPendingAction({ type: "status", product: row, nextStatus })}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Power className="h-3.5 w-3.5" />
              {nextStatus === "active" ? text.setActive : text.setInactive}
            </button>
            <button
              type="button"
              onClick={() => setPendingAction({ type: "delete", product: row })}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {text.delete}
            </button>
          </div>
        );
      },
    },
  ];

  const pendingProduct = pendingAction?.product;
  const pendingTitle =
    pendingAction?.type === "delete" ? text.deleteTitle : text.statusTitle;
  const pendingDescription =
    pendingAction?.type === "delete"
      ? text.deleteConfirm(pendingProduct?.name ?? "")
      : text.statusConfirm(pendingProduct?.name ?? "", pendingAction ? text[pendingAction.nextStatus] : "");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-foreground">{text.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{text.description}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" />
          {text.create}
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative flex-1">
            <span className="sr-only">{text.search}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={text.searchPlaceholder}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-9 py-2 text-sm text-foreground outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(["active", "inactive", "all"] as StatusFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  statusFilter === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {text.filter[value]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && filteredData.length === 0}
        emptyLabel={text.empty}
        onRetry={() => void query.refetch()}
      >
        <DataTable data={filteredData} columns={columns} />
      </ApiState>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingProduct ? text.editTitle : text.createTitle}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {text.cancel}
            </button>
            <button
              type="submit"
              form="product-name-form"
              disabled={saveMutation.isPending || !form.name.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {saveMutation.isPending ? text.saving : text.save}
            </button>
          </>
        }
      >
        <form id="product-name-form" onSubmit={submitForm} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">{text.code}</span>
            <input
              value={editingProduct?.product_name_code ?? text.generatedCode}
              readOnly
              disabled
              className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-muted-foreground"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">{text.name}</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">{text.unit}</span>
            <input
              value={form.unit}
              onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">{text.category}</span>
            {categories.length > 0 ? (
              <select
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
              >
                <option value="">{text.selectCategory}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
              />
            )}
          </label>
          {editingProduct && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              {text.currentStatus}: {text[editingProduct.status]}
            </div>
          )}
        </form>
      </Modal>

      <Modal
        isOpen={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        title={pendingTitle}
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPendingAction(null)}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {text.cancel}
            </button>
            <button
              type="button"
              onClick={confirmPendingAction}
              disabled={statusMutation.isPending || deleteMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {text.confirm}
            </button>
          </>
        }
      >
        <p className="text-sm text-foreground">{pendingDescription}</p>
      </Modal>
    </div>
  );
}
