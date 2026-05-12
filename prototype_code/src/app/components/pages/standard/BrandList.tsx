import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, ImageIcon, Plus, Trash2 } from "lucide-react";
import { apiClient, type Brand, type BrandLogo, type BrandPayload } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";
import { SearchPanel } from "./standardPageUtils";

type BrandFormState = {
  name: string;
  description: string;
  logo: BrandLogo;
};

const emptyLogo: BrandLogo = {
  filename: "",
  content_type: "",
  data_url: "",
};

const emptyForm: BrandFormState = {
  name: "",
  description: "",
  logo: emptyLogo,
};

function brandToForm(brand: Brand): BrandFormState {
  return {
    name: brand.name,
    description: brand.description,
    logo: brand.logo,
  };
}

function formToPayload(form: BrandFormState): BrandPayload {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    logo: form.logo,
    enabled: true,
  };
}

function LogoCell({ brand }: { brand: Brand }) {
  if (brand.logo?.data_url) {
    return (
      <img
        src={brand.logo.data_url}
        alt={`${brand.name} logo`}
        className="h-10 w-10 rounded-md border border-gray-200 object-cover"
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-500">
      <ImageIcon className="h-4 w-4" />
      未上传
    </span>
  );
}

export function BrandList() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<BrandFormState>(emptyForm);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const query = useQuery({
    queryKey: ["brands"],
    queryFn: apiClient.brands,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: BrandPayload) =>
      editingBrand ? apiClient.updateBrand(editingBrand.id, payload) : apiClient.createBrand(payload),
    onSuccess: async () => {
      setIsFormOpen(false);
      setEditingBrand(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteBrand(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
  });

  const data = useMemo(() => {
    const term = searchTerm.trim();
    const brands = query.data ?? [];
    if (!term) {
      return brands;
    }
    return brands.filter((item) =>
      [item.name, item.code, item.description].some((value) => value.includes(term)),
    );
  }, [query.data, searchTerm]);

  const openCreateForm = () => {
    setEditingBrand(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  };

  const openEditForm = (brand: Brand) => {
    setEditingBrand(brand);
    setForm(brandToForm(brand));
    setIsFormOpen(true);
  };

  const handleFile = (file: File | null) => {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({
        ...current,
        logo: {
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          data_url: String(reader.result ?? ""),
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    saveMutation.mutate(formToPayload(form));
  };

  const handleDelete = (brand: Brand) => {
    if (window.confirm(`确定删除品牌 ${brand.name} 吗？`)) {
      deleteMutation.mutate(brand.id);
    }
  };

  const columns = [
    {
      header: "Logo",
      accessor: (row: Brand) => <LogoCell brand={row} />,
    },
    { header: "品牌名称", accessor: "name" as keyof Brand },
    { header: "品牌编码", accessor: "code" as keyof Brand },
    { header: "描述", accessor: "description" as keyof Brand },
    {
      header: "状态",
      accessor: (row: Brand) => (row.enabled ? "启用" : "停用"),
    },
    {
      header: "操作",
      accessor: (row: Brand) => (
        <div className="flex gap-2">
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
          <h1 className="text-2xl text-gray-900">品牌管理</h1>
          <p className="mt-1 text-sm text-gray-500">品牌数据来自后端 API，支持生成编码、Logo 缩略图和 CRUD 操作。</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          新增品牌
        </button>
      </div>

      <SearchPanel value={searchTerm} onChange={setSearchTerm} placeholder="搜索品牌名称、编码或描述..." />

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && data.length === 0}
        emptyLabel="后端暂无品牌数据"
        onRetry={() => void query.refetch()}
      >
        <DataTable data={data} columns={columns} />
      </ApiState>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingBrand ? "编辑品牌" : "新增品牌"}
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
            <span>品牌名称</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-700">
            <span>品牌编码</span>
            <input
              type="text"
              value={editingBrand?.code ?? "保存后自动生成"}
              readOnly
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
            <span>描述</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-700">
            <span>Logo 文件</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-700">
            <span>Logo data URL</span>
            <input
              type="text"
              value={form.logo.data_url}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  logo: {
                    filename: current.logo.filename || "logo-data-url",
                    content_type: current.logo.content_type || "image/png",
                    data_url: event.target.value,
                  },
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="data:image/png;base64,..."
            />
          </label>
          {form.logo.data_url && (
            <div className="md:col-span-2">
              <p className="mb-2 text-sm text-gray-700">Logo 预览</p>
              <img src={form.logo.data_url} alt="Logo 预览" className="h-14 w-14 rounded-md border border-gray-200 object-cover" />
            </div>
          )}
          {saveMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">
              保存失败，请检查品牌名称是否重复或后端返回。
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
