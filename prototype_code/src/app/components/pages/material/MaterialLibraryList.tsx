import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Edit, Package, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  apiClient,
  type MaterialLibrary,
  type MaterialLibraryPayload,
} from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { Badge } from "@/app/components/ui/badge";
import { ApiState } from "../../common/ApiState";
import { Modal } from "../../common/Modal";
import { MaterialLibraryDetail } from "./MaterialLibraryDetail";

type SegmentType = "fixed" | "category_path" | "attribute_code" | "date" | "serial";
type DateFormat = "YYYY" | "YYMM" | "YYYYMMDD";
type SerialScope = "global" | "category" | "category_attribute" | "year" | "month";

type AttributeMappingRow = {
  id: string;
  value: string;
  code: string;
};

type CodeRuleSegment = {
  id: string;
  type: SegmentType;
  fixedValue: string;
  categoryLevel: number;
  categoryLengths: [string, string, string];
  attributeName: string;
  mappings: AttributeMappingRow[];
  dateFormat: DateFormat;
  serialLength: string;
  serialStart: string;
  serialScope: SerialScope;
};

type LibraryFormState = {
  name: string;
  description: string;
  enabled: boolean;
  autoCodeEnabled: boolean;
  separator: string;
  segments: CodeRuleSegment[];
};

type PreviewResult = {
  code: string;
  error: string | null;
};

const segmentTypes: SegmentType[] = ["fixed", "category_path", "attribute_code", "date", "serial"];
const dateFormats: DateFormat[] = ["YYYY", "YYMM", "YYYYMMDD"];
const serialScopes: SerialScope[] = ["global", "category", "category_attribute", "year", "month"];
const uniqueSegmentTypes = new Set<SegmentType>(["category_path", "serial"]);
const singletonSegmentTypes = new Set<SegmentType>(["category_path", "date", "serial"]);
const allowedSeparatorPattern = /^[A-Z0-9_-]$/;
const mockCategoryCodes = ["NETWORK", "SWITCH", "CORE"];
const mockAttributes: Record<string, string> = { color: "red" };

const emptyForm: LibraryFormState = {
  name: "",
  description: "",
  enabled: true,
  autoCodeEnabled: false,
  separator: "",
  segments: [],
};

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createMappingRow(value = "", code = ""): AttributeMappingRow {
  return { id: nextId("map"), value, code };
}

function createSegment(type: SegmentType): CodeRuleSegment {
  return {
    id: nextId("segment"),
    type,
    fixedValue: "",
    categoryLevel: 1,
    categoryLengths: ["2", "2", "2"],
    attributeName: "",
    mappings: [createMappingRow()],
    dateFormat: "YYYY",
    serialLength: "3",
    serialStart: "1",
    serialScope: "global",
  };
}

function libraryToForm(library: MaterialLibrary): LibraryFormState {
  return {
    ...emptyForm,
    name: library.name,
    description: library.description,
    enabled: library.enabled,
  };
}

function accessLabelKey(library: MaterialLibrary) {
  if (library.access_role === "no_access") {
    return "material.accessNoAccess";
  }
  if (library.access_role === "read_only") {
    return "material.accessReadOnly";
  }
  return "material.accessAdmin";
}

function datePreview(format: DateFormat) {
  const current = new Date();
  const year = String(current.getFullYear());
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");
  if (format === "YYYY") {
    return year;
  }
  if (format === "YYMM") {
    return `${year.slice(2)}${month}`;
  }
  return `${year}${month}${day}`;
}

function categoryPreview(segment: CodeRuleSegment) {
  return mockCategoryCodes
    .slice(0, segment.categoryLevel)
    .map((code, index) => code.slice(0, Number(segment.categoryLengths[index]) || 2))
    .join("");
}

function segmentPreview(segment: CodeRuleSegment, missingMappingMessage: string): PreviewResult {
  if (segment.type === "fixed") {
    return { code: segment.fixedValue.trim().toUpperCase(), error: null };
  }
  if (segment.type === "category_path") {
    return { code: categoryPreview(segment), error: null };
  }
  if (segment.type === "date") {
    return { code: datePreview(segment.dateFormat), error: null };
  }
  if (segment.type === "serial") {
    const length = Number(segment.serialLength) || 1;
    const start = Number(segment.serialStart) || 1;
    return { code: String(start).padStart(length, "0"), error: null };
  }

  const attributeName = segment.attributeName.trim();
  const mockValue = attributeName ? mockAttributes[attributeName] : undefined;
  const mapping = segment.mappings.find((row) => row.value.trim() === mockValue);
  if (!mockValue || !mapping?.code.trim()) {
    return { code: "", error: missingMappingMessage };
  }
  return { code: mapping.code.trim().toUpperCase(), error: null };
}

