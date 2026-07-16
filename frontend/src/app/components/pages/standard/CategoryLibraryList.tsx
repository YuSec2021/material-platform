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
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Checkbox } from "@/app/components/ui/checkbox";
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
  const [libraryToDelete, setLibraryToDelete] = useState<CategoryLibrary | null>(null);

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
      setLibraryToDelete(null);
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
          <Button
            type="button"
            onClick={() => openEditForm(row)}
            variant="outline"
            size="sm"
          >
            <Edit className="h-3.5 w-3.5" />
            {t("action.edit")}
          </Button>
          <Button
            type="button"
            onClick={() => setLibraryToDelete(row)}
            disabled={deleteMutation.isPending}
            variant="destructive"
            size="sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("action.delete")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-foreground">{t("page.categoryLibraries")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("page.categoryLibrariesHelp")}</p>
        </div>
        <Button
          type="button"
          onClick={openCreateForm}
        >
          <Plus className="h-4 w-4" />
          {t("action.addCategoryLibrary")}
        </Button>
      </div>

      <SearchPanel value={searchTerm} onChange={setSearchTerm} placeholder={t("field.searchCategoryLibraries")} />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ApiState
          isLoading={query.isLoading}
          isError={query.isError}
          isEmpty={!query.isLoading && !query.isError && data.length === 0}
          emptyLabel={t("state.emptyCategoryLibraries")}
          onRetry={() => void query.refetch()}
        >
          <DataTable data={data} columns={columns} />
        </ApiState>
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingLibrary ? t("action.edit") : t("action.addCategoryLibrary")}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              onClick={() => setIsFormOpen(false)}
              variant="outline"
            >
              {t("action.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!form.name.trim() || saveMutation.isPending}
              aria-busy={saveMutation.isPending}
            >
              {saveMutation.isPending ? t("action.saving") : t("action.save")}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("field.name")}</span>
            <Input
              aria-label={t("field.name")}
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("field.code")}</span>
            <Input
              aria-label={t("field.code")}
              type="text"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              placeholder={editingLibrary ? "" : t("field.autoGenerated")}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground md:col-span-2">
            <span>{t("field.description")}</span>
            <Textarea
              aria-label={t("field.description")}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground md:col-span-2">
            <Checkbox
              checked={form.qdrantEnabled}
              onCheckedChange={(checked) => setForm((current) => ({ ...current, qdrantEnabled: checked === true }))}
              aria-label={t("field.qdrantEnabled")}
            />
            {t("field.qdrantEnabled")}
          </label>
        </div>
      </Modal>

      <AlertDialog open={Boolean(libraryToDelete)} onOpenChange={(open) => !open && setLibraryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("action.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {libraryToDelete ? t("confirm.deleteCategoryLibrary", { name: libraryToDelete.name }) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => libraryToDelete && deleteMutation.mutate(libraryToDelete.id)}
              disabled={deleteMutation.isPending}
              aria-busy={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? t("action.saving") : t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
