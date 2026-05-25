import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bot,
  ChevronDown,
  ChevronRight,
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
import { CategoryPropertiesPanel } from "./CategoryPropertiesPanel";

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

type CategoryTreeSelection =
  | { type: "library"; id: number }
  | { type: "category"; id: number }
  | null;

const CATEGORY_PAGE_SIZE = 10;
const CATEGORY_LEVEL_KEYS = ["一级类目", "二级类目", "三级类目", "四级类目", "五级类目"] as const;

const emptyForm: CategoryFormState = {
  name: "",
  code: "",
  categoryLibraryId: "",
  parentCategoryId: "",
  description: "",
};

function categoryImportRowFromLevels(levels: string[]): CategoryImportRow {
  return {
    "一级类目": levels[0] ?? "",
    "二级类目": levels[1] ?? "",
    "三级类目": levels[2] ?? "",
    "四级类目": levels[3] ?? "",
    "五级类目": levels[4] ?? "",
  };
}

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
  const levelIndexes = CATEGORY_LEVEL_KEYS.map((key) => header.indexOf(key));
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row = categoryImportRowFromLevels(
      levelIndexes.map((headerIndex) => (headerIndex >= 0 ? values[headerIndex] ?? "" : "")),
    );
    return toPreviewRow(row, `csv-${index + 1}`);
  });
}

function toPreviewRow(row: CategoryImportRow, id: string, confidence?: number): PreviewRow {
  const levels = CATEGORY_LEVEL_KEYS.map((key) => row[key]?.trim() ?? "");
  const errors: string[] = [];
  if (!levels[0]) {
    errors.push("missingLevel1");
  }
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] && levels.slice(0, index).some((level) => !level)) {
      errors.push(index === 2 && !levels[1] ? "missingLevel2" : "missingPreviousLevel");
      break;
    }
  }
  return {
    ...categoryImportRowFromLevels(levels),
    id,
    errors,
    confidence,
  };
}

