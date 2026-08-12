import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type UIEvent } from "react";
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
  Lock,
  Plus,
  Search,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  apiClient,
  type Category,
  type CategoryBulkImportResult,
  type CategoryImportRow,
  type CategoryListParams,
  type CategoryLibrary,
  type CategoryPayload,
} from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { ApiState } from "../../common/ApiState";
import { Modal } from "../../common/Modal";
import { SearchableSelect } from "../../common/SearchableSelect";
import { CategoryPropertiesPanel } from "./CategoryPropertiesPanel";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
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
  maxLevel?: number;
};

type CategoryTreeSelection =
  | { type: "library"; id: number }
  | { type: "category"; id: number }
  | null;

const CATEGORY_PAGE_SIZE = 10;
const CATEGORY_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const CATEGORY_TREE_BATCH_SIZE = 200;
const CATEGORY_TREE_FULL_BATCH_SIZE = 1000;
const CATEGORY_TREE_WINDOW_SIZE = 240;
const CATEGORY_LEVEL_KEYS = ["一级类目", "二级类目", "三级类目", "四级类目", "五级类目"] as const;
const CATEGORY_IMPORT_ACCEPT = ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

function categoryChildrenKey(parentId: number) {
  return ["categories", "children", parentId] as const;
}

function categoryLibraryRootsKey(libraryId: number) {
  return ["categories", "library-roots", libraryId] as const;
}

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

function isCsvImportFile(file: File) {
  return file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
}

function isSpreadsheetImportFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  );
}

function toPreviewRow(row: CategoryImportRow, id: string, confidence?: number, maxLevel?: number): PreviewRow {
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
    maxLevel,
  };
}

function previewRowsToImportRows(rows: PreviewRow[]): CategoryImportRow[] {
  return rows.map((row) => categoryImportRowFromLevels(CATEGORY_LEVEL_KEYS.map((key) => row[key] ?? "")));
}

function categoryPathMap(categories: Category[]) {
  const byId = new Map(categories.map((item) => [item.id, item]));
  const pathById = new Map<number, string>();
  const resolvePath = (category: Category, seen = new Set<number>()): string => {
    const cached = pathById.get(category.id);
    if (cached) {
      return cached;
    }
    if (seen.has(category.id)) {
      return category.name;
    }
    seen.add(category.id);
    const parent = category.parent_category_id ? byId.get(category.parent_category_id) : null;
    const path = parent ? `${resolvePath(parent, seen)} / ${category.name}` : category.name;
    pathById.set(category.id, path);
    return path;
  };
  categories.forEach((category) => resolvePath(category));
  return pathById;
}

function categoryLibraryId(category: Category, libraries: CategoryLibrary[]) {
  if (category.category_library_id) {
    return category.category_library_id;
  }
  return libraries.find((library) => library.name === category.category_library)?.id ?? null;
}

function treeIndentClass(depth: number) {
  if (depth <= 0) {
    return "pl-8";
  }
  if (depth === 1) {
    return "pl-11";
  }
  if (depth === 2) {
    return "pl-14";
  }
  return "pl-17";
}

function resultSummary(result: CategoryBulkImportResult | null) {
  if (!result) {
    return "";
  }
  return `${result.success_count} / ${result.skipped_count} / ${result.error_count}`;
}

type CategoryTreeRow =
  | {
      type: "library";
      id: string;
      library: CategoryLibrary;
      expanded: boolean;
      selected: boolean;
      loading: boolean;
      rootsLoaded: boolean;
    }
  | {
      type: "category";
      id: string;
      category: Category;
      parentId: number | null;
      depth: number;
      expanded: boolean;
      selected: boolean;
      loading: boolean;
      childrenLoaded: boolean;
      hasLoadedChildren: boolean;
      path: string;
    }
  | {
      type: "load-more-roots";
      id: string;
      libraryId: number;
      depth: number;
      loading: boolean;
    }
  | {
      type: "load-more-children";
      id: string;
      parentId: number;
      depth: number;
      loading: boolean;
    };