function buildPreview(form: LibraryFormState, missingMappingMessage: string): PreviewResult {
  const parts: string[] = [];
  for (const segment of form.segments) {
    const result = segmentPreview(segment, missingMappingMessage);
    if (result.error) {
      return result;
    }
    if (result.code) {
      parts.push(result.code);
    }
  }
  return { code: parts.join(form.separator), error: null };
}

function segmentToPayload(segment: CodeRuleSegment, order: number) {
  if (segment.type === "fixed") {
    return { type: "fixed", order, value: segment.fixedValue.trim().toUpperCase() };
  }
  if (segment.type === "category_path") {
    return {
      type: "category_path",
      order,
      level: segment.categoryLevel,
      level_lengths: segment.categoryLengths.slice(0, segment.categoryLevel).map((value) => Number(value) || 2),
      length: segment.categoryLengths.slice(0, segment.categoryLevel).reduce((total, value) => total + (Number(value) || 2), 0),
    };
  }
  if (segment.type === "attribute_code") {
    return {
      type: "attribute_code",
      order,
      attribute_name: segment.attributeName.trim(),
      mappings: segment.mappings
        .filter((row) => row.value.trim() && row.code.trim())
        .map((row) => ({ value: row.value.trim(), code: row.code.trim().toUpperCase() })),
    };
  }
  if (segment.type === "date") {
    return { type: "date", order, format: segment.dateFormat };
  }
  return {
    type: "serial",
    order,
    length: Number(segment.serialLength) || 3,
    start: Number(segment.serialStart) || 1,
    step: 1,
    scope: segment.serialScope,
    padding: "left_zero",
  };
}

function formToPayload(form: LibraryFormState, includeCodeRule: boolean): MaterialLibraryPayload {
  const payload: MaterialLibraryPayload = {
    name: form.name.trim(),
    description: form.description.trim(),
    enabled: form.enabled,
  };

  if (includeCodeRule) {
    payload.auto_code_enabled = form.autoCodeEnabled;
    payload.code_rule = form.autoCodeEnabled
      ? {
          rule_name: `${form.name.trim()} code rule`,
          separator: form.separator,
          segments: form.segments.map((segment, index) => segmentToPayload(segment, index + 1)),
        }
      : null;
  }

  return payload;
}

function validateRule(form: LibraryFormState, preview: PreviewResult, t: (key: string) => string) {
  if (!form.autoCodeEnabled) {
    return [];
  }

  const messages: string[] = [];
  if (form.separator.length > 1) {
    messages.push(t("codeRule.validation.separatorSingle"));
  } else if (form.separator && !allowedSeparatorPattern.test(form.separator)) {
    messages.push(t("codeRule.validation.separatorAllowed"));
  }
  if (form.segments.length === 0) {
    messages.push(t("codeRule.validation.segmentRequired"));
  }
  if (!form.segments.some((segment) => uniqueSegmentTypes.has(segment.type))) {
    messages.push(t("codeRule.validation.uniqueSegment"));
  }

  const seenSingletonTypes = new Set<SegmentType>();
  for (const segment of form.segments) {
    if (singletonSegmentTypes.has(segment.type)) {
      if (seenSingletonTypes.has(segment.type)) {
        messages.push(t("codeRule.validation.duplicateSegment"));
        break;
      }
      seenSingletonTypes.add(segment.type);
    }
  }

  const seenAttributes = new Set<string>();
  for (const segment of form.segments) {
    if (segment.type === "fixed" && !segment.fixedValue.trim()) {
      messages.push(t("codeRule.validation.fixedValueRequired"));
      break;
    }
    if (segment.type !== "attribute_code") {
      continue;
    }
    const attribute = segment.attributeName.trim().toLowerCase();
    if (!attribute) {
      messages.push(t("codeRule.validation.attributeNameRequired"));
      break;
    }
    if (seenAttributes.has(attribute)) {
      messages.push(t("codeRule.validation.duplicateSegment"));
      break;
    }
    seenAttributes.add(attribute);
  }

  if (preview.code.length > 64) {
    messages.push(t("codeRule.validation.maxLength"));
  }
  return messages;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  if (item) {
    next.splice(toIndex, 0, item);
  }
  return next;
}

