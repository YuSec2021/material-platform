import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Edit, Plus, Trash2 } from "lucide-react";
import { apiClient, type Attribute, type AttributePayload } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";
import { SearchPanel } from "./standardPageUtils";

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
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
      {typeLabel(type)}
    </span>
  );
}

export function AttributeList() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<AttributeFormState>(emptyForm);
  const [editingAttribute, setEditingAttribute] = useState<Attribute | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [openChangeAttribute, setOpenChangeAttribute] = useState<Attribute | null>(null);

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

  const handleDelete = (attribute: Attribute) => {
    if (window.confirm(`确定删除属性 ${attribute.name} 吗？`)) {
      deleteMutation.mutate(attribute.id);
    }
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
          <button
            type="button"
            onClick={() => openEditForm(row)}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
          >
            <Edit className="h-3.5 w-3.5" />
            编辑
          </button>
          <button
            type="button"
            onClick={() => setOpenChangeAttribute((current) => (current?.id === row.id ? null : row))}
            className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2.5 py-1.5 text-xs text-amber-700 hover:bg-amber-50"
          >
            <Clock3 className="h-3.5 w-3.5" />
            日志
          </button>
          <button
            type="button"
            onClick={() => handleDelete(row)}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-900">属性管理</h1>
          <p className="mt-1 text-sm text-gray-500">属性数据来自后端 API，支持新增、编辑、删除和变更日志查看。</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          新增属性
        </button>
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
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-gray-900">变更日志：{openChangeAttribute.name}</h2>
            <button type="button" onClick={() => setOpenChangeAttribute(null)} className="text-sm text-gray-500 hover:text-gray-700">
              收起
            </button>
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
                  <div className="rounded-md bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-900">
                      v{change.version} {change.changed_fields.join("、")}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
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
              disabled={!form.name.trim() || saveMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {saveMutation.isPending ? "保存中..." : "保存"}
            </button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-gray-700">
            <span>属性名称</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-700">
            <span>属性类型</span>
            <select
              value={form.data_type}
              onChange={(event) => setForm((current) => ({ ...current, data_type: event.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {ATTRIBUTE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.required}
              onChange={(event) => setForm((current) => ({ ...current, required: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            是否必填
          </label>
          <label className="space-y-1 text-sm text-gray-700">
            <span>默认值</span>
            <input
              type="text"
              value={form.default_value}
              onChange={(event) => setForm((current) => ({ ...current, default_value: event.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
            <span>选项</span>
            <textarea
              value={form.optionsText}
              onChange={(event) => setForm((current) => ({ ...current, optionsText: event.target.value }))}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="每行一个选项，或用逗号分隔"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
            <span>提示文本</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          {saveMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">
              保存失败，请检查后端返回。
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
