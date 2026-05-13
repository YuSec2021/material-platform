import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Package, Plus, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  apiClient,
  type MaterialLibrary,
  type MaterialLibraryPayload,
} from "@/app/api/client";
import { Badge } from "@/app/components/ui/badge";
import { ApiState } from "../../common/ApiState";
import { Modal } from "../../common/Modal";

type LibraryFormState = {
  name: string;
  description: string;
  enabled: boolean;
};

const emptyForm: LibraryFormState = {
  name: "",
  description: "",
  enabled: true,
};

function libraryToForm(library: MaterialLibrary): LibraryFormState {
  return {
    name: library.name,
    description: library.description,
    enabled: library.enabled,
  };
}

function formToPayload(form: LibraryFormState): MaterialLibraryPayload {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    enabled: form.enabled,
  };
}

export function MaterialLibraryList() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<LibraryFormState>(emptyForm);
  const [editingLibrary, setEditingLibrary] = useState<MaterialLibrary | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const query = useQuery({
    queryKey: ["material-libraries"],
    queryFn: apiClient.materialLibraries,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: MaterialLibraryPayload) =>
      editingLibrary
        ? apiClient.updateMaterialLibrary(editingLibrary.id, payload)
        : apiClient.createMaterialLibrary(payload),
    onSuccess: async () => {
      setIsFormOpen(false);
      setEditingLibrary(null);
      setForm(emptyForm);
      toast.success(t("toast.saveSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["material-libraries"] });
    },
    onError: (error) => toast.error(`${t("toast.saveFailed")}: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteMaterialLibrary(id),
    onSuccess: async () => {
      toast.success(t("toast.deleteSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["material-libraries"] });
    },
    onError: (error) => toast.error(`${t("toast.deleteFailed")}: ${error.message}`),
  });

  const data = useMemo(() => {
    const libraries = query.data ?? [];
    const term = searchTerm.trim();
    if (!term) {
      return libraries;
    }
    return libraries.filter((item) =>
      [item.name, item.code, item.description].some((value) => value.includes(term)),
    );
  }, [query.data, searchTerm]);

  const openCreateForm = () => {
    setEditingLibrary(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  };

  const openEditForm = (library: MaterialLibrary) => {
    setEditingLibrary(library);
    setForm(libraryToForm(library));
    setIsFormOpen(true);
  };

  const handleSubmit = () => {
    saveMutation.mutate(formToPayload(form));
  };

  const handleDelete = (library: MaterialLibrary) => {
    if (window.confirm(`确定删除物料库 ${library.name} 吗？该操作不可撤销。`)) {
      deleteMutation.mutate(library.id);
    }
  };

  return (
    <div className="flex flex-1 flex-col space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-900">{t("page.materialLibraries")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("page.materialLibrariesHelp")}</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          {t("action.addLibrary")}
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <label className="flex max-w-md items-center gap-2 text-sm text-gray-600">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            type="search"
            placeholder={t("field.searchLibraries")}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="flex-1 outline-none"
          />
        </label>
      </div>

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && data.length === 0}
        emptyLabel={t("state.emptyLibraries")}
        onRetry={() => void query.refetch()}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.map((item) => (
            <article key={item.id} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                  <Package className="h-6 w-6 text-green-600" />
                </div>
                <Badge
                  variant="outline"
                  className={item.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-600"}
                >
                  {item.enabled ? t("status.enabled") : t("status.disabled")}
                </Badge>
              </div>
              <h2 className="mb-1 text-lg font-medium text-gray-900">{item.name}</h2>
              <p className="mb-3 font-mono text-sm text-gray-500">{item.code}</p>
              <p className="min-h-10 text-sm text-gray-600">{item.description || "暂无描述"}</p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => openEditForm(item)}
                  className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
                >
                  <Edit className="h-3.5 w-3.5" />
                  {t("action.edit")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={deleteMutation.isPending}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("action.delete")}
                </button>
              </div>
            </article>
          ))}
        </div>
      </ApiState>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingLibrary ? t("action.edit") : t("action.addLibrary")}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("action.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!form.name.trim() || saveMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {saveMutation.isPending ? t("action.saving") : t("action.save")}
            </button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-gray-700">
            <span>{t("field.name")}</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-700">
            <span>{t("field.code")}</span>
            <input
              type="text"
              value={editingLibrary?.code ?? "保存后自动生成"}
              readOnly
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
            <span>{t("field.description")}</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300"
            />
            {t("status.enabled")}
          </label>
          {saveMutation.isError && (
            <p className="text-sm text-red-600 md:col-span-2">{saveMutation.error.message}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
