import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient, type CategoryLibrary, type CategoryLibraryPayload } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";
import { SearchPanel } from "./standardPageUtils";

type CategoryLibraryFormState = {
  name: string;
  code: string;
  description: string;
  qdrantEnabled: boolean;
};

const emptyForm: CategoryLibraryFormState = {
  name: "",
  code: "",
  description: "",
  qdrantEnabled: false,
};

function libraryToForm(library: CategoryLibrary): CategoryLibraryFormState {
  return {
    name: library.name,
    code: library.code,
    description: library.description,
    qdrantEnabled: library.qdrant_enabled,
  };
}

function formToPayload(form: CategoryLibraryFormState): CategoryLibraryPayload {
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    description: form.description.trim(),
    enabled: true,
    qdrant_enabled: form.qdrantEnabled,
  };
}

export function CategoryLibraryList() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<CategoryLibraryFormState>(emptyForm);
  const [editingLibrary, setEditingLibrary] = useState<CategoryLibrary | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const query = useQuery({
    queryKey: ["category-libraries"],
    queryFn: apiClient.categoryLibraries,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: CategoryLibraryPayload) =>
      editingLibrary
        ? apiClient.updateCategoryLibrary(editingLibrary.id, payload)
        : apiClient.createCategoryLibrary(payload),
    onSuccess: async () => {
      setIsFormOpen(false);
      setEditingLibrary(null);
      setForm(emptyForm);
      toast.success(t("toast.saveSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["category-libraries"] });
    },
    onError: (error) => toast.error(`${t("toast.saveFailed")}: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteCategoryLibrary(id),
    onSuccess: async () => {
      toast.success(t("toast.deleteSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["category-libraries"] });
    },
    onError: (error) => toast.error(`${t("toast.deleteFailed")}: ${error.message}`),
  });

  const data = useMemo(() => {
    const term = searchTerm.trim();
    const libraries = query.data ?? [];
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

  const openEditForm = (library: CategoryLibrary) => {
    setEditingLibrary(library);
    setForm(libraryToForm(library));
    setIsFormOpen(true);
  };

  const handleSubmit = () => {
    saveMutation.mutate(formToPayload(form));
  };

  const handleDelete = (library: CategoryLibrary) => {
    if (window.confirm(t("confirm.deleteCategoryLibrary", { name: library.name }))) {
      deleteMutation.mutate(library.id);
    }
  };

  const columns = [
    { header: "编号", accessor: "id" as keyof CategoryLibrary },
    { header: t("field.name"), accessor: "name" as keyof CategoryLibrary },
    { header: t("field.code"), accessor: "code" as keyof CategoryLibrary },
    { header: t("field.description"), accessor: "description" as keyof CategoryLibrary },
    {
      header: t("field.qdrantEnabled"),
      accessor: (row: CategoryLibrary) => (row.qdrant_enabled ? t("status.enabled") : t("status.disabled")),
    },
    {
      header: t("field.status"),
      accessor: (row: CategoryLibrary) => (row.enabled ? t("status.enabled") : t("status.disabled")),
    },
    {
      header: t("action.operations"),
      accessor: (row: CategoryLibrary) => (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => openEditForm(row)}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
          >
            <Edit className="h-3.5 w-3.5" />
            {t("action.edit")}
          </button>
          <button
            type="button"
            onClick={() => handleDelete(row)}
            disabled={deleteMutation.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("action.delete")}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-foreground">{t("page.categoryLibraries")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("page.categoryLibrariesHelp")}</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          {t("action.addCategoryLibrary")}
        </button>
      </div>

      <SearchPanel value={searchTerm} onChange={setSearchTerm} placeholder={t("field.searchCategoryLibraries")} />

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && data.length === 0}
        emptyLabel={t("state.emptyCategoryLibraries")}
        onRetry={() => void query.refetch()}
      >
        <DataTable data={data} columns={columns} />
      </ApiState>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingLibrary ? t("action.edit") : t("action.addCategoryLibrary")}
        size="lg"
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
              disabled={!form.name.trim() || saveMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {saveMutation.isPending ? t("action.saving") : t("action.save")}
            </button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("field.name")}</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("field.code")}</span>
            <input
              type="text"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              placeholder={editingLibrary ? "" : t("field.autoGenerated")}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-sm text-foreground md:col-span-2">
            <span>{t("field.description")}</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground md:col-span-2">
            <input
              type="checkbox"
              checked={form.qdrantEnabled}
              onChange={(event) => setForm((current) => ({ ...current, qdrantEnabled: event.target.checked }))}
              className="h-4 w-4 rounded border-border"
            />
            {t("field.qdrantEnabled")}
          </label>
        </div>
      </Modal>
    </div>
  );
}
