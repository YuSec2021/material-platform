import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  apiClient,
  type MeasurementUnit,
  type MeasurementUnitPayload,
} from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";
import { SearchPanel } from "./standardPageUtils";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
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

const UNIT_TYPES = ["quantity", "mass", "length", "area", "volume", "time", "general"] as const;

const emptyForm: MeasurementUnitPayload = {
  name: "",
  symbol: "",
  unit_type: "general",
  description: "",
  decimal_places: 0,
  enabled: true,
  sort_order: 0,
};

const labels = {
  "zh-CN": {
    title: "计量单位管理",
    help: "统一维护单位名称、符号和精度，正在使用的单位不能删除。",
    add: "新增计量单位",
    edit: "编辑计量单位",
    search: "搜索单位名称、符号或描述...",
    empty: "暂无计量单位",
    name: "单位名称",
    symbol: "单位符号",
    type: "单位类型",
    decimalPlaces: "小数位数",
    usage: "使用数量",
    status: "状态",
    description: "描述",
    sortOrder: "排序",
    enabled: "启用",
    disabled: "停用",
    system: "系统预置",
    actions: "操作",
    save: "保存",
    saving: "保存中...",
    cancel: "取消",
    delete: "删除",
    deleteTitle: "删除计量单位",
    deleteConfirm: (unit: MeasurementUnit) =>
      unit.is_system
        ? `“${unit.name}”是系统预置单位，只能停用。`
        : unit.usage_count > 0
          ? `“${unit.name}”正在被 ${unit.usage_count} 条业务数据使用，不能删除。`
          : `确定删除计量单位“${unit.name}”吗？此操作无法撤销。`,
    saveSuccess: "计量单位已保存",
    saveFailed: "计量单位保存失败",
    deleteSuccess: "计量单位已删除",
    deleteFailed: "计量单位删除失败",
    unitTypes: {
      quantity: "数量",
      mass: "质量",
      length: "长度",
      area: "面积",
      volume: "体积",
      time: "时间",
      general: "通用",
    },
  },
  "en-US": {
    title: "Measurement Units",
    help: "Manage canonical names, symbols, and precision. Units in use cannot be deleted.",
    add: "New Unit",
    edit: "Edit Unit",
    search: "Search name, symbol, or description...",
    empty: "No measurement units",
    name: "Name",
    symbol: "Symbol",
    type: "Type",
    decimalPlaces: "Decimal Places",
    usage: "Usage",
    status: "Status",
    description: "Description",
    sortOrder: "Sort Order",
    enabled: "Enabled",
    disabled: "Disabled",
    system: "System",
    actions: "Actions",
    save: "Save",
    saving: "Saving...",
    cancel: "Cancel",
    delete: "Delete",
    deleteTitle: "Delete Measurement Unit",
    deleteConfirm: (unit: MeasurementUnit) =>
      unit.is_system
        ? `${unit.name} is a system unit and can only be disabled.`
        : unit.usage_count > 0
          ? `${unit.name} is used by ${unit.usage_count} records and cannot be deleted.`
          : `Delete ${unit.name}? This action cannot be undone.`,
    saveSuccess: "Measurement unit saved",
    saveFailed: "Failed to save measurement unit",
    deleteSuccess: "Measurement unit deleted",
    deleteFailed: "Failed to delete measurement unit",
    unitTypes: {
      quantity: "Quantity",
      mass: "Mass",
      length: "Length",
      area: "Area",
      volume: "Volume",
      time: "Time",
      general: "General",
    },
  },
};

function unitToForm(unit: MeasurementUnit): MeasurementUnitPayload {
  return {
    name: unit.name,
    symbol: unit.symbol,
    unit_type: unit.unit_type,
    description: unit.description,
    decimal_places: unit.decimal_places,
    enabled: unit.enabled,
    sort_order: unit.sort_order,
  };
}