const VirtualizedCategoryTree = memo(function VirtualizedCategoryTree({
  rows,
  onToggleLibrary,
  onToggleCategory,
  onSelectCategory,
  onLoadMoreRoots,
  onLoadMoreChildren,
}: {
  rows: CategoryTreeRow[];
  onToggleLibrary: (library: CategoryLibrary) => void;
  onToggleCategory: (category: Category, childrenLoaded: boolean, hasLoadedChildren: boolean) => void;
  onSelectCategory: (category: Category) => void;
  onLoadMoreRoots: (libraryId: number) => void;
  onLoadMoreChildren: (parentId: number) => void;
}) {
  const { t } = useTranslation();
  const [windowStart, setWindowStart] = useState(0);
  const visibleRows = useMemo(
    () => rows.slice(windowStart, Math.min(rows.length, windowStart + CATEGORY_TREE_WINDOW_SIZE)),
    [rows, windowStart],
  );

  useEffect(() => {
    setWindowStart((current) => Math.min(current, Math.max(0, rows.length - CATEGORY_TREE_WINDOW_SIZE)));
  }, [rows.length]);

  // When a node is expanded (or selected), its row is marked `selected`. If that row
  // falls outside the currently rendered window, the freshly loaded children appended
  // right after it in the flattened list would otherwise be silently clipped from view
  // until the user manually scrolls. Bring the acted-on row into the visible window.
  useEffect(() => {
    if (rows.length <= CATEGORY_TREE_WINDOW_SIZE) {
      return;
    }
    const selectedIndex = rows.findIndex((row) => "selected" in row && row.selected);
    if (selectedIndex < 0) {
      return;
    }
    setWindowStart((current) => {
      if (selectedIndex >= current && selectedIndex < current + CATEGORY_TREE_WINDOW_SIZE) {
        return current;
      }
      return Math.max(0, Math.min(rows.length - CATEGORY_TREE_WINDOW_SIZE, selectedIndex));
    });
  }, [rows]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (rows.length <= CATEGORY_TREE_WINDOW_SIZE) {
      return;
    }
    const viewport = event.currentTarget;
    const step = Math.floor(CATEGORY_TREE_WINDOW_SIZE / 2);
    if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 16) {
      setWindowStart((current) => Math.min(rows.length - CATEGORY_TREE_WINDOW_SIZE, current + step));
      viewport.scrollTop = Math.floor(viewport.clientHeight / 2);
    } else if (viewport.scrollTop <= 8) {
      setWindowStart((current) => Math.max(0, current - step));
      viewport.scrollTop = Math.floor(viewport.clientHeight / 2);
    }
  };

  return (
    <div
      data-testid="category-tree-virtualized"
      data-total-rows={rows.length}
      data-rendered-rows={visibleRows.length}
      className="max-h-[calc(36vh-8rem)] min-h-56 overflow-y-auto lg:max-h-[calc(100vh-15rem)]"
      onScroll={handleScroll}
    >
      <div className="space-y-1" aria-rowcount={rows.length}>
        {windowStart > 0 && (
          <div className="px-3 py-1 text-center text-[11px] text-muted-foreground" aria-hidden="true">
            {windowStart} / {rows.length}
          </div>
        )}
        {visibleRows.map((row) => {
          if (row.type === "library") {
            return (
              <button
                key={row.id}
                type="button"
                aria-expanded={row.expanded}
                aria-label={t(row.expanded ? "categoryImport.collapseNode" : "categoryImport.expandNode", { name: row.library.name })}
                data-testid="category-tree-row"
                data-node-type="library"
                onClick={() => onToggleLibrary(row.library)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  row.selected ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-foreground hover:bg-accent"
                }`}
              >
                {row.loading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : row.expanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">{row.library.name}</span>
              </button>
            );
          }

          if (row.type === "load-more-roots") {
            return (
              <button
                key={row.id}
                type="button"
                data-testid="category-tree-row"
                data-node-type="load-more"
                onClick={() => onLoadMoreRoots(row.libraryId)}
                disabled={row.loading}
                className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent disabled:cursor-wait ${treeIndentClass(row.depth)}`}
              >
                {row.loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <span className="h-3.5 w-3.5 shrink-0" />}
                <span>{t("categoryImport.loadMore")}</span>
              </button>
            );
          }

          if (row.type === "load-more-children") {
            return (
              <button
                key={row.id}
                type="button"
                data-testid="category-tree-row"
                data-node-type="load-more"
                data-parent-id={row.parentId}
                onClick={() => onLoadMoreChildren(row.parentId)}
                disabled={row.loading}
                className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent disabled:cursor-wait ${treeIndentClass(row.depth)}`}
              >
                {row.loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <span className="h-3.5 w-3.5 shrink-0" />}
                <span>{t("categoryImport.loadMore")}</span>
              </button>
            );
          }

          const hasChildren = !row.childrenLoaded || row.hasLoadedChildren;
          return (
            <button
              key={row.id}
              type="button"
              aria-expanded={hasChildren ? row.expanded : undefined}
              aria-label={hasChildren ? t(row.expanded ? "categoryImport.collapseNode" : "categoryImport.expandNode", { name: row.category.name }) : row.category.name}
              data-testid="category-tree-node"
              data-node-type="category"
              data-parent-id={row.parentId ?? undefined}
              onClick={() => onToggleCategory(row.category, row.childrenLoaded, row.hasLoadedChildren)}
              onDoubleClick={() => onSelectCategory(row.category)}
              className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors ${treeIndentClass(row.depth)} ${
                row.selected ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-foreground hover:bg-accent"
              }`}
              title={row.path}
            >
              {row.loading ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : hasChildren ? (
                row.expanded ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                )
              ) : (
                <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{row.category.name}</span>
            </button>
          );
        })}
        {windowStart + visibleRows.length < rows.length && (
          <div className="px-3 py-1 text-center text-[11px] text-muted-foreground" aria-hidden="true">
            {windowStart + visibleRows.length} / {rows.length}
          </div>
        )}
      </div>
    </div>
  );
});

function flattenCategoryRows({
  categories,
  childrenByParentId,
  pathById,
  expandedCategoryIds,
  selectedTree,
  loadingCategoryIds,
  childParentsWithMore,
}: {
  categories: Category[];
  childrenByParentId: Map<number, Category[]>;
  pathById: Map<number, string>;
  expandedCategoryIds: number[];
  selectedTree: CategoryTreeSelection;
  loadingCategoryIds: number[];
  childParentsWithMore: number[];
}) {
  const rows: CategoryTreeRow[] = [];
  const appendCategory = (category: Category, parentId: number | null, depth: number) => {
    const children = childrenByParentId.get(category.id);
    const expanded = expandedCategoryIds.includes(category.id);
    rows.push({
      type: "category",
      id: `category-${category.id}`,
      category,
      parentId,
      depth,
      expanded,
      selected: selectedTree?.type === "category" && selectedTree.id === category.id,
      loading: loadingCategoryIds.includes(category.id),
      childrenLoaded: children !== undefined,
      hasLoadedChildren: Boolean(children?.length),
      path: pathById.get(category.id) ?? category.name,
    });
    if (!expanded || !children) {
      return;
    }
    children
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((child) => appendCategory(child, category.id, depth + 1));
    if (childParentsWithMore.includes(category.id)) {
      rows.push({
        type: "load-more-children",
        id: `load-more-children-${category.id}`,
        parentId: category.id,
        depth: depth + 1,
        loading: loadingCategoryIds.includes(category.id),
      });
    }
  };

  categories
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((category) => appendCategory(category, null, 1));
  return rows;
}

