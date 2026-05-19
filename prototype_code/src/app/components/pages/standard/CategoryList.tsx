import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Edit,
  FileText,
  Loader2,
  Plus,
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
import { SearchPanel } from "./standardPageUtils";

type CategoryFormState = {
  name: string;
  code: string;
  categoryLibraryId: string;
  parentCategoryId: string;
  description: string;
};

type CategoryTreeNode = Category & {
  children: CategoryTreeNode[];
};

type PreviewRow = CategoryImportRow & {
  id: string;
  errors: string[];
  confidence?: number;
};

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

function buildCategoryTree(categories: Category[], searchTerm: string): CategoryTreeNode[] {
  const term = searchTerm.trim().toLowerCase();
  const nodes = new Map<number, CategoryTreeNode>();
  categories.forEach((category) => {
    nodes.set(category.id, { ...category, children: [] });
  });
  const roots: CategoryTreeNode[] = [];
  nodes.forEach((node) => {
    const parent = node.parent_category_id ? nodes.get(node.parent_category_id) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortTree = (items: CategoryTreeNode[]) => {
    items.sort((left, right) => left.name.localeCompare(right.name));
    items.forEach((item) => sortTree(item.children));
  };
  sortTree(roots);
  if (!term) {
    return roots;
  }
  const filterTree = (node: CategoryTreeNode): CategoryTreeNode | null => {
    const filteredChildren = node.children.map(filterTree).filter(Boolean) as CategoryTreeNode[];
    const matched = [node.name, node.code, node.description, node.category_library].some((value) =>
      value.toLowerCase().includes(term),
    );
    return matched || filteredChildren.length > 0 ? { ...node, children: filteredChildren } : null;
  };
  return roots.map(filterTree).filter(Boolean) as CategoryTreeNode[];
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

function resultSummary(result: CategoryBulkImportResult | null) {
  if (!result) {
    return "";
  }
  return `${result.success_count} / ${result.skipped_count} / ${result.error_count}`;
}

function depthPaddingClass(depth: number) {
  const classes = ["pl-3", "pl-9", "pl-16", "pl-24"];
  return classes[Math.min(depth, classes.length - 1)];
}

export function CategoryList() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = Boolean(user?.is_super_admin);
  const aiTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
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
  const tree = useMemo(() => buildCategoryTree(categories, searchTerm), [categories, searchTerm]);
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const invalidImportRows = importRows.filter((row) => row.errors.length > 0);
  const invalidRecognizedRows = recognizedRows.filter((row) => row.errors.length > 0);

  useEffect(() => {
    if (!importLibraryId && libraries.length > 0) {
      setImportLibraryId(String(libraries[0].id));
    }
  }, [importLibraryId, libraries]);

  useEffect(() => {
    if (isAiOpen) {
      window.setTimeout(() => aiTextareaRef.current?.focus(), 0);
    }
  }, [isAiOpen]);

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

  const toggleExpanded = (id: number) => {
    setExpandedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
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

  const expandAll = () => setExpandedIds(categories.map((category) => category.id));
  const collapseAll = () => setExpandedIds([]);
  const canSave = Boolean(form.name.trim() && form.categoryLibraryId) && !saveMutation.isPending;
  const isLoading = query.isLoading || librariesQuery.isLoading;
  const isError = query.isError || librariesQuery.isError;

  const renderTreeNode = (node: CategoryTreeNode, depth = 0) => {
    const expanded = searchTerm.trim() ? true : expandedIds.includes(node.id);
    const selected = selectedCategoryId === node.id;
    return (
      <div key={node.id} role="treeitem" aria-expanded={node.children.length ? expanded : undefined}>
        <div
          className={`flex min-h-10 items-center gap-2 border-b border-border py-2 pr-3 text-sm ${depthPaddingClass(depth)} ${
            selected ? "bg-blue-50 text-blue-700" : "bg-card text-foreground hover:bg-muted/40"
          }`}
        >
          <button
            type="button"
            onClick={() => toggleExpanded(node.id)}
            aria-label={expanded ? t("categoryImport.collapse") : t("categoryImport.expand")}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            {node.children.length > 0 ? (
              expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="h-4 w-4" />
            )}
          </button>
          <button type="button" onClick={() => setSelectedCategoryId(node.id)} className="min-w-0 flex-1 text-left">
            <span className="font-medium">{node.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">{node.code}</span>
          </button>
          <span className="hidden text-xs text-muted-foreground md:inline">{node.category_library}</span>
          {isSuperAdmin && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => openEditForm(node)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50"
                aria-label={t("action.edit")}
              >
                <Edit className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(node)}
                disabled={deleteMutation.isPending}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={t("action.delete")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {expanded && node.children.map((child) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

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

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-72 flex-1">
          <SearchPanel value={searchTerm} onChange={setSearchTerm} placeholder={t("field.searchCategories")} />
        </div>
        <button
          type="button"
          onClick={expandAll}
          className="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
        >
          {t("categoryImport.expandAll")}
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
        >
          {t("categoryImport.collapseAll")}
        </button>
      </div>

      <ApiState
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && !isError && tree.length === 0}
        emptyLabel={t("state.emptyCategories")}
        onRetry={() => {
          void query.refetch();
          void librariesQuery.refetch();
        }}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm" role="tree">
            <div className="grid grid-cols-[1fr_auto] border-b border-border bg-muted/30 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
              <span>{t("categoryImport.treeTitle")}</span>
              <span>{t("categoryImport.recordCount", { count: categories.length })}</span>
            </div>
            <div>{tree.map((node) => renderTreeNode(node))}</div>
          </div>

          <aside className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">{t("categoryImport.selectedContext")}</h2>
            {selectedCategory ? (
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t("field.category")}</dt>
                  <dd className="mt-1 font-medium text-foreground">{categoryPath(selectedCategory, categories)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("field.code")}</dt>
                  <dd className="mt-1 text-foreground">{selectedCategory.code}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("field.categoryLibrary")}</dt>
                  <dd className="mt-1 text-foreground">{selectedCategory.category_library}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("field.description")}</dt>
                  <dd className="mt-1 text-foreground">{selectedCategory.description || t("categoryImport.noDescription")}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">{t("categoryImport.noSelection")}</p>
            )}
          </aside>
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
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("field.categoryLibrary")}</span>
            <select
              value={form.categoryLibraryId}
              onChange={(event) => setForm((current) => ({ ...current, categoryLibraryId: event.target.value }))}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
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
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
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
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
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
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
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
              isDragging ? "border-blue-500 bg-blue-50" : "border-border bg-muted/20 hover:bg-muted/30"
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
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
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
              className="max-h-80 w-full resize-y overflow-y-auto rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
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
                    className={`w-full rounded-md border px-2 py-1 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40 ${
                      row.errors.length > 0 && key === "一级类目" ? "border-amber-300 bg-amber-50" : "border-border"
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