export function MaterialLibraryList() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const auth = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<LibraryFormState>(emptyForm);
  const [editingLibrary, setEditingLibrary] = useState<MaterialLibrary | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<MaterialLibrary | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const query = useQuery({
    queryKey: ["material-libraries"],
    queryFn: apiClient.materialLibraries,
    retry: false,
  });

  const isCreateMode = !editingLibrary;
  const preview = useMemo(
    () => buildPreview(form, t("codeRule.previewMissingMapping")),
    [form, t],
  );
  const validationMessages = useMemo(
    () => (showValidation ? validateRule(form, preview, t) : []),
    [form, preview, showValidation, t],
  );

  const saveMutation = useMutation({
    mutationFn: (payload: MaterialLibraryPayload) =>
      editingLibrary
        ? apiClient.updateMaterialLibrary(editingLibrary.id, payload)
        : apiClient.createMaterialLibrary(payload),
    onSuccess: async () => {
      setIsFormOpen(false);
      setEditingLibrary(null);
      setForm(emptyForm);
      setShowValidation(false);
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
  const emptyLabel = auth.user?.is_super_admin ? t("state.emptyLibraries") : t("material.noAccessibleLibraries");

  const updateSegment = (segmentId: string, patch: Partial<CodeRuleSegment>) => {
    setForm((current) => ({
      ...current,
      segments: current.segments.map((segment) =>
        segment.id === segmentId ? { ...segment, ...patch } : segment,
      ),
    }));
  };

  const updateMapping = (segmentId: string, rowId: string, patch: Partial<AttributeMappingRow>) => {
    setForm((current) => ({
      ...current,
      segments: current.segments.map((segment) =>
        segment.id === segmentId
          ? {
              ...segment,
              mappings: segment.mappings.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
            }
          : segment,
      ),
    }));
  };

  const addMappingRow = (segmentId: string) => {
    setForm((current) => ({
      ...current,
      segments: current.segments.map((segment) =>
        segment.id === segmentId
          ? { ...segment, mappings: [...segment.mappings, createMappingRow()] }
          : segment,
      ),
    }));
  };

  const removeMappingRow = (segmentId: string, rowId: string) => {
    setForm((current) => ({
      ...current,
      segments: current.segments.map((segment) =>
        segment.id === segmentId
          ? {
              ...segment,
              mappings: segment.mappings.filter((row) => row.id !== rowId),
            }
          : segment,
      ),
    }));
  };

  const openCreateForm = () => {
    setEditingLibrary(null);
    setForm(emptyForm);
    setShowValidation(false);
    setIsFormOpen(true);
  };

  const openEditForm = (library: MaterialLibrary) => {
    setEditingLibrary(library);
    setForm(libraryToForm(library));
    setShowValidation(false);
    setIsFormOpen(true);
  };

  const handleSubmit = () => {
    const nextPreview = buildPreview(form, t("codeRule.previewMissingMapping"));
    const nextValidation = validateRule(form, nextPreview, t);
    setShowValidation(true);
    if (!form.name.trim() || nextValidation.length > 0) {
      return;
    }
    saveMutation.mutate(formToPayload(form, isCreateMode));
  };

  const handleDelete = (library: MaterialLibrary) => {
    if (window.confirm(`确定删除物料库 ${library.name} 吗？该操作不可撤销。`)) {
      deleteMutation.mutate(library.id);
    }
  };

  const addSegment = (type: SegmentType) => {
    setForm((current) => ({ ...current, segments: [...current.segments, createSegment(type)] }));
  };

  const removeSegment = (segmentId: string) => {
    setForm((current) => ({
      ...current,
      segments: current.segments.filter((segment) => segment.id !== segmentId),
    }));
  };

  const reorderSegment = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= form.segments.length) {
      return;
    }
    setForm((current) => ({ ...current, segments: moveItem(current.segments, index, nextIndex) }));
  };

  if (selectedLibrary) {
    return (
      <MaterialLibraryDetail
        library={selectedLibrary}
        onBack={() => {
          setSelectedLibrary(null);
          void query.refetch();
        }}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-foreground">{t("page.materialLibraries")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("page.materialLibrariesHelp")}</p>
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

      <div className="rounded-lg border border-border bg-card p-4">
        <label className="flex max-w-md items-center gap-2 text-sm text-muted-foreground">
          <Search className="h-5 w-5 text-muted-foreground" />
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
        emptyLabel={emptyLabel}
        onRetry={() => void query.refetch()}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.map((item) => (
            <article key={item.id} className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                  <Package className="h-6 w-6 text-green-600" />
                </div>
                <Badge
                  variant="outline"
                  className={item.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted/40 text-muted-foreground"}
                >
                  {item.enabled ? t("status.enabled") : t("status.disabled")}
                </Badge>
              </div>
              <Badge variant="outline" className="mb-3 inline-flex items-center gap-1 border-blue-200 bg-blue-50 text-blue-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t(accessLabelKey(item))}
              </Badge>
              <button
                type="button"
                onClick={() => setSelectedLibrary(item)}
                className="mb-1 block text-left text-lg font-medium text-foreground hover:text-blue-700"
              >
                {item.name}
              </button>
              <p className="mb-3 font-mono text-sm text-muted-foreground">{item.code}</p>
              <p className="min-h-10 text-sm text-muted-foreground">{item.description || t("codeRule.noDescription")}</p>
              {item.auto_code_enabled && (
                <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <span className="font-medium">{t("codeRule.autoCoding")}</span>
                  <span className="mx-2 text-blue-300">/</span>
                  <span>{item.code_rule_summary?.version_label ?? "V1"}</span>
                  <span className="mx-2 text-blue-300">/</span>
                  <span>{t("codeRule.currentRule")}</span>
                </div>
              )}
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLibrary(item)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/40"
                >
                  {t("action.view")}
                </button>
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
        size={isCreateMode ? "xl" : "lg"}
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
        <div className="space-y-5">
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
                value={editingLibrary?.code ?? t("codeRule.generatedAfterSave")}
                readOnly
                className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
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
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              {t("status.enabled")}
            </label>
            {isCreateMode && (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.autoCodeEnabled}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, autoCodeEnabled: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-border"
                />
                {t("codeRule.autoCoding")}
              </label>
            )}
          </div>

          {isCreateMode && form.autoCodeEnabled && (
            <section className="space-y-4 rounded-lg border border-blue-100 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-medium text-foreground">{t("codeRule.title")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("codeRule.help")}</p>
                </div>
                <label className="w-36 space-y-1 text-sm text-foreground">
                  <span>{t("codeRule.separator")}</span>
                  <input
                    type="text"
                    maxLength={1}
                    value={form.separator}
                    placeholder="-"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, separator: event.target.value.toUpperCase() }))
                    }
                    className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                  />
                </label>
              </div>

              <div className="rounded-md border border-border bg-card p-3">
                <div className="text-sm font-medium text-foreground">{t("codeRule.livePreview")}</div>
                {preview.error ? (
                  <p className="mt-2 text-sm text-red-600">{preview.error}</p>
                ) : (
                  <p className="mt-2 break-all font-mono text-lg text-blue-700">
                    {preview.code || t("codeRule.emptyPreview")}
                  </p>
                )}
              </div>

              {showValidation && validationMessages.length > 0 && (
                <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {validationMessages.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2" aria-label={t("codeRule.addSegment")}>
                {segmentTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addSegment(type)}
                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-card px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t(`codeRule.segmentTypes.${type}`)}
                  </button>
                ))}
              </div>

              {form.segments.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                  {t("codeRule.emptySegments")}
                </div>
              ) : (
                <div className="space-y-3">
                  {form.segments.map((segment, index) => (
                    <article key={segment.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="w-56 space-y-1 text-sm text-foreground">
                          <span>{t("codeRule.segmentType")}</span>
                          <select
                            value={segment.type}
                            onChange={(event) => {
                              const next = createSegment(event.target.value as SegmentType);
                              updateSegment(segment.id, { ...next, id: segment.id });
                            }}
                            className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                          >
                            {segmentTypes.map((type) => (
                              <option key={type} value={type}>
                                {t(`codeRule.segmentTypes.${type}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={t("codeRule.moveUp")}
                            onClick={() => reorderSegment(index, -1)}
                            disabled={index === 0}
                            className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={t("codeRule.moveDown")}
                            onClick={() => reorderSegment(index, 1)}
                            disabled={index === form.segments.length - 1}
                            className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={t("codeRule.removeSegment")}
                            onClick={() => removeSegment(segment.id)}
                            className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        {segment.type === "fixed" && (
                          <label className="space-y-1 text-sm text-foreground">
                            <span>{t("codeRule.fixedValue")}</span>
                            <input
                              type="text"
                              value={segment.fixedValue}
                              placeholder="MAT"
                              onChange={(event) => updateSegment(segment.id, { fixedValue: event.target.value })}
                              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                            />
                          </label>
                        )}

                        {segment.type === "category_path" && (
                          <>
                            <label className="space-y-1 text-sm text-foreground">
                              <span>{t("codeRule.categoryLevel")}</span>
                              <select
                                value={segment.categoryLevel}
                                onChange={(event) => updateSegment(segment.id, { categoryLevel: Number(event.target.value) })}
                                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                              >
                                {[1, 2, 3].map((level) => (
                                  <option key={level} value={level}>{level}</option>
                                ))}
                              </select>
                            </label>
                            {segment.categoryLengths.slice(0, segment.categoryLevel).map((value, lengthIndex) => (
                              <label key={lengthIndex} className="space-y-1 text-sm text-foreground">
                                <span>{t("codeRule.levelLength", { level: lengthIndex + 1 })}</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={8}
                                  value={value}
                                  onChange={(event) => {
                                    const nextLengths: [string, string, string] = [...segment.categoryLengths];
                                    nextLengths[lengthIndex] = event.target.value;
                                    updateSegment(segment.id, { categoryLengths: nextLengths });
                                  }}
                                  className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                                />
                              </label>
                            ))}
                          </>
                        )}

                        {segment.type === "attribute_code" && (
                          <div className="space-y-3 md:col-span-3">
                            <label className="block space-y-1 text-sm text-foreground">
                              <span>{t("codeRule.attributeName")}</span>
                              <input
                                type="text"
                                value={segment.attributeName}
                                placeholder="color"
                                onChange={(event) => updateSegment(segment.id, { attributeName: event.target.value })}
                                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                              />
                            </label>
                            <div className="space-y-2">
                              <div className="text-sm font-medium text-foreground">{t("codeRule.mappingTable")}</div>
                              {segment.mappings.map((row) => (
                                <div key={row.id} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                                  <input
                                    type="text"
                                    aria-label={t("codeRule.attributeValue")}
                                    value={row.value}
                                    placeholder="red"
                                    onChange={(event) => updateMapping(segment.id, row.id, { value: event.target.value })}
                                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                                  />
                                  <input
                                    type="text"
                                    aria-label={t("codeRule.attributeCode")}
                                    value={row.code}
                                    placeholder="R"
                                    onChange={(event) => updateMapping(segment.id, row.id, { code: event.target.value })}
                                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeMappingRow(segment.id, row.id)}
                                    disabled={segment.mappings.length === 1}
                                    className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {t("action.delete")}
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => addMappingRow(segment.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                {t("codeRule.addMapping")}
                              </button>
                            </div>
                          </div>
                        )}

                        {segment.type === "date" && (
                          <label className="space-y-1 text-sm text-foreground">
                            <span>{t("codeRule.dateFormat")}</span>
                            <select
                              value={segment.dateFormat}
                              onChange={(event) => updateSegment(segment.id, { dateFormat: event.target.value as DateFormat })}
                              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                            >
                              {dateFormats.map((format) => (
                                <option key={format} value={format}>{format}</option>
                              ))}
                            </select>
                          </label>
                        )}

                        {segment.type === "serial" && (
                          <>
                            <label className="space-y-1 text-sm text-foreground">
                              <span>{t("codeRule.serialLength")}</span>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={segment.serialLength}
                                onChange={(event) => updateSegment(segment.id, { serialLength: event.target.value })}
                                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                              />
                            </label>
                            <label className="space-y-1 text-sm text-foreground">
                              <span>{t("codeRule.serialStart")}</span>
                              <input
                                type="number"
                                min={1}
                                value={segment.serialStart}
                                onChange={(event) => updateSegment(segment.id, { serialStart: event.target.value })}
                                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                              />
                            </label>
                            <label className="space-y-1 text-sm text-foreground">
                              <span>{t("codeRule.serialScope")}</span>
                              <select
                                value={segment.serialScope}
                                onChange={(event) => updateSegment(segment.id, { serialScope: event.target.value as SerialScope })}
                                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                              >
                                {serialScopes.map((scope) => (
                                  <option key={scope} value={scope}>
                                    {t(`codeRule.serialScopes.${scope}`)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {saveMutation.isError && (
            <p className="text-sm text-red-600">{saveMutation.error.message}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
