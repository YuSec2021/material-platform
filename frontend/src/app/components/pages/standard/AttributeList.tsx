import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Edit, Plus, Trash2 } from "lucide-react";
import { apiClient, type Attribute, type AttributePayload } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";
import { SearchPanel } from "./standardPageUtils";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Badge } from "@/app/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
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

const DEFAULT_PRODUCT_NAME = "Sprint 3 A4 彩色激光打印机";
const ATTRIBUTE_TYPES = ["text", "number", "select", "multi_select", "boolean", "date"];

type AttributeFormState = {
  name: string;
  data_type: string;
  required: boolean;
  optionsText: string;
  default_value: string;
  description: string;
};

const emptyForm: AttributeFormState = {
  name: "",
  data_type: "text",
  required: false,
  optionsText: "",
  default_value: "",
  description: "",
};

function splitOptions(value: string): string[] {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function attributeToForm(attribute: Attribute): AttributeFormState {
  return {
    name: attribute.name,
    data_type: attribute.data_type,
    required: attribute.required,
    optionsText: attribute.options.join("\n"),
    default_value: attribute.default_value,
    description: attribute.description,
  };
}

function formToPayload(form: AttributeFormState): AttributePayload {
  return {
    product_name: DEFAULT_PRODUCT_NAME,
    name: form.name.trim(),
    data_type: form.data_type,
    required: form.required,
    default_value: form.default_value.trim(),
    options: splitOptions(form.optionsText),
    description: form.description.trim(),
    source: "manual",
  };
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    text: "文本",
    number: "数值",
    select: "单选",
    multi_select: "多选",
    boolean: "布尔",
    date: "日期",
  };
  return labels[type] ?? type;
}

function AttributeTypeBadge({ type }: { type: string }) {
  return <Badge variant="secondary">{typeLabel(type)}</Badge>;
}

