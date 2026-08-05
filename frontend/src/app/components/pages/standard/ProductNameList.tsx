import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Edit, Plus, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient, type ProductName, type ProductNamePayload } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";
import { SearchableSelect } from "../../common/SearchableSelect";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
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

type StatusFilter = "active" | "inactive" | "all";
type FormState = ProductNamePayload;
type PendingAction =
  | { type: "status"; product: ProductName; nextStatus: "active" | "inactive" }
  | { type: "delete"; product: ProductName }
  | null;

const emptyForm: FormState = {
  name: "",
  unit: "",
  unit_id: null,
  category_id: null,
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
  const measurementUnitsQuery = useQuery({
    queryKey: ["measurement-units", "enabled"],
    queryFn: () => apiClient.measurementUnits({ enabled: true }),
    retry: false,
  });

  const categories = categoryQuery.data ?? [];
  const measurementUnits = measurementUnitsQuery.data ?? [];

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
      category_id: categories[0]?.id ?? null,
      category: categories[0]?.name ?? "",
    });
    setIsFormOpen(true);
  };

  const openEdit = (product: ProductName) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      unit: product.unit,
      unit_id: product.unit_id,
      category_id: product.category_id,
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
        <Switch
          checked={row.status === "active"}
          aria-label={`${row.name}${row.status === "active" ? text.active : text.inactive}`}
          disabled={statusMutation.isPending}
          onCheckedChange={(checked) =>
            setPendingAction({
              type: "status",
              product: row,
              nextStatus: checked ? "active" : "inactive",
            })
          }
          className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-red-600"
        />
      ),
    },
    {
      header: text.actions,
      accessor: (row: ProductName) => {
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => openEdit(row)}
              variant="outline"
              size="sm"
            >
              <Edit className="h-3.5 w-3.5" />
              {text.edit}
            </Button>
            <Button
              type="button"
              onClick={() => setPendingAction({ type: "delete", product: row })}
              variant="destructive"
              size="sm"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {text.delete}
            </Button>
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
        <Button
          type="button"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" />
          {text.create}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative flex-1">
            <span className="sr-only">{text.search}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={text.search}
              type="text"
              placeholder={text.searchPlaceholder}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-9"
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
            <Button
              type="button"
              onClick={() => setIsFormOpen(false)}
              variant="outline"
            >
              {text.cancel}
            </Button>
            <Button
              type="submit"
              form="product-name-form"
              disabled={saveMutation.isPending || !form.name.trim()}
              aria-busy={saveMutation.isPending}
            >
              {saveMutation.isPending ? text.saving : text.save}
            </Button>
          </>
        }
      >
        <form id="product-name-form" onSubmit={submitForm} className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">{text.code}</span>
            <Input
              aria-label={text.code}
              value={editingProduct?.product_name_code ?? text.generatedCode}
              readOnly
              disabled
              className="bg-muted font-mono text-muted-foreground"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">{text.name}</span>
            <Input
              aria-label={text.name}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">{text.category}</span>
            {categories.length > 0 ? (
              <SearchableSelect
                ariaLabel={text.category}
                value={form.category_id === null ? "" : String(form.category_id)}
                onValueChange={(value) => {
                  const categoryId = value ? Number(value) : null;
                  const category = categories.find((item) => item.id === categoryId);
                  setForm((current) => ({
                    ...current,
                    category_id: categoryId,
                    category: category?.name ?? "",
                  }));
                }}
                options={categories.map((category) => ({
                  value: String(category.id),
                  label: `${category.name} (${category.code})`,
                  keywords: category.code,
                }))}
                placeholder={text.selectCategory}
                searchPlaceholder={i18n.language === "en-US" ? "Search categories..." : "搜索类目名称或编码..."}
                emptyText={i18n.language === "en-US" ? "No matching categories" : "暂无匹配类目"}
                clearLabel={i18n.language === "en-US" ? "No category" : "不选择类目"}
              />
            ) : (
              <Input
                aria-label={text.category}
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              />
            )}
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">{text.unit}</span>
            <SearchableSelect
              ariaLabel={text.unit}
              value={form.unit_id === null ? "" : String(form.unit_id)}
              onValueChange={(value) => {
                const unitId = value ? Number(value) : null;
                const unit = measurementUnits.find((item) => item.id === unitId);
                setForm((current) => ({
                  ...current,
                  unit_id: unitId,
                  unit: unit?.symbol ?? "",
                }));
              }}
              options={measurementUnits.map((unit) => ({
                value: String(unit.id),
                label: `${unit.name} (${unit.symbol})`,
                keywords: unit.symbol,
              }))}
              placeholder={i18n.language === "en-US" ? "Select a unit" : "请选择计量单位"}
              searchPlaceholder={i18n.language === "en-US" ? "Search units..." : "搜索计量单位..."}
              emptyText={i18n.language === "en-US" ? "No matching units" : "暂无匹配计量单位"}
              clearLabel={i18n.language === "en-US" ? "No unit" : "无计量单位"}
            />
          </label>
          {editingProduct && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground md:col-span-2">
              <CheckCircle2 className="h-4 w-4" />
              {text.currentStatus}: {text[editingProduct.status]}
            </div>
          )}
        </form>
      </Modal>

      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingTitle}</AlertDialogTitle>
            <AlertDialogDescription>{pendingDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPendingAction}
              disabled={statusMutation.isPending || deleteMutation.isPending}
              aria-busy={statusMutation.isPending || deleteMutation.isPending}
              className={pendingAction?.type === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {text.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
