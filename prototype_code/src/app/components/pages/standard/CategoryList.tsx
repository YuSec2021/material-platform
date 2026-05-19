import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient, type Category, type CategoryLibrary, type CategoryPayload } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";
import { SearchPanel } from "./standardPageUtils";

type CategoryFormState = {
  name: string;
  code: string;
  categoryLibraryId: string;
  description: string;
};

const emptyForm: CategoryFormState = {
  name: "",
  code: "",
  categoryLibraryId: "",
  description: "",
};

function categoryToForm(category: Category): CategoryFormState {
  return {
    name: category.name,
    code: category.code,
    categoryLibraryId: category.category_library_id ? String(category.category_library_id) : "",
    description: category.description,
  };
}

function formToPayload(form: CategoryFormState): CategoryPayload {
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    category_library_id: Number(form.categoryLibraryId),
    description: form.description.trim(),
    enabled: true,
  };
}

function defaultLibraryId(libraries: CategoryLibrary[]) {
  return libraries[0] ? String(libraries[0].id) : "";
}

export function CategoryList() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<CategoryFormState>(emptyForm);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const query = useQuery({
    queryKey: ["categories"],
    queryFn: apiClient.categories,
    retry: false,
  });

  const librariesQuery = useQuery({
    queryKey: ["category-libraries"],
    queryFn: apiClient.categoryLibraries,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: CategoryPayload) =>
      editingCategory ? apiClient.updateCategory(editingCategory.id, payload) : apiClient.createCategory(payload),
    onSuccess: async () => {
      setIsFormOpen(false);
      setEditingCategory(null);
      setForm(emptyForm);
      toast.success(t("toast.saveSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toast.error(`${t("toast.saveFailed")}: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteCategory(id),
    onSuccess: async () => {
      toast.success(t("toast.deleteSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toast.error(`${t("toast.deleteFailed")}: ${error.message}`),
  });

  const data = useMemo(() => {
    const term = searchTerm.trim();
    const categories = query.data ?? [];
    if (!term) {
      return categories;
    }
    return categories.filter((item) =>
      [item.name, item.code, item.description, item.category_library].some((value) => value.includes(term)),
    );
  }, [query.data, searchTerm]);

  const openCreateForm = () => {
    setEditingCategory(null);
    setForm({ ...emptyForm, categoryLibraryId: defaultLibraryId(librariesQuery.data ?? []) });
    setIsFormOpen(true);
  };

  const openEditForm = (category: Category) => {
    setEditingCategory(category);
    setForm(categoryToForm(category));
    setIsFormOpen(true);
  };

  const handleSubmit = () => {
    saveMutation.mutate(formToPayload(form));
  };

  const handleDelete = (category: Category) => {
    if (window.confirm(t("confirm.deleteCategory", { name: category.name }))) {
      deleteMutation.mutate(category.id);
    }
  };

  const isLoading = query.isLoading || librariesQuery.isLoading;
  const isError = query.isError || librariesQuery.isError;
  const canSave = Boolean(form.name.trim() && form.categoryLibraryId) && !saveMutation.isPending;

  const columns = [
    { header: "编号", accessor: "id" as keyof Category },
    { header: t("field.name"), accessor: "name" as keyof Category },
    { header: t("field.code"), accessor: "code" as keyof Category },
    { header: t("field.categoryLibrary"), accessor: "category_library" as keyof Category },
    { header: t("field.description"), accessor: "description" as keyof Category },
    {
      header: t("field.status"),
      accessor: (row: Category) => (row.enabled ? t("status.enabled") : t("status.disabled")),
    },
    {
      header: t("action.operations"),
      accessor: (row: Category) => (
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
          <h1 className="text-2xl text-foreground">{t("page.categories")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("page.categoriesHelp")}</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          disabled={(librariesQuery.data ?? []).length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          <Plus className="h-4 w-4" />
          {t("action.addCategory")}
        </button>
      </div>

      <SearchPanel value={searchTerm} onChange={setSearchTerm} placeholder={t("field.searchCategories")} />

      <ApiState
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && !isError && data.length === 0}
        emptyLabel={t("state.emptyCategories")}
        onRetry={() => {
          void query.refetch();
          void librariesQuery.refetch();
        }}
      >
        <DataTable data={data} columns={columns} />
      </ApiState>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingCategory ? t("action.edit") : t("action.addCategory")}
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
              disabled={!canSave}
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
              placeholder={editingCategory ? "" : t("field.autoGenerated")}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-sm text-foreground md:col-span-2">
            <span>{t("field.categoryLibrary")}</span>
            <select
              value={form.categoryLibraryId}
              onChange={(event) => setForm((current) => ({ ...current, categoryLibraryId: event.target.value }))}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            >
              <option value="">{t("field.selectCategoryLibrary")}</option>
              {(librariesQuery.data ?? []).map((library) => (
                <option key={library.id} value={library.id}>
                  {library.name} ({library.code})
                </option>
              ))}
            </select>
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
        </div>
      </Modal>
    </div>
  );
}