export function CategoryList() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = Boolean(user?.is_super_admin);
  const canManageAttributes = Boolean(
    isSuperAdmin ||
      user?.username === "super_admin" ||
      user?.roles?.some((role) => role.code === "super_admin" || role.name === "超级管理员" || role.name === "Super Admin"),
  );
  const aiTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const categoryRequestsRef = useRef(new Map<string, Promise<Category[]>>());
  const fetchCategoriesOnce = useCallback((key: string, params: CategoryListParams) => {
    const activeRequest = categoryRequestsRef.current.get(key);
    if (activeRequest) {
      return activeRequest;
    }
    const request = apiClient.categoriesByParams(params).finally(() => {
      if (categoryRequestsRef.current.get(key) === request) {
        categoryRequestsRef.current.delete(key);
      }
    });
    categoryRequestsRef.current.set(key, request);
    return request;
  }, []);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTree, setSelectedTree] = useState<CategoryTreeSelection>(null);
  const [expandedLibraryIds, setExpandedLibraryIds] = useState<number[]>([]);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryPageSize, setCategoryPageSize] = useState<number>(CATEGORY_PAGE_SIZE);
  const [form, setForm] = useState<CategoryFormState>(emptyForm);
  const [parentCategoryLocked, setParentCategoryLocked] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isAttributeImportOpen, setIsAttributeImportOpen] = useState(false);
  const [importLibraryId, setImportLibraryId] = useState("");
  const [importRows, setImportRows] = useState<PreviewRow[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importResult, setImportResult] = useState<CategoryBulkImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [aiText, setAiText] = useState("");
  const [recognizedRows, setRecognizedRows] = useState<PreviewRow[]>([]);
  const [loadingDot, setLoadingDot] = useState(0);
  const [loadedRootLibraryIds, setLoadedRootLibraryIds] = useState<number[]>([]);
  const [loadingLibraryIds, setLoadingLibraryIds] = useState<number[]>([]);
  const [rootLibrariesWithMore, setRootLibrariesWithMore] = useState<number[]>([]);
  const [loadedChildParentIds, setLoadedChildParentIds] = useState<number[]>([]);
  const [loadingCategoryIds, setLoadingCategoryIds] = useState<number[]>([]);
  const [childParentsWithMore, setChildParentsWithMore] = useState<number[]>([]);
  const [categoryCacheVersion, setCategoryCacheVersion] = useState(0);
  const [isExpandingAll, setIsExpandingAll] = useState(false);

  const query = useQuery({
    queryKey: ["categories"],
    queryFn: () =>
      fetchCategoriesOnce("roots:all:0", { level: 1, limit: CATEGORY_TREE_BATCH_SIZE, offset: 0 }),
    retry: false,
  });

  const librariesQuery = useQuery({
    queryKey: ["category-libraries"],
    queryFn: apiClient.categoryLibraries,
    retry: false,
  });

  const allCategories = query.data ?? [];
  const libraries = librariesQuery.data ?? [];
  const enabledLibraries = useMemo(() => libraries.filter((library) => library.enabled), [libraries]);
  const enabledLibraryIds = useMemo(() => new Set(enabledLibraries.map((library) => library.id)), [enabledLibraries]);
  const categories = useMemo(
    () => allCategories.filter((category) => category.category_library_id === null || enabledLibraryIds.has(category.category_library_id)),
    [allCategories, enabledLibraryIds],
  );
  const rootCategoriesByLibraryId = useMemo(() => {
    const rootMap = new Map<number, Category[]>();
    loadedRootLibraryIds.forEach((libraryId) => {
      const cachedRoots = queryClient.getQueryData<Category[]>(categoryLibraryRootsKey(libraryId));
      if (cachedRoots) {
        rootMap.set(libraryId, cachedRoots);
      }
    });
    return rootMap;
  }, [categoryCacheVersion, loadedRootLibraryIds, queryClient]);
  const childrenByParentId = useMemo(() => {
    const childMap = new Map<number, Category[]>();
    loadedChildParentIds.forEach((parentId) => {
      const cachedChildren = queryClient.getQueryData<Category[]>(categoryChildrenKey(parentId));
      if (cachedChildren) {
        childMap.set(parentId, cachedChildren);
      }
    });
    return childMap;
  }, [categoryCacheVersion, loadedChildParentIds, queryClient]);
  const knownCategories = useMemo(() => {
    const byId = new Map<number, Category>();
    categories.forEach((category) => byId.set(category.id, category));
    rootCategoriesByLibraryId.forEach((rootCategories) => {
      rootCategories.forEach((category) => byId.set(category.id, category));
    });
    childrenByParentId.forEach((childCategories) => {
      childCategories.forEach((category) => byId.set(category.id, category));
    });
    return Array.from(byId.values());
  }, [categories, childrenByParentId, rootCategoriesByLibraryId]);
  const pathByCategoryId = useMemo(() => categoryPathMap(knownCategories), [knownCategories]);
  const selectedCategory =
    selectedTree?.type === "category" ? knownCategories.find((category) => category.id === selectedTree.id) ?? null : null;
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
    return { level: 1 };
  }, [selectedTree]);
  const isRootTable = selectedTree === null;
  const tableQuery = useQuery({
    queryKey: ["categories", "table", tableCategoryParams],
    queryFn: () => {
      const params = { ...(tableCategoryParams ?? {}), limit: CATEGORY_TREE_BATCH_SIZE, offset: 0 };
      const requestKey = selectedTree?.type === "library"
        ? `roots:library:${selectedTree.id}:0`
        : selectedTree?.type === "category"
          ? `children:${selectedTree.id}:0`
          : "roots:all:0";
      return fetchCategoriesOnce(requestKey, params);
    },
    enabled: !isRootTable,
    retry: false,
  });
  const tableCategories = isRootTable ? categories : tableQuery.data ?? [];
  const invalidImportRows = importRows.filter((row) => row.errors.length > 0);
  const invalidRecognizedRows = recognizedRows.filter((row) => row.errors.length > 0);
  const filteredCategories = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return tableCategories
      .filter((category) => {
        if (!term) {
          return true;
        }
        return [
          category.name,
          category.code,
          category.description,
          category.category_library,
          pathByCategoryId.get(category.id) ?? category.name,
        ].some((value) => value.toLowerCase().includes(term));
      })
      .sort((left, right) => (pathByCategoryId.get(left.id) ?? left.name).localeCompare(pathByCategoryId.get(right.id) ?? right.name));
  }, [pathByCategoryId, searchTerm, tableCategories]);
  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / categoryPageSize));
  const paginatedCategories = filteredCategories.slice(
    (currentPage - 1) * categoryPageSize,
    currentPage * categoryPageSize,
  );

  useEffect(() => {
    const firstLibrary = enabledLibraries[0];
    if (!importLibraryId && firstLibrary) {
      setImportLibraryId(String(firstLibrary.id));
    }
  }, [importLibraryId, enabledLibraries]);

  useEffect(() => {
    if (isAiOpen) {
      window.setTimeout(() => aiTextareaRef.current?.focus(), 0);
    }
  }, [isAiOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTree, categoryPageSize]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (selectedTree?.type === "library" && !enabledLibraries.some((library) => library.id === selectedTree.id)) {
      setSelectedTree(null);
    }
    if (selectedTree?.type === "category" && !knownCategories.some((category) => category.id === selectedTree.id)) {
      setSelectedTree(null);
    }
  }, [knownCategories, enabledLibraries, selectedTree]);

  const expandCategoryAncestors = (category: Category) => {
    const ancestorIds: number[] = [];
    let parentId = category.parent_category_id;
    while (parentId) {
      const parent = knownCategories.find((item) => item.id === parentId);
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

  const clearCategoryChildrenCache = () => {
    queryClient.removeQueries({ queryKey: ["categories", "library-roots"] });
    queryClient.removeQueries({ queryKey: ["categories", "children"] });
    setLoadedRootLibraryIds([]);
    setLoadingLibraryIds([]);
    setRootLibrariesWithMore([]);
    setLoadedChildParentIds([]);
    setLoadingCategoryIds([]);
    setChildParentsWithMore([]);
    setCategoryCacheVersion((version) => version + 1);
  };

  const mergeCategoryBatch = (current: Category[] | undefined, nextBatch: Category[]) => {
    const byId = new Map((current ?? []).map((category) => [category.id, category]));
    nextBatch.forEach((category) => byId.set(category.id, category));
    return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
  };

  const loadLibraryRoots = useCallback(
    async (libraryId: number, offset?: number) => {
      const cachedRoots = queryClient.getQueryData<Category[]>(categoryLibraryRootsKey(libraryId)) ?? [];
      const nextOffset = offset ?? cachedRoots.length;
      if (cachedRoots.length > 0 && nextOffset === 0) {
        return cachedRoots;
      }
      setLoadingLibraryIds((current) => Array.from(new Set([...current, libraryId])));
      try {
        const rootCategories = await fetchCategoriesOnce(`roots:library:${libraryId}:${nextOffset}`, {
          category_library_id: libraryId,
          level: 1,
          limit: CATEGORY_TREE_BATCH_SIZE,
          offset: nextOffset,
        });
        const mergedRoots = mergeCategoryBatch(nextOffset === 0 ? [] : cachedRoots, rootCategories);
        queryClient.setQueryData(categoryLibraryRootsKey(libraryId), mergedRoots);
        setCategoryCacheVersion((version) => version + 1);
        setLoadedRootLibraryIds((current) => Array.from(new Set([...current, libraryId])));
        setRootLibrariesWithMore((current) =>
          rootCategories.length === CATEGORY_TREE_BATCH_SIZE
            ? Array.from(new Set([...current, libraryId]))
            : current.filter((id) => id !== libraryId),
        );
        return mergedRoots;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        return cachedRoots;
      } finally {
        setLoadingLibraryIds((current) => current.filter((id) => id !== libraryId));
      }
    },
    [fetchCategoriesOnce, queryClient],
  );

  const loadChildren = useCallback(
    async (parentId: number, offset?: number) => {
      const cachedChildren = queryClient.getQueryData<Category[]>(categoryChildrenKey(parentId)) ?? [];
      const nextOffset = offset ?? cachedChildren.length;
      if (cachedChildren.length > 0 && nextOffset === 0) {
        return cachedChildren;
      }
      setLoadingCategoryIds((current) => Array.from(new Set([...current, parentId])));
      try {
        const childCategories = await fetchCategoriesOnce(`children:${parentId}:${nextOffset}`, {
          parent_id: parentId,
          limit: CATEGORY_TREE_BATCH_SIZE,
          offset: nextOffset,
        });
        const mergedChildren = mergeCategoryBatch(nextOffset === 0 ? [] : cachedChildren, childCategories);
        queryClient.setQueryData(categoryChildrenKey(parentId), mergedChildren);
        setCategoryCacheVersion((version) => version + 1);
        setLoadedChildParentIds((current) => Array.from(new Set([...current, parentId])));
        setChildParentsWithMore((current) =>
          childCategories.length === CATEGORY_TREE_BATCH_SIZE
            ? Array.from(new Set([...current, parentId]))
            : current.filter((id) => id !== parentId),
        );
        return mergedChildren;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        return cachedChildren;
      } finally {
        setLoadingCategoryIds((current) => current.filter((id) => id !== parentId));
      }
    },
    [fetchCategoriesOnce, queryClient],
  );

  const loadMoreLibraryRoots = useCallback(
    (libraryId: number) => {
      const cachedRoots = queryClient.getQueryData<Category[]>(categoryLibraryRootsKey(libraryId)) ?? [];
      void loadLibraryRoots(libraryId, cachedRoots.length);
    },
    [loadLibraryRoots, queryClient],
  );

  const loadMoreChildren = useCallback(
    (parentId: number) => {
      const cachedChildren = queryClient.getQueryData<Category[]>(categoryChildrenKey(parentId)) ?? [];
      void loadChildren(parentId, cachedChildren.length);
    },
    [loadChildren, queryClient],
  );

  const ensureLibraryRoots = useCallback(
    async (libraryId: number) => {
      const cachedRoots = queryClient.getQueryData<Category[]>(categoryLibraryRootsKey(libraryId));
      if (cachedRoots) {
        return cachedRoots;
      }
      return loadLibraryRoots(libraryId, 0);
    },
    [loadLibraryRoots, queryClient],
  );

  const loadEntireLibraryTree = useCallback(
    async (libraryId: number) => {
      const allCategories: Category[] = [];
      let offset = 0;
      while (true) {
        const batch = await fetchCategoriesOnce(`all:library:${libraryId}:${offset}`, {
          category_library_id: libraryId,
          limit: CATEGORY_TREE_FULL_BATCH_SIZE,
          offset,
        });
        allCategories.push(...batch);
        if (batch.length < CATEGORY_TREE_FULL_BATCH_SIZE) {
          break;
        }
        offset += batch.length;
      }

      const roots: Category[] = [];
      const groupedChildren = new Map<number, Category[]>();
      allCategories.forEach((category) => {
        if (category.parent_category_id === null) {
          roots.push(category);
          return;
        }
        const children = groupedChildren.get(category.parent_category_id) ?? [];
        children.push(category);
        groupedChildren.set(category.parent_category_id, children);
      });

      queryClient.setQueryData(categoryLibraryRootsKey(libraryId), mergeCategoryBatch([], roots));
      allCategories.forEach((category) => {
        queryClient.setQueryData(
          categoryChildrenKey(category.id),
          mergeCategoryBatch([], groupedChildren.get(category.id) ?? []),
        );
      });
      return allCategories;
    },
    [fetchCategoriesOnce, queryClient],
  );

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
    const isExpanded = expandedLibraryIds.includes(library.id);
    if (isExpanded) {
      setExpandedLibraryIds((current) => current.filter((id) => id !== library.id));
    } else {
      void ensureLibraryRoots(library.id);
      setExpandedLibraryIds((current) => Array.from(new Set([...current, library.id])));
    }
    selectLibrary(library);
  };

  const toggleCategory = (category: Category, childrenLoaded: boolean, hasLoadedChildren: boolean) => {
    const expanded = expandedCategoryIds.includes(category.id);
    selectCategory(category);
    if (expanded) {
      setExpandedCategoryIds((current) => current.filter((item) => item !== category.id));
      return;
    }
    if (childrenLoaded) {
      if (hasLoadedChildren) {
        setExpandedCategoryIds((current) => Array.from(new Set([...current, category.id])));
      }
      return;
    }
    setExpandedCategoryIds((current) => Array.from(new Set([...current, category.id])));
    void loadChildren(category.id).then((childCategories) => {
      if (childCategories.length === 0) {
        setExpandedCategoryIds((current) => current.filter((item) => item !== category.id));
      }
    });
  };

  const expandAllTree = async () => {
    if (isExpandingAll) {
      return;
    }
    const libraryIds = enabledLibraries.map((library) => library.id);
    setIsExpandingAll(true);
    setExpandedLibraryIds(enabledLibraries.map((library) => library.id));
    setLoadingLibraryIds(libraryIds);
    try {
      const allCategories = (await Promise.all(libraryIds.map(loadEntireLibraryTree))).flat();
      const loadedCategoryIds = allCategories.map((category) => category.id);
      const expandableCategoryIds = Array.from(
        new Set(
          allCategories
            .map((category) => category.parent_category_id)
            .filter((parentId): parentId is number => parentId !== null),
        ),
      );
      setLoadedRootLibraryIds(libraryIds);
      setLoadedChildParentIds(loadedCategoryIds);
      setRootLibrariesWithMore([]);
      setChildParentsWithMore([]);
      setExpandedCategoryIds(expandableCategoryIds);
      setCategoryCacheVersion((version) => version + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingLibraryIds([]);
      setIsExpandingAll(false);
    }
  };

  const collapseAllTree = () => {
    setExpandedLibraryIds([]);
    setExpandedCategoryIds([]);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: CategoryPayload) =>
      editingCategory ? apiClient.updateCategory(editingCategory.id, payload) : apiClient.createCategory(payload),
    onSuccess: async (savedCategory) => {
      const savedLibraryId = categoryLibraryId(savedCategory, libraries);
      setIsFormOpen(false);
      setEditingCategory(null);
      setForm(emptyForm);
      setParentCategoryLocked(false);
      clearCategoryChildrenCache();
      selectCategory(savedCategory);
      toast.success(t("toast.saveSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      if (savedLibraryId) {
        setExpandedLibraryIds((current) => Array.from(new Set([...current, savedLibraryId])));
        await loadLibraryRoots(savedLibraryId, 0);
      }
    },
    onError: (error) => toast.error(`${t("toast.saveFailed")}: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteCategory(id),
    onSuccess: async (_result, deletedId) => {
      setCategoryToDelete(null);
      if (selectedTree?.type === "category" && selectedTree.id === deletedId) {
        setSelectedTree(null);
      }
      setExpandedCategoryIds((current) => current.filter((id) => id !== deletedId));
      clearCategoryChildrenCache();
      toast.success(t("toast.deleteSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toast.error(`${t("toast.deleteFailed")}: ${error.message}`),
  });

  const importMutation = useMutation({
    mutationFn: (payload: CategoryImportRow[] | File) =>
      payload instanceof File
        ? apiClient.bulkImportCategoriesFile(Number(importLibraryId), payload)
        : apiClient.bulkImportCategories(Number(importLibraryId), payload),
    onSuccess: async (result) => {
      setImportResult(result);
      setExpandedLibraryIds((current) => Array.from(new Set([...current, Number(importLibraryId)])));
      setSelectedTree({ type: "library", id: Number(importLibraryId) });
      clearCategoryChildrenCache();
      toast.success(t("categoryImport.importComplete"));
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toast.error(`${t("categoryImport.importFailed")}: ${error.message}`),
  });

  const aiMutation = useMutation({
    mutationFn: () => apiClient.recognizeCategories(aiText, Number(importLibraryId) || null),
    onSuccess: (result) => {
      const rows = result.categories.map((item, index) => {
        const maxLevel = Math.max(
          1,
          item.level1 ? 1 : 0,
          item.level2 ? 2 : 0,
          item.level3 ? 3 : 0,
          item.level4 ? 4 : 0,
          item.level5 ? 5 : 0,
        );
        return toPreviewRow(
          {
            "一级类目": item.level1,
            "二级类目": item.level2 ?? "",
            "三级类目": item.level3 ?? "",
            "四级类目": item.level4 ?? "",
            "五级类目": item.level5 ?? "",
          },
          `ai-${index + 1}`,
          item.confidence,
          maxLevel,
        );
      });
      setRecognizedRows(rows);
      toast.success(t("categoryImport.aiRecognized"));
    },
    onError: (error) => toast.error(`${t("toast.aiFailed")}: ${error.message}`),
  });

  // Animate loading dots while AI recognition is in progress
  useEffect(() => {
    if (!aiMutation.isPending) {
      setLoadingDot(0);
      return;
    }
    const interval = window.setInterval(() => {
      setLoadingDot((d) => (d >= 3 ? 0 : d + 1));
    }, 500);
    return () => window.clearInterval(interval);
  }, [aiMutation.isPending]);

  const aiConfirmMutation = useMutation({
    mutationFn: (rows: CategoryImportRow[]) => apiClient.bulkImportCategories(Number(importLibraryId), rows),
    onSuccess: async (result) => {
      setImportResult(result);
      setIsAiOpen(false);
      setRecognizedRows([]);
      setAiText("");
      setExpandedLibraryIds((current) => Array.from(new Set([...current, Number(importLibraryId)])));
      setSelectedTree({ type: "library", id: Number(importLibraryId) });
      clearCategoryChildrenCache();
      toast.success(t("categoryImport.importComplete"));
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toast.error(`${t("categoryImport.importFailed")}: ${error.message}`),
  });
  const canRunImport =
    Boolean(importLibraryId) &&
    !importMutation.isPending &&
    (importFile ? true : importRows.length > 0 && invalidImportRows.length === 0);

  const followedLibraryId = () =>
    selectedLibrary && enabledLibraries.some((library) => library.id === selectedLibrary.id)
      ? String(selectedLibrary.id)
      : "";

  const openCreateForm = () => {
    setEditingCategory(null);
    setForm({
      ...emptyForm,
      categoryLibraryId: followedLibraryId() || defaultLibraryId(enabledLibraries),
      parentCategoryId: selectedCategory ? String(selectedCategory.id) : "",
    });
    setParentCategoryLocked(Boolean(selectedCategory));
    setIsFormOpen(true);
  };

  const openBulkImport = () => {
    const libraryId = followedLibraryId();
    if (libraryId) {
      setImportLibraryId(libraryId);
    }
    setIsBulkOpen(true);
  };

  const openAiImport = () => {
    const libraryId = followedLibraryId();
    if (libraryId) {
      setImportLibraryId(libraryId);
    }
    setIsAiOpen(true);
  };

  const openEditForm = (category: Category) => {
    setEditingCategory(category);
    setForm(categoryToForm(category));
    setParentCategoryLocked(false);
    setIsFormOpen(true);
  };

  const handleDelete = (category: Category) => {
    setCategoryToDelete(category);
  };

  const handleFile = async (file: File) => {
    setImportFileName(file.name);
    setImportResult(null);
    if (isCsvImportFile(file)) {
      setImportFile(null);
      const text = await file.text();
      setImportRows(parseImportCsv(text));
      return;
    }
    if (isSpreadsheetImportFile(file)) {
      setImportFile(file);
      setImportRows([]);
      return;
    }
    setImportFile(null);
    setImportRows([]);
    toast.error(t("categoryImport.unsupportedFile"));
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
  const isTableLoading = isLoading || (!isRootTable && tableQuery.isLoading);
  const isTableError = isError || (!isRootTable && tableQuery.isError);
  const isLeafCategorySelection =
    selectedTree?.type === "category" && !isTableLoading && !isTableError && tableCategories.length === 0;
  const emptyCategoryTitle = t("state.emptyCategories");
  const emptyCategoryHint = t("categoryImport.emptyHint");
  const selectedContext = selectedCategory
    ? t("categoryImport.selectedCategory", { path: pathByCategoryId.get(selectedCategory.id) ?? selectedCategory.name })
    : selectedLibrary
      ? t("categoryImport.selectedLibrary", { name: selectedLibrary.name })
      : t("categoryImport.noSelection");
  // 标题：未选 → 类目管理；选中类目库 → 库名；选中一级类目 → 类目名。
  const isFirstLevelCategory =
    selectedCategory !== null && selectedCategory.parent_category_id === null;
  const pageTitle = selectedTree?.type === "library" && selectedLibrary
    ? selectedLibrary.name
    : selectedCategory && isFirstLevelCategory
      ? selectedCategory.name
      : t("page.categories");
  // 总数徽章：类目库 → 库的总类目数；一级类目 → 该一级下所有后代数 + 1（自身）。
  const totalCountBadge = selectedTree?.type === "library" && selectedLibrary
    ? t("page.totalCategories", { count: selectedLibrary.category_count ?? 0 })
    : selectedCategory && isFirstLevelCategory
      ? t("page.totalCategories", { count: (selectedCategory.descendant_count ?? 0) + 1 })
      : null;
  const treeRows = useMemo(() => {
    const rows: CategoryTreeRow[] = [];
    enabledLibraries.forEach((library) => {
      const expanded = expandedLibraryIds.includes(library.id);
      const rootCategories = rootCategoriesByLibraryId.get(library.id) ?? [];
      rows.push({
        type: "library",
        id: `library-${library.id}`,
        library,
        expanded,
        selected: selectedTree?.type === "library" && selectedTree.id === library.id,
        loading: loadingLibraryIds.includes(library.id),
        rootsLoaded: loadedRootLibraryIds.includes(library.id),
      });
      if (!expanded) {
        return;
      }
      if (loadedRootLibraryIds.includes(library.id) && rootCategories.length === 0) {
        return;
      }
      rows.push(
        ...flattenCategoryRows({
          categories: rootCategories,
          childrenByParentId,
          pathById: pathByCategoryId,
          expandedCategoryIds,
          selectedTree,
          loadingCategoryIds,
          childParentsWithMore,
        }),
      );
      if (rootLibrariesWithMore.includes(library.id)) {
        rows.push({
          type: "load-more-roots",
          id: `load-more-roots-${library.id}`,
          libraryId: library.id,
          depth: 1,
          loading: loadingLibraryIds.includes(library.id),
        });
      }
    });
    return rows;
  }, [
    childParentsWithMore,
    childrenByParentId,
    enabledLibraries,
    expandedCategoryIds,
    expandedLibraryIds,
    loadedRootLibraryIds,
    loadingCategoryIds,
    loadingLibraryIds,
    pathByCategoryId,
    rootCategoriesByLibraryId,
    rootLibrariesWithMore,
    selectedTree,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-6">
      <aside
        data-testid="category-tree-container"
        className="max-h-[36vh] min-h-0 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-sm lg:max-h-none lg:w-72 lg:shrink-0"
      >
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
            onClick={() => void expandAllTree()}
            disabled={isExpandingAll}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/40 disabled:cursor-wait disabled:opacity-60"
          >
            {isExpandingAll && <Loader2 className="h-3 w-3 animate-spin" />}
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
          isEmpty={!isLoading && !isError && enabledLibraries.length === 0}
          emptyLabel={t("categoryImport.treeEmpty")}
          onRetry={() => {
            void query.refetch();
            void librariesQuery.refetch();
          }}
        >
          <VirtualizedCategoryTree
            rows={treeRows}
            onToggleLibrary={toggleLibrary}
            onToggleCategory={toggleCategory}
            onSelectCategory={selectCategory}
            onLoadMoreRoots={loadMoreLibraryRoots}
            onLoadMoreChildren={loadMoreChildren}
          />
        </ApiState>
      </aside>

      <main data-testid="category-content-container" className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto pr-1">
        <div data-testid="category-content-main" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl text-foreground" data-testid="category-content-title">{pageTitle}</h1>
              {totalCountBadge ? (
                <span
                  data-testid="category-content-total"
                  className="text-sm text-muted-foreground"
                >
                  {totalCountBadge}
                </span>
              ) : null}
            </div>
            {(isSuperAdmin || canManageAttributes) && (
              <div className="flex flex-wrap gap-2">
                {canManageAttributes && (
                  <button
                    type="button"
                    onClick={() => setIsAttributeImportOpen(true)}
                    disabled={!selectedLibrary}
                    data-testid="category-attribute-import-button"
                    className="inline-flex items-center gap-2 rounded-md border border-purple-200 px-4 py-2 text-sm text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground"
                  >
                    <Upload className="h-4 w-4" />
                    {t("categoryProperties.bulkImport")}
                  </button>
                )}
                {isSuperAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={openBulkImport}
                      disabled={enabledLibraries.length === 0}
                      className="inline-flex items-center gap-2 rounded-md border border-blue-200 px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground"
                    >
                      <UploadCloud className="h-4 w-4" />
                      {t("categoryImport.bulkImport")}
                    </button>
                    <button
                      type="button"
                      onClick={openAiImport}
                      disabled={enabledLibraries.length === 0}
                      className="inline-flex items-center gap-2 rounded-md border border-emerald-200 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground"
                    >
                      <Bot className="h-4 w-4" />
                      {t("categoryImport.aiImport")}
                    </button>
                    <button
                      type="button"
                      onClick={openCreateForm}
                      disabled={enabledLibraries.length === 0}
                      className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                    >
                      <Plus className="h-4 w-4" />
                      {t("action.addCategory")}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {!isLeafCategorySelection && (
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex min-w-64 flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-ring/40">
                <Search className="h-5 w-5 text-muted-foreground" />
                <span className="sr-only">{t("field.searchCategories")}</span>
                <Input
                  aria-label={t("field.searchCategories")}
                  type="search"
                  placeholder={t("field.searchCategories")}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
              </label>
            </div>
          </div>
          )}

          {!isLeafCategorySelection && (
          <ApiState
            isLoading={isTableLoading}
            isError={isTableError}
            isEmpty={false}
            emptyLabel={emptyCategoryTitle}
            onRetry={() => {
              void query.refetch();
              void librariesQuery.refetch();
              if (!isRootTable) {
                void tableQuery.refetch();
              }
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
                              {t("categoryImport.resetFilters")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedCategories.map((category) => {
                        const parent = category.parent_category_id
                          ? knownCategories.find((item) => item.id === category.parent_category_id)
                          : null;
                        return (
                          <tr key={category.id} className="transition-colors hover:bg-muted/40">
                            <td className="px-4 py-3 text-sm font-medium text-foreground">{category.name}</td>
                            <td className="px-4 py-3 font-mono text-sm text-foreground">{category.code}</td>
                            <td className="px-4 py-3 text-sm text-foreground">
                              {parent ? pathByCategoryId.get(parent.id) ?? parent.name : t("categoryImport.noParent")}
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
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {t("categoryImport.paginationSummary", {
                      page: currentPage,
                      totalPages,
                      total: filteredCategories.length,
                    })}
                  </span>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{t("categoryImport.pageSizeLabel")}</span>
                    <select
                      aria-label={t("categoryImport.pageSizeLabel")}
                      value={categoryPageSize}
                      onChange={(event) => setCategoryPageSize(Number(event.target.value))}
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                    >
                      {CATEGORY_PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size} {t("categoryImport.pageSizeUnit")}
                        </option>
                      ))}
                    </select>
                  </label>
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
          )}
        </div>

        <CategoryPropertiesPanel
          selectedCategory={selectedCategory}
          selectedLibrary={selectedLibrary}
          isSuperAdmin={isSuperAdmin}
          isImportOpen={isAttributeImportOpen}
          onImportOpenChange={setIsAttributeImportOpen}
        />

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingCategory ? t("action.edit") : t("action.addCategory")}
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
              onClick={() => saveMutation.mutate(formToPayload(form))}
              disabled={!canSave}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
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
              placeholder={editingCategory ? "" : t("field.autoGenerated")}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("field.categoryLibrary")}</span>
            <SearchableSelect
              ariaLabel={t("field.categoryLibrary")}
              value={form.categoryLibraryId}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, categoryLibraryId: value, parentCategoryId: "" }))
              }
              options={enabledLibraries.map((library) => ({
                value: String(library.id),
                label: `${library.name} (${library.code})`,
                keywords: library.code,
              }))}
              placeholder={t("field.selectCategoryLibrary")}
              searchPlaceholder={t("categoryImport.searchCategoryLibraries")}
              emptyText={t("categoryImport.noCategoryLibraryMatch")}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span className="flex items-center gap-1.5">
              {t("categoryImport.parentCategory")}
              {parentCategoryLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            </span>
            <SearchableSelect
              ariaLabel={t("categoryImport.parentCategory")}
              value={form.parentCategoryId}
              onValueChange={(value) => setForm((current) => ({ ...current, parentCategoryId: value }))}
              options={knownCategories
                .filter(
                  (category) =>
                    String(category.category_library_id ?? "") === form.categoryLibraryId &&
                    (!editingCategory || category.id !== editingCategory.id),
                )
                .map((category) => ({
                  value: String(category.id),
                  label: pathByCategoryId.get(category.id) ?? category.name,
                }))}
              placeholder={t("categoryImport.noParent")}
              searchPlaceholder={t("categoryImport.searchParentCategory")}
              emptyText={t("categoryImport.noParentCategoryMatch")}
              clearLabel={t("categoryImport.noParent")}
              disabled={!form.categoryLibraryId || parentCategoryLocked}
            />
            {parentCategoryLocked && (
              <span className="block text-xs text-muted-foreground">{t("categoryImport.parentCategoryLockedHint")}</span>
            )}
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
        </div>
      </Modal>

      <Modal
        isOpen={isBulkOpen}
        onClose={() => setIsBulkOpen(false)}
        title={t("categoryImport.bulkImport")}
        size="xl"
        footer={
          <>
            <Button
              type="button"
              onClick={() => setIsBulkOpen(false)}
              variant="outline"
            >
              {t("action.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => importMutation.mutate(importFile ?? previewRowsToImportRows(importRows))}
              disabled={!canRunImport}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {importMutation.isPending ? t("categoryImport.importing") : t("categoryImport.executeImport")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="space-y-1 text-sm text-foreground">
              <span>{t("field.categoryLibrary")}</span>
              <SearchableSelect
                ariaLabel={t("field.categoryLibrary")}
                value={importLibraryId}
                onValueChange={(value) => setImportLibraryId(value)}
                options={enabledLibraries.map((library) => ({
                  value: String(library.id),
                  label: library.name,
                  keywords: library.code,
                }))}
                placeholder={t("field.selectCategoryLibrary")}
                searchPlaceholder={t("categoryImport.searchCategoryLibraries")}
                emptyText={t("categoryImport.noCategoryLibraryMatch")}
              />
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
            {importFile && (
              <span className="mt-2 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                {t("categoryImport.spreadsheetReady")}
              </span>
            )}
            <input
              type="file"
              accept={CATEGORY_IMPORT_ACCEPT}
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
            <Button
              type="button"
              onClick={() => setIsAiOpen(false)}
              variant="outline"
            >
              {t("action.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => aiConfirmMutation.mutate(previewRowsToImportRows(recognizedRows))}
              disabled={recognizedRows.length === 0 || invalidRecognizedRows.length > 0 || aiConfirmMutation.isPending}
              aria-busy={aiConfirmMutation.isPending}
            >
              {aiConfirmMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("categoryImport.confirmRecognized")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("field.categoryLibrary")}</span>
            <SearchableSelect
              ariaLabel={t("field.categoryLibrary")}
              value={importLibraryId}
              onValueChange={(value) => setImportLibraryId(value)}
              options={enabledLibraries.map((library) => ({
                value: String(library.id),
                label: library.name,
                keywords: library.code,
              }))}
              placeholder={t("field.selectCategoryLibrary")}
              searchPlaceholder={t("categoryImport.searchCategoryLibraries")}
              emptyText={t("categoryImport.noCategoryLibraryMatch")}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("categoryImport.aiDescription")}</span>
            <Textarea
              aria-label={t("categoryImport.aiDescription")}
              ref={aiTextareaRef}
              value={aiText}
              onChange={(event) => setAiText(event.target.value)}
              rows={12}
              placeholder={t("categoryImport.aiPlaceholder")}
              className="max-h-80 resize-y overflow-y-auto"
            />
          </label>
          <Button
            type="button"
            onClick={() => aiMutation.mutate()}
            disabled={!aiText.trim() || aiMutation.isPending}
            aria-busy={aiMutation.isPending}
          >
            {aiMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("categoryImport.aiRecognizing")}{".".repeat(loadingDot + 1)}
              </>
            ) : (
              <>
                <Bot className="h-4 w-4" />
                {t("categoryImport.sendToAi")}
              </>
            )}
          </Button>
          {recognizedRows.length > 0 && (
            <ImportPreviewTable
              rows={recognizedRows}
              maxLevel={recognizedRows.reduce((max, r) => Math.max(max, r.maxLevel ?? 0), 0)}
              onChange={(id, key, value) => updatePreviewRow(id, key, value, "ai")}
              showConfidence
            />
          )}
        </div>
      </Modal>
      <AlertDialog open={Boolean(categoryToDelete)} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("action.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {categoryToDelete ? t("confirm.deleteCategory", { name: categoryToDelete.name }) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => categoryToDelete && deleteMutation.mutate(categoryToDelete.id)}
              disabled={deleteMutation.isPending}
              aria-busy={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? t("action.saving") : t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  maxLevel = 5,
}: {
  rows: PreviewRow[];
  onChange: (id: string, key: keyof CategoryImportRow, value: string) => void;
  showConfidence?: boolean;
  maxLevel?: number;
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
            {CATEGORY_LEVEL_KEYS.slice(0, maxLevel).map((key, index) => (
              <th key={key} className="px-3 py-2">{t(`categoryImport.level${index + 1}`)}</th>
            ))}
            {showConfidence && <th className="px-3 py-2">{t("categoryImport.confidence")}</th>}
            <th className="px-3 py-2">{t("field.status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {rows.map((row) => {
            const effectiveMaxLevel = row.maxLevel ?? maxLevel;
            return (
            <tr key={row.id}>
              {CATEGORY_LEVEL_KEYS.slice(0, effectiveMaxLevel).map((key) => (
                <td key={key} className="px-3 py-2">
                  <Input
                    aria-label={String(key)}
                    value={row[key] ?? ""}
                    onChange={(event) => onChange(row.id, key, event.target.value)}
                    className={`h-8 ${
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
