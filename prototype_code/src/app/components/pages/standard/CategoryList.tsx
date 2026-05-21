import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Download,
  Edit,
  FileText,
  Inbox,
  Loader2,
  Plus,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  apiClient,
  type Category,
  type CategoryBulkImportResult,
  type CategoryImportRow,
  type CategoryLibrary,
  type CategoryPayload,
} from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { ApiState } from "../../common/ApiState";
import { Modal } from "../../common/Modal";

type CategoryFormState = {
  name: string;
  code: string;
  categoryLibraryId: string;
  parentCategoryId: string;
  description: string;
};

type PreviewRow = CategoryImportRow & {
  id: string;
  errors: string[];
  confidence?: number;
};

const CATEGORY_PAGE_SIZE = 10;

const emptyForm: CategoryFormState = {
  name: "",
  code: "",
  categoryLibraryId: "",
  parentCategoryId: "",
  description: "",
};

function categoryToForm(category: Category): CategoryFormState {
  return {
    name: category.name,
    code: category.code,
    categoryLibraryId: category.category_library_id ? String(category.category_library_id) : "",
    parentCategoryId: category.parent_category_id ? String(category.parent_category_id) : "",
    description: category.description,
  };
}

function formToPayload(form: CategoryFormState): CategoryPayload {
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    category_library_id: Number(form.categoryLibraryId),
    parent_category_id: form.parentCategoryId ? Number(form.parentCategoryId) : null,
    description: form.description.trim(),
    enabled: true,
  };
}

function defaultLibraryId(libraries: CategoryLibrary[]) {
  return libraries[0] ? String(libraries[0].id) : "";
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseImportCsv(text: string): PreviewRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const header = parseCsvLine(lines[0] ?? "");
  const level1Index = header.indexOf("一级类目");
  const level2Index = header.indexOf("二级类目");
  const level3Index = header.indexOf("三级类目");
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    return toPreviewRow(
      {
        "一级类目": values[level1Index] ?? "",
        "二级类目": values[level2Index] ?? "",
        "三级类目": values[level3Index] ?? "",
      },
      `csv-${index + 1}`,
    );
  });
}

function toPreviewRow(row: CategoryImportRow, id: string, confidence?: number): PreviewRow {
  const level1 = row["一级类目"]?.trim() ?? "";
  const level2 = row["二级类目"]?.trim() ?? "";
  const level3 = row["三级类目"]?.trim() ?? "";
  const errors: string[] = [];
  if (!level1) {
    errors.push("missingLevel1");
  }
  if (level3 && !level2) {
    errors.push("missingLevel2");
  }
  return { id, "一级类目": level1, "二级类目": level2, "三级类目": level3, errors, confidence };
}

function previewRowsToImportRows(rows: PreviewRow[]): CategoryImportRow[] {
  return rows.map((row) => ({
    "一级类目": row["一级类目"],
    "二级类目": row["二级类目"],
    "三级类目": row["三级类目"],
  }));
}

function categoryPath(category: Category, categories: Category[]) {
  const byId = new Map(categories.map((item) => [item.id, item]));
  const path = [category.name];
  let parentId = category.parent_category_id;
  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent) {
      break;
    }
    path.unshift(parent.name);
    parentId = parent.parent_category_id;
  }
  return path.join(" / ");
}

function categoryDepth(category: Category, categories: Category[]) {
  const byId = new Map(categories.map((item) => [item.id, item]));
  let depth = 1;
  let parentId = category.parent_category_id;
  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent) {
      break;
    }
    depth += 1;
    parentId = parent.parent_category_id;
  }
  return depth;
}

function resultSummary(result: CategoryBulkImportResult | null) {
  if (!result) {
    return "";
  }
  return `${result.success_count} / ${result.skipped_count} / ${result.error_count}`;
}