function previewRowsToImportRows(rows: PreviewRow[]): CategoryImportRow[] {
  return rows.map((row) => categoryImportRowFromLevels(CATEGORY_LEVEL_KEYS.map((key) => row[key] ?? "")));
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

function categoryMatchesLibrary(category: Category, library: CategoryLibrary) {
  return category.category_library_id === library.id || (!category.category_library_id && category.category_library === library.name);
}

function categoryLibraryId(category: Category, libraries: CategoryLibrary[]) {
  if (category.category_library_id) {
    return category.category_library_id;
  }
  return libraries.find((library) => library.name === category.category_library)?.id ?? null;
}

function treeIndentClass(depth: number) {
  if (depth <= 0) {
    return "pl-2";
  }
  if (depth === 1) {
    return "pl-5";
  }
  if (depth === 2) {
    return "pl-8";
  }
  return "pl-11";
}

function resultSummary(result: CategoryBulkImportResult | null) {
  if (!result) {
    return "";
  }
  return `${result.success_count} / ${result.skipped_count} / ${result.error_count}`;
}

function CategoryTreeItem({
  category,
  categories,
  depth,
  selectedTree,
  expandedCategoryIds,
  onToggle,
  onSelect,
}: {
  category: Category;
  categories: Category[];
  depth: number;
  selectedTree: CategoryTreeSelection;
  expandedCategoryIds: number[];
  onToggle: (id: number) => void;
  onSelect: (category: Category) => void;
}) {
  const { t } = useTranslation();
  const childCategories = categories
    .filter((item) => item.parent_category_id === category.id)
    .sort((left, right) => left.name.localeCompare(right.name));
  const hasChildren = childCategories.length > 0;
  const expanded = expandedCategoryIds.includes(category.id);
  const selected = selectedTree?.type === "category" && selectedTree.id === category.id;
  const label = categoryPath(category, categories);

  return (
    <div>
      <button
        type="button"
        aria-expanded={hasChildren ? expanded : undefined}
        aria-label={hasChildren ? t(expanded ? "categoryImport.collapseNode" : "categoryImport.expandNode", { name: category.name }) : category.name}
        onClick={() => {
          if (hasChildren) {
            onToggle(category.id);
          }
          onSelect(category);
        }}
        className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors ${treeIndentClass(depth)} ${
          selected ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-foreground hover:bg-accent"
        }`}
        title={label}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{category.name}</span>
      </button>
      {hasChildren && expanded && (
        <div className="mt-1 space-y-1">
          {childCategories.map((child) => (
            <CategoryTreeItem
              key={child.id}
              category={child}
              categories={categories}
              depth={depth + 1}
              selectedTree={selectedTree}
              expandedCategoryIds={expandedCategoryIds}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryList() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = Boolean(user?.is_super_admin);
  const aiTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTree, setSelectedTree] = useState<CategoryTreeSelection>(null);
  const [expandedLibraryIds, setExpandedLibraryIds] = useState<number[]>([]);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<number[]>([]);
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
  const selectedCategory =
    selectedTree?.type === "category" ? categories.find((category) => category.id === selectedTree.id) ?? null : null;
  const selectedLibrary =
    selectedTree?.type === "library"
      ? libraries.find((library) => library.id === selectedTree.id) ?? null
      : selectedCategory
        ? libraries.find((library) => library.id === categoryLibraryId(selectedCategory, libraries)) ?? null
        : null;
  const tableCategoryParams = useMemo(() => {
    if (selectedTree?.type === "library") {
      return { category_library_id: selectedTree.id, level: 1 };
    }
    if (selectedTree?.type === "category") {
      return { parent_id: selectedTree.id };
    }
    return null;
  }, [selectedTree]);
  const tableQuery = useQuery({
    queryKey: ["categories", "table", tableCategoryParams],
    queryFn: () => apiClient.categoriesByParams(tableCategoryParams ?? {}),
    enabled: tableCategoryParams !== null,
    retry: false,
  });
  const categoryTreeByLibrary = useMemo(
    () =>
      libraries.map((library) => ({
        library,
        categories: categories
          .filter((category) => categoryMatchesLibrary(category, library))
          .sort((left, right) => categoryPath(left, categories).localeCompare(categoryPath(right, categories))),
      })),
    [categories, libraries],
  );
  const invalidImportRows = importRows.filter((row) => row.errors.length > 0);
  const invalidRecognizedRows = recognizedRows.filter((row) => row.errors.length > 0);
  const filteredCategories = useMemo(() => {
    if (!tableCategoryParams) {
      return [];
    }
    const term = searchTerm.trim().toLowerCase();
    return (tableQuery.data ?? [])
      .filter((category) => {
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
  }, [categories, searchTerm, tableCategoryParams, tableQuery.data]);
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
  }, [searchTerm, selectedTree]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (selectedTree?.type === "library" && !libraries.some((library) => library.id === selectedTree.id)) {
      setSelectedTree(null);
    }
    if (selectedTree?.type === "category" && !categories.some((category) => category.id === selectedTree.id)) {
      setSelectedTree(null);
    }
  }, [categories, libraries, selectedTree]);

  const expandCategoryAncestors = (category: Category) => {
    const ancestorIds: number[] = [];
    let parentId = category.parent_category_id;
    while (parentId) {
      const parent = categories.find((item) => item.id === parentId);
      if (!parent) {
        break;
      }
      ancestorIds.push(parent.id);
      parentId = parent.parent_category_id;
    }
    if (ancestorIds.length > 0) {
      setExpandedCategoryIds((current) => Array.from(new Set([...current, ...ancestorIds])));
    }
  };

  const selectLibrary = (library: CategoryLibrary) => {
    setSelectedTree({ type: "library", id: library.id });
  };

  const selectCategory = (category: Category) => {
    const effectiveLibraryId = categoryLibraryId(category, libraries);
    setSelectedTree({ type: "category", id: category.id });
    if (effectiveLibraryId) {
      setExpandedLibraryIds((current) => Array.from(new Set([...current, effectiveLibraryId])));
    }
    expandCategoryAncestors(category);
  };

  const toggleLibrary = (library: CategoryLibrary) => {
    setExpandedLibraryIds((current) =>
      current.includes(library.id) ? current.filter((id) => id !== library.id) : [...current, library.id],
    );
    selectLibrary(library);
  };

  const toggleCategory = (id: number) => {
    setExpandedCategoryIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const expandAllTree = () => {
    setExpandedLibraryIds(libraries.map((library) => library.id));
    setExpandedCategoryIds(categories.filter((category) => categories.some((item) => item.parent_category_id === category.id)).map((category) => category.id));
  };

  const collapseAllTree = () => {
    setExpandedLibraryIds([]);
    setExpandedCategoryIds([]);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: CategoryPayload) =>
      editingCategory ? apiClient.updateCategory(editingCategory.id, payload) : apiClient.createCategory(payload),
    onSuccess: async (savedCategory) => {
      setIsFormOpen(false);
      setEditingCategory(null);
      setForm(emptyForm);
      selectCategory(savedCategory);
      toast.success(t("toast.saveSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toast.error(`${t("toast.saveFailed")}: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteCategory(id),
    onSuccess: async (_result, deletedId) => {
      if (selectedTree?.type === "category" && selectedTree.id === deletedId) {
        setSelectedTree(null);
      }
      setExpandedCategoryIds((current) => current.filter((id) => id !== deletedId));
      toast.success(t("toast.deleteSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toast.error(`${t("toast.deleteFailed")}: ${error.message}`),
  });

  const importMutation = useMutation({
    mutationFn: (rows: CategoryImportRow[]) => apiClient.bulkImportCategories(Number(importLibraryId), rows),
    onSuccess: async (result) => {
      setImportResult(result);
      setExpandedLibraryIds((current) => Array.from(new Set([...current, Number(importLibraryId)])));
      setSelectedTree({ type: "library", id: Number(importLibraryId) });
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
            "四级类目": item.level4 ?? "",
            "五级类目": item.level5 ?? "",
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
      setExpandedLibraryIds((current) => Array.from(new Set([...current, Number(importLibraryId)])));
      setSelectedTree({ type: "library", id: Number(importLibraryId) });
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
  const isTableLoading = isLoading || (tableCategoryParams !== null && tableQuery.isLoading);
  const isTableError = isError || (tableCategoryParams !== null && tableQuery.isError);
  const emptyCategoryTitle = tableCategoryParams ? t("state.emptyCategories") : t("categoryImport.emptySelectionTitle");
  const emptyCategoryHint = tableCategoryParams ? t("categoryImport.emptyHint") : t("categoryImport.emptySelectionHint");
  const selectedContext = selectedCategory
    ? t("categoryImport.selectedCategory", { path: categoryPath(selectedCategory, categories) })
    : selectedLibrary
      ? t("categoryImport.selectedLibrary", { name: selectedLibrary.name })
      : t("categoryImport.noSelection");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-6">
      <aside className="max-h-[36vh] min-h-0 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-sm lg:max-h-none lg:w-72 lg:shrink-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">{t("categoryImport.treeTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{selectedContext}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedTree(null);
            }}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/40"
          >
            {t("categoryImport.clearSelection")}
          </button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={expandAllTree}
            className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/40"
          >
            {t("categoryImport.expandAll")}
          </button>
          <button
            type="button"
            onClick={collapseAllTree}
            className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/40"
          >
            {t("categoryImport.collapseAll")}
          </button>
        </div>
        <ApiState
          isLoading={isLoading}
          isError={isError}
          isEmpty={!isLoading && !isError && libraries.length === 0}
          emptyLabel={t("categoryImport.treeEmpty")}
          onRetry={() => {
            void query.refetch();
            void librariesQuery.refetch();
          }}
        >
          <div className="space-y-1">
            {categoryTreeByLibrary.map(({ library, categories: libraryCategories }) => {
              const expanded = expandedLibraryIds.includes(library.id);
              const selected = selectedTree?.type === "library" && selectedTree.id === library.id;
              const rootCategories = libraryCategories.filter((category) => !category.parent_category_id);
              return (
                <div key={library.id}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={t(expanded ? "categoryImport.collapseNode" : "categoryImport.expandNode", { name: library.name })}
                    onClick={() => toggleLibrary(library)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      selected ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <span className="truncate">{library.name}</span>
                    {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  </button>
                  {expanded && (
                    <div className="mt-1 space-y-1">
                      {rootCategories.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">{t("categoryImport.treeLibraryEmpty")}</p>
                      ) : (
                        rootCategories.map((category) => (
                          <CategoryTreeItem
                            key={category.id}
                            category={category}
                            categories={libraryCategories}
                            depth={0}
                            selectedTree={selectedTree}
                            expandedCategoryIds={expandedCategoryIds}
                            onToggle={toggleCategory}
                            onSelect={selectCategory}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ApiState>
        <CategoryPropertiesPanel selectedCategory={selectedCategory} isSuperAdmin={isSuperAdmin} />
      </aside>

      <main className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto pr-1">
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
        </div>
      </div>

      <ApiState
        isLoading={isTableLoading}
        isError={isTableError}
        isEmpty={false}
        emptyLabel={emptyCategoryTitle}
        onRetry={() => {
          void query.refetch();
          void librariesQuery.refetch();
          void tableQuery.refetch();
        }}
      >
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  {[
                    t("categoryImport.categoryName"),
                    t("field.code"),
                    t("categoryImport.parentCategory"),
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
                    <td colSpan={5} className="px-4 py-14 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                          <Inbox className="h-6 w-6" />
                        </div>
                        <p className="text-sm font-medium text-foreground">{emptyCategoryTitle}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{emptyCategoryHint}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm("");
                            setSelectedTree(null);
                          }}
                          className="mt-4 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
                        >
                          {tableCategoryParams ? t("categoryImport.resetFilters") : t("categoryImport.clearSelection")}
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
                          {parent ? categoryPath(parent, categories) : t("categoryImport.noParent")}
                        </td>
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
      </main>
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
            {CATEGORY_LEVEL_KEYS.map((key, index) => (
              <th key={key} className="px-3 py-2">{t(`categoryImport.level${index + 1}`)}</th>
            ))}
            {showConfidence && <th className="px-3 py-2">{t("categoryImport.confidence")}</th>}
            <th className="px-3 py-2">{t("field.status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {rows.map((row) => (
            <tr key={row.id}>
              {CATEGORY_LEVEL_KEYS.map((key) => (
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