export function AttributeList() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<AttributeFormState>(emptyForm);
  const [editingAttribute, setEditingAttribute] = useState<Attribute | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [openChangeAttribute, setOpenChangeAttribute] = useState<Attribute | null>(null);
  const [attributeToDelete, setAttributeToDelete] = useState<Attribute | null>(null);

  const query = useQuery({
    queryKey: ["attributes"],
    queryFn: apiClient.attributes,
    retry: false,
  });

  const changesQuery = useQuery({
    queryKey: ["attribute-changes", openChangeAttribute?.id],
    queryFn: () => apiClient.attributeChanges(openChangeAttribute!.id),
    enabled: Boolean(openChangeAttribute),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: AttributePayload) =>
      editingAttribute
        ? apiClient.updateAttribute(editingAttribute.id, payload)
        : apiClient.createAttribute(payload),
    onSuccess: async () => {
      setAttributeToDelete(null);
      setIsFormOpen(false);
      setEditingAttribute(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["attributes"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteAttribute(id),
    onSuccess: async () => {
      setOpenChangeAttribute(null);
      await queryClient.invalidateQueries({ queryKey: ["attributes"] });
    },
  });

  const data = useMemo(() => {
    const term = searchTerm.trim();
    const attributes = query.data ?? [];
    if (!term) {
      return attributes;
    }
    return attributes.filter((item) =>
      [item.name, item.code, item.product_name, item.default_value, item.description].some((value) =>
        value.includes(term),
      ),
    );
  }, [query.data, searchTerm]);

  const openCreateForm = () => {
    setEditingAttribute(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  };

  const openEditForm = (attribute: Attribute) => {
    setEditingAttribute(attribute);
    setForm(attributeToForm(attribute));
    setIsFormOpen(true);
  };

  const handleSubmit = () => {
    saveMutation.mutate(formToPayload(form));
  };

  const columns = [
    { header: "编号", accessor: "id" as keyof Attribute },
    { header: "属性名称", accessor: "name" as keyof Attribute },
    {
      header: "属性类型",
      accessor: (row: Attribute) => <AttributeTypeBadge type={row.data_type} />,
    },
    {
      header: "是否必填",
      accessor: (row: Attribute) => (row.required ? "是" : "否"),
    },
    {
      header: "选项",
      accessor: (row: Attribute) => (row.options.length > 0 ? row.options.join("、") : "-"),
    },
    { header: "默认值", accessor: "default_value" as keyof Attribute },
    { header: "提示文本", accessor: "description" as keyof Attribute },
    {
      header: "操作",
      accessor: (row: Attribute) => (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => openEditForm(row)}
            variant="outline"
            size="sm"
          >
            <Edit className="h-3.5 w-3.5" />
            编辑
          </Button>
          <Button
            type="button"
            onClick={() => setOpenChangeAttribute((current) => (current?.id === row.id ? null : row))}
            variant="secondary"
            size="sm"
          >
            <Clock3 className="h-3.5 w-3.5" />
            日志
          </Button>
          <Button
            type="button"
            onClick={() => setAttributeToDelete(row)}
            variant="destructive"
            size="sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-foreground">属性管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">属性数据来自后端 API，支持新增、编辑、删除和变更日志查看。</p>
        </div>
        <Button
          type="button"
          onClick={openCreateForm}
        >
          <Plus className="h-4 w-4" />
          新增属性
        </Button>
      </div>

      <SearchPanel value={searchTerm} onChange={setSearchTerm} placeholder="搜索属性名称、编码、品名或提示文本..." />

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && data.length === 0}
        emptyLabel="后端暂无属性数据"
        onRetry={() => void query.refetch()}
      >
        <DataTable data={data} columns={columns} />
      </ApiState>

      {openChangeAttribute && (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-foreground">变更日志：{openChangeAttribute.name}</h2>
            <Button type="button" onClick={() => setOpenChangeAttribute(null)} variant="ghost" size="sm">
              收起
            </Button>
          </div>
          <ApiState
            isLoading={changesQuery.isLoading}
            isError={changesQuery.isError}
            isEmpty={!changesQuery.isLoading && !changesQuery.isError && (changesQuery.data ?? []).length === 0}
            emptyLabel="暂无属性变更日志"
            onRetry={() => void changesQuery.refetch()}
          >
            <ol className="mt-4 space-y-4 border-l border-blue-200 pl-4">
              {(changesQuery.data ?? []).map((change) => (
                <li key={change.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600" />
                  <div className="rounded-md bg-muted/40 p-3">
                    <p className="text-sm font-medium text-foreground">
                      v{change.version} {change.changed_fields.join("、")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {change.operator} · {change.created_at}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </ApiState>
        </section>
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingAttribute ? "编辑属性" : "新增属性"}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              onClick={() => setIsFormOpen(false)}
              variant="outline"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!form.name.trim() || saveMutation.isPending}
              aria-busy={saveMutation.isPending}
            >
              {saveMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-foreground">
            <span>属性名称</span>
            <Input
              aria-label="属性名称"
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>属性类型</span>
            <Select
              value={form.data_type}
              onValueChange={(value) => setForm((current) => ({ ...current, data_type: value }))}
            >
              <SelectTrigger aria-label="属性类型"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ATTRIBUTE_TYPES.map((type) => <SelectItem key={type} value={type}>{typeLabel(type)}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={form.required}
              onCheckedChange={(checked) => setForm((current) => ({ ...current, required: checked === true }))}
              aria-label="是否必填"
            />
            是否必填
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>默认值</span>
            <Input
              aria-label="默认值"
              type="text"
              value={form.default_value}
              onChange={(event) => setForm((current) => ({ ...current, default_value: event.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground md:col-span-2">
            <span>选项</span>
            <Textarea
              aria-label="选项"
              value={form.optionsText}
              onChange={(event) => setForm((current) => ({ ...current, optionsText: event.target.value }))}
              rows={3}
              placeholder="每行一个选项，或用逗号分隔"
            />
          </label>
          <label className="space-y-1 text-sm text-foreground md:col-span-2">
            <span>提示文本</span>
            <Textarea
              aria-label="提示文本"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
            />
          </label>
          {saveMutation.isError && (
            <Alert variant="destructive" className="md:col-span-2">
              <AlertDescription>保存失败，请检查后端返回。</AlertDescription>
            </Alert>
          )}
        </div>
      </Modal>

      <AlertDialog open={Boolean(attributeToDelete)} onOpenChange={(open) => !open && setAttributeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除属性</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除属性 {attributeToDelete?.name} 吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => attributeToDelete && deleteMutation.mutate(attributeToDelete.id)}
              disabled={deleteMutation.isPending}
              aria-busy={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