export function CategoryList() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = Boolean(user?.is_super_admin);
  const aiTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [libraryFilter, setLibraryFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [form, setForm] = useState<CategoryFormState>(emptyForm);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [importLibraryId, setImportLibraryId] = useState("");
  const [importRows, setImportRows] = useState<PreviewRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importResult, setImportResult] = useState<CategoryBulkImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [aiText, setAiText] = useState("");
  const [recognizedRows, setRecognizedRows] = useState<PreviewRow[]>([]);

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

  const categories = query.data ?? [];
  const libraries = librariesQuery.data ?? [];
  const invalidImportRows = importRows.filter((row) => row.errors.length > 0);
  const invalidRecognizedRows = recognizedRows.filter((row) => row.errors.length > 0);
  const filteredCategories = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return categories
      .filter((category) => {
        if (libraryFilter && String(category.category_library_id ?? "") !== libraryFilter) {
          return false;
        }
        if (levelFilter && String(categoryDepth(category, categories)) !== levelFilter) {
          return false;
        }
        if (!term) {
          return true;
        }
        return [
          category.name,
          category.code,
          category.description,
          category.category_library,
          categoryPath(category, categories),
        ].some((value) => value.toLowerCase().includes(term));
      })
      .sort((left, right) => categoryPath(left, categories).localeCompare(categoryPath(right, categories)));
  }, [categories, levelFilter, libraryFilter, searchTerm]);
  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / CATEGORY_PAGE_SIZE));
  const paginatedCategories = filteredCategories.slice(
    (currentPage - 1) * CATEGORY_PAGE_SIZE,
    currentPage * CATEGORY_PAGE_SIZE,
  );

  useEffect(() => {
    const firstLibrary = libraries[0];
    if (!importLibraryId && firstLibrary) {
      setImportLibraryId(String(firstLibrary.id));
    }
  }, [importLibraryId, libraries]);

  useEffect(() => {
    if (isAiOpen) {
      window.setTimeout(() => aiTextareaRef.current?.focus(), 0);
    }
  }, [isAiOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [levelFilter, libraryFilter, searchTerm]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

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

  const importMutation = useMutation({
    mutationFn: (rows: CategoryImportRow[]) => apiClient.bulkImportCategories(Number(importLibraryId), rows),
    onSuccess: async (result) => {
      setImportResult(result);
      toast.success(t("categoryImport.importComplete"));
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toast.error(`${t("categoryImport.importFailed")}: ${error.message}`),
  });

  const aiMutation = useMutation({
    mutationFn: () => apiClient.recognizeCategories(aiText, Number(importLibraryId) || null),
    onSuccess: (result) => {
      const rows = result.categories.map((item, index) =>
        toPreviewRow(
          {
            "一级类目": item.level1,
            "二级类目": item.level2 ?? "",
            "三级类目": item.level3 ?? "",
          },
          `ai-${index + 1}`,
          item.confidence,
        ),
      );
      setRecognizedRows(rows);
      toast.success(t("categoryImport.aiRecognized"));
    },
    onError: (error) => toast.error(`${t("toast.aiFailed")}: ${error.message}`),
  });

  const aiConfirmMutation = useMutation({
    mutationFn: (rows: CategoryImportRow[]) => apiClient.bulkImportCategories(Number(importLibraryId), rows),
    onSuccess: async (result) => {
      setImportResult(result);
      setIsAiOpen(false);
      setRecognizedRows([]);
      setAiText("");
      toast.success(t("categoryImport.importComplete"));
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toast.error(`${t("categoryImport.importFailed")}: ${error.message}`),
  });

  const openCreateForm = () => {
    setEditingCategory(null);
    setForm({ ...emptyForm, categoryLibraryId: defaultLibraryId(libraries) });
    setIsFormOpen(true);
  };

  const openEditForm = (category: Category) => {
    setEditingCategory(category);
    setForm(categoryToForm(category));
    setIsFormOpen(true);
  };

  const handleDelete = (category: Category) => {
    if (window.confirm(t("confirm.deleteCategory", { name: category.name }))) {
      deleteMutation.mutate(category.id);
    }
  };

  const handleFile = async (file: File) => {
    setImportFileName(file.name);
    setImportResult(null);
    const text = await file.text();
    setImportRows(parseImportCsv(text));
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void handleFile(file);
    }
  };

  const downloadTemplate = async () => {
    const blob = await apiClient.downloadCategoryTemplate();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "category-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const updatePreviewRow = (id: string, key: keyof CategoryImportRow, value: string, source: "csv" | "ai") => {
    const updateRows = (rows: PreviewRow[]) =>
      rows.map((row) => (row.id === id ? toPreviewRow({ ...row, [key]: value }, id, row.confidence) : row));
    if (source === "csv") {
      setImportRows(updateRows);
    } else {
      setRecognizedRows(updateRows);
    }
  };

  const canSave = Boolean(form.name.trim() && form.categoryLibraryId) && !saveMutation.isPending;
  const isLoading = query.isLoading || librariesQuery.isLoading;
  const isError = query.isError || librariesQuery.isError;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-foreground">{t("page.categories")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("page.categoriesHelp")}</p>
        </div>
        {isSuperAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsBulkOpen(true)}
              disabled={libraries.length === 0}
              className="inline-flex items-center gap-2 rounded-md border border-blue-200 px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground"
            >
              <UploadCloud className="h-4 w-4" />
              {t("categoryImport.bulkImport")}
            </button>
            <button
              type="button"
              onClick={() => setIsAiOpen(true)}
              disabled={libraries.length === 0}
              className="inline-flex items-center gap-2 rounded-md border border-emerald-200 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground"
            >
              <Bot className="h-4 w-4" />
              {t("categoryImport.aiImport")}
            </button>
            <button
              type="button"
              onClick={openCreateForm}
              disabled={libraries.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              <Plus className="h-4 w-4" />
              {t("action.addCategory")}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex min-w-64 flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-ring/40">
            <Search className="h-5 w-5 text-muted-foreground" />
            <span className="sr-only">{t("field.searchCategories")}</span>
            <input
              type="search"
              placeholder={t("field.searchCategories")}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <select
            value={libraryFilter}
            onChange={(event) => setLibraryFilter(event.target.value)}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            aria-label={t("field.categoryLibrary")}
          >
            <option value="">{t("categoryImport.allLibraries")}</option>
            {libraries.map((library) => (
              <option key={library.id} value={library.id}>
                {library.name}
              </option>
            ))}
          </select>
          <select
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value)}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            aria-label={t("categoryImport.levelFilter")}
          >
            <option value="">{t("categoryImport.allLevels")}</option>
            <option value="1">{t("categoryImport.levelNumber", { level: 1 })}</option>
            <option value="2">{t("categoryImport.levelNumber", { level: 2 })}</option>
            <option value="3">{t("categoryImport.levelNumber", { level: 3 })}</option>
          </select>
        </div>
      </div>

      <ApiState
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        emptyLabel={t("state.emptyCategories")}
        onRetry={() => {
          void query.refetch();
          void librariesQuery.refetch();
        }}
      >
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  {[
                    t("categoryImport.categoryName"),
                    t("field.code"),
                    t("categoryImport.level"),
                    t("categoryImport.parentCategory"),
                    t("field.categoryLibrary"),
                    t("field.description"),
                    t("action.operations"),
                  ].map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedCategories.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                          <Inbox className="h-6 w-6" />
                        </div>
                        <p className="text-sm font-medium text-foreground">{t("state.emptyCategories")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t("categoryImport.emptyHint")}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm("");
                            setLibraryFilter("");
                            setLevelFilter("");
                          }}
                          className="mt-4 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
                        >
                          {t("categoryImport.resetFilters")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedCategories.map((category) => {
                    const parent = category.parent_category_id
                      ? categories.find((item) => item.id === category.parent_category_id)
                      : null;
                    return (
                      <tr key={category.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{category.name}</td>
                        <td className="px-4 py-3 font-mono text-sm text-foreground">{category.code}</td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {t("categoryImport.levelNumber", { level: categoryDepth(category, categories) })}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {parent ? categoryPath(parent, categories) : t("categoryImport.noParent")}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">{category.category_library || "-"}</td>
                        <td className="max-w-[260px] px-4 py-3 text-sm text-foreground">
                          <span className="line-clamp-2">{category.description || t("categoryImport.noDescription")}</span>
                        </td>
                        <td className="px-4 py-3">
                          {isSuperAdmin ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => openEditForm(category)}
                                className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                              >
                                <Edit className="h-3.5 w-3.5" />
                                {t("action.edit")}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(category)}
                                disabled={deleteMutation.isPending}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {t("action.delete")}
                              </button>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <div className="text-sm text-muted-foreground">
              {t("categoryImport.paginationSummary", {
                page: currentPage,
                totalPages,
                total: filteredCategories.length,
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("categoryImport.previousPage")}
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("categoryImport.nextPage")}
              </button>
            </div>
          </div>
        </div>
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
              onClick={() => saveMutation.mutate(formToPayload(form))}
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
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("field.code")}</span>
            <input
              type="text"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              placeholder={editingCategory ? "" : t("field.autoGenerated")}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("field.categoryLibrary")}</span>
            <select
              value={form.categoryLibraryId}
              onChange={(event) => setForm((current) => ({ ...current, categoryLibraryId: event.target.value }))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            >
              <option value="">{t("field.selectCategoryLibrary")}</option>
              {libraries.map((library) => (
                <option key={library.id} value={library.id}>
                  {library.name} ({library.code})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("categoryImport.parentCategory")}</span>
            <select
              value={form.parentCategoryId}
              onChange={(event) => setForm((current) => ({ ...current, parentCategoryId: event.target.value }))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            >
              <option value="">{t("categoryImport.noParent")}</option>
              {categories
                .filter(
                  (category) =>
                    String(category.category_library_id ?? "") === form.categoryLibraryId &&
                    (!editingCategory || category.id !== editingCategory.id),
                )
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {categoryPath(category, categories)}
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
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>
      </Modal>

      <Modal
        isOpen={isBulkOpen}
        onClose={() => setIsBulkOpen(false)}
        title={t("categoryImport.bulkImport")}
        size="xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsBulkOpen(false)}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/40"
            >
              {t("action.cancel")}
            </button>
            <button
              type="button"
              onClick={() => importMutation.mutate(previewRowsToImportRows(importRows))}
              disabled={importRows.length === 0 || invalidImportRows.length > 0 || importMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {importMutation.isPending ? t("categoryImport.importing") : t("categoryImport.executeImport")}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="space-y-1 text-sm text-foreground">
              <span>{t("field.categoryLibrary")}</span>
              <select
                value={importLibraryId}
                onChange={(event) => setImportLibraryId(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
              >
                {libraries.map((library) => (
                  <option key={library.id} value={library.id}>
                    {library.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void downloadTemplate()}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
            >
              <Download className="h-4 w-4" />
              {t("categoryImport.downloadTemplate")}
            </button>
          </div>

          <label
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center ${
              isDragging ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-border bg-muted/20 hover:bg-muted/30"
            }`}
          >
            <UploadCloud className="mb-2 h-8 w-8 text-blue-600" />
            <span className="text-sm font-medium text-foreground">{t("categoryImport.dropCsv")}</span>
            <span className="mt-1 text-xs text-muted-foreground">{importFileName || t("categoryImport.csvHint")}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleFile(file);
                }
              }}
            />
          </label>

          <ImportPreviewTable rows={importRows} onChange={(id, key, value) => updatePreviewRow(id, key, value, "csv")} />

          <div className="grid gap-3 md:grid-cols-3">
            <SummaryTile label={t("categoryImport.validRows")} value={importRows.length - invalidImportRows.length} />
            <SummaryTile label={t("categoryImport.invalidRows")} value={invalidImportRows.length} tone="warning" />
            <SummaryTile label={t("categoryImport.resultCounts")} value={resultSummary(importResult) || "-"} />
          </div>

          {importMutation.isPending && (
            <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("categoryImport.processing")}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        title={t("categoryImport.aiImport")}
        size="xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsAiOpen(false)}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/40"
            >
              {t("action.cancel")}
            </button>
            <button
              type="button"
              onClick={() => aiConfirmMutation.mutate(previewRowsToImportRows(recognizedRows))}
              disabled={recognizedRows.length === 0 || invalidRecognizedRows.length > 0 || aiConfirmMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {aiConfirmMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("categoryImport.confirmRecognized")}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("field.categoryLibrary")}</span>
            <select
              value={importLibraryId}
              onChange={(event) => setImportLibraryId(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            >
              {libraries.map((library) => (
                <option key={library.id} value={library.id}>
                  {library.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("categoryImport.aiDescription")}</span>
            <textarea
              ref={aiTextareaRef}
              value={aiText}
              onChange={(event) => setAiText(event.target.value)}
              rows={12}
              placeholder={t("categoryImport.aiPlaceholder")}
              className="max-h-80 w-full resize-y overflow-y-auto rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <button
            type="button"
            onClick={() => aiMutation.mutate()}
            disabled={!aiText.trim() || aiMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {aiMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            {t("categoryImport.sendToAi")}
          </button>
          <ImportPreviewTable rows={recognizedRows} onChange={(id, key, value) => updatePreviewRow(id, key, value, "ai")} showConfidence />
        </div>
      </Modal>
    </div>
  );
}

function SummaryTile({ label, value, tone = "normal" }: { label: string; value: number | string; tone?: "normal" | "warning" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {tone === "warning" ? <AlertCircle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ImportPreviewTable({
  rows,
  onChange,
  showConfidence = false,
}: {
  rows: PreviewRow[];
  onChange: (id: string, key: keyof CategoryImportRow, value: string) => void;
  showConfidence?: boolean;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        <FileText className="mx-auto mb-2 h-6 w-6" />
        {t("categoryImport.previewEmpty")}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/30 text-left text-xs font-medium uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{t("categoryImport.level1")}</th>
            <th className="px-3 py-2">{t("categoryImport.level2")}</th>
            <th className="px-3 py-2">{t("categoryImport.level3")}</th>
            {showConfidence && <th className="px-3 py-2">{t("categoryImport.confidence")}</th>}
            <th className="px-3 py-2">{t("field.status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {rows.map((row) => (
            <tr key={row.id}>
              {(["一级类目", "二级类目", "三级类目"] as const).map((key) => (
                <td key={key} className="px-3 py-2">
                  <input
                    value={row[key] ?? ""}
                    onChange={(event) => onChange(row.id, key, event.target.value)}
                    className={`w-full rounded-md border px-2 py-1 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40 ${
                      row.errors.length > 0 && key === "一级类目"
                        ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30"
                        : "border-border bg-background"
                    }`}
                  />
                </td>
              ))}
              {showConfidence && <td className="px-3 py-2 text-muted-foreground">{row.confidence ?? "-"}</td>}
              <td className="px-3 py-2">
                {row.errors.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <AlertCircle className="h-4 w-4" />
                    {row.errors.map((error) => t(`categoryImport.${error}`)).join(", ")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    {t("categoryImport.valid")}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