export function MeasurementUnitList() {
  const { i18n } = useTranslation();
  const text = i18n.language === "en-US" ? labels["en-US"] : labels["zh-CN"];
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<MeasurementUnitPayload>(emptyForm);
  const [editingUnit, setEditingUnit] = useState<MeasurementUnit | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState<MeasurementUnit | null>(null);

  const query = useQuery({
    queryKey: ["measurement-units"],
    queryFn: () => apiClient.measurementUnits(),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: MeasurementUnitPayload) =>
      editingUnit
        ? apiClient.updateMeasurementUnit(editingUnit.id, payload)
        : apiClient.createMeasurementUnit(payload),
    onSuccess: async () => {
      toast.success(text.saveSuccess);
      setIsFormOpen(false);
      setEditingUnit(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["measurement-units"] });
    },
    onError: (error) => toast.error(`${text.saveFailed}: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteMeasurementUnit(id),
    onSuccess: async () => {
      toast.success(text.deleteSuccess);
      setUnitToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["measurement-units"] });
    },
    onError: (error) => toast.error(`${text.deleteFailed}: ${error.message}`),
  });

  const statusMutation = useMutation({
    mutationFn: ({ unit, enabled }: { unit: MeasurementUnit; enabled: boolean }) =>
      apiClient.updateMeasurementUnit(unit.id, { enabled }),
    onSuccess: async () => {
      toast.success(text.saveSuccess);
      await queryClient.invalidateQueries({ queryKey: ["measurement-units"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const data = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return query.data ?? [];
    }
    return (query.data ?? []).filter((unit) =>
      [unit.name, unit.symbol, unit.description].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [query.data, searchTerm]);

  const openCreate = () => {
    setEditingUnit(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  };

  const openEdit = (unit: MeasurementUnit) => {
    setEditingUnit(unit);
    setForm(unitToForm(unit));
    setIsFormOpen(true);
  };

  const columns = [
    { header: text.name, accessor: "name" as keyof MeasurementUnit },
    { header: text.symbol, accessor: "symbol" as keyof MeasurementUnit },
    {
      header: text.type,
      accessor: (unit: MeasurementUnit) =>
        text.unitTypes[unit.unit_type as keyof typeof text.unitTypes] ?? unit.unit_type,
    },
    { header: text.decimalPlaces, accessor: "decimal_places" as keyof MeasurementUnit },
    {
      header: text.usage,
      accessor: (unit: MeasurementUnit) => (
        <span title={`品名 ${unit.product_name_count} / 物料 ${unit.material_count} / 属性 ${unit.attribute_count}`}>
          {unit.usage_count}
        </span>
      ),
    },
    {
      header: text.status,
      accessor: (unit: MeasurementUnit) => (
        <div className="flex flex-wrap gap-1">
          <Switch
            checked={unit.enabled}
            aria-label={`${unit.name}${unit.enabled ? text.enabled : text.disabled}`}
            disabled={statusMutation.isPending}
            onCheckedChange={(enabled) => statusMutation.mutate({ unit, enabled })}
            className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-red-600"
          />
          {unit.is_system && <Badge variant="outline">{text.system}</Badge>}
        </div>
      ),
    },
    {
      header: text.actions,
      accessor: (unit: MeasurementUnit) => (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(unit)}>
            <Edit className="h-3.5 w-3.5" />
            {text.edit}
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => setUnitToDelete(unit)}>
            <Trash2 className="h-3.5 w-3.5" />
            {text.delete}
          </Button>
        </div>
      ),
    },
  ];

  const cannotDelete = Boolean(unitToDelete?.is_system || (unitToDelete?.usage_count ?? 0) > 0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-foreground">{text.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{text.help}</p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {text.add}
        </Button>
      </div>

      <SearchPanel value={searchTerm} onChange={setSearchTerm} placeholder={text.search} />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ApiState
          isLoading={query.isLoading}
          isError={query.isError}
          isEmpty={!query.isLoading && !query.isError && data.length === 0}
          emptyLabel={text.empty}
          onRetry={() => void query.refetch()}
        >
          <DataTable data={data} columns={columns} />
        </ApiState>
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingUnit ? text.edit : text.add}
        size="lg"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              {text.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate({
                ...form,
                name: form.name.trim(),
                symbol: form.symbol.trim(),
              })}
              disabled={
                saveMutation.isPending ||
                !form.name.trim() ||
                !form.symbol.trim()
              }
            >
              {saveMutation.isPending ? text.saving : text.save}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-foreground">
            <span>{text.name}</span>
            <Input
              aria-label={text.name}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{text.symbol}</span>
            <Input
              aria-label={text.symbol}
              value={form.symbol}
              onChange={(event) => setForm((current) => ({ ...current, symbol: event.target.value }))}
              placeholder="kg / m / 个"
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{text.type}</span>
            <select
              aria-label={text.type}
              value={form.unit_type}
              onChange={(event) => setForm((current) => ({ ...current, unit_type: event.target.value }))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {UNIT_TYPES.map((type) => (
                <option key={type} value={type}>{text.unitTypes[type]}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{text.decimalPlaces}</span>
            <Input
              aria-label={text.decimalPlaces}
              type="number"
              min={0}
              max={12}
              value={form.decimal_places}
              onChange={(event) => setForm((current) => ({
                ...current,
                decimal_places: Math.max(0, Math.min(12, Number(event.target.value))),
              }))}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{text.sortOrder}</span>
            <Input
              aria-label={text.sortOrder}
              type="number"
              value={form.sort_order}
              onChange={(event) => setForm((current) => ({ ...current, sort_order: Number(event.target.value) }))}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground md:col-span-2">
            <span>{text.description}</span>
            <Textarea
              aria-label={text.description}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground md:col-span-2">
            <Checkbox
              checked={form.enabled}
              onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked === true }))}
              aria-label={text.enabled}
            />
            {text.enabled}
          </label>
        </div>
      </Modal>

      <AlertDialog open={Boolean(unitToDelete)} onOpenChange={(open) => !open && setUnitToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {unitToDelete ? text.deleteConfirm(unitToDelete) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => unitToDelete && deleteMutation.mutate(unitToDelete.id)}
              disabled={cannotDelete || deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {text.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
