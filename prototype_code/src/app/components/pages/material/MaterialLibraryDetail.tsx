import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  GripVertical,
  Hash,
  HelpCircle,
  Layers,
  Download,
  Eye,
  History,
  Pencil,
  Plus,
  RefreshCw,
  Tags,
  Type,
  Upload,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  API_BASE_URL,
  apiClient,
  type MaterialCodeChangeBatch,
  type MaterialCodeRuleVersion,
  type MaterialLibrary,
  type MaterialCodeRuleVersionPayload,
} from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { ApiState } from "../../common/ApiState";
import { Modal } from "../../common/Modal";
import {
  CodeMappingsPanel,
  RecodePreviewModal,
  RecodeRecordsPanel,
  SelectedMaterialModal,
} from "./MaterialLibraryRecodePanels";
import { MaterialList } from "./MaterialList";

type SegmentType = "fixed" | "category_path" | "attribute_code" | "date" | "serial";
type DateFormat = "YYYY" | "YYMM" | "YYYYMMDD";
type SerialScope = "global" | "category" | "category_attribute" | "year" | "month";
type DetailTab = "basic" | "rule" | "versions" | "materials" | "recodes" | "mappings";
type EffectiveMode = "new_materials" | "all_recode" | "selected_recode";

type AttributeMappingRow = {
  id: string;
  value: string;
  code: string;
};

type EditableSegment = {
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

type RuleFormState = {
  ruleName: string;
  separator: string;
  changeReason: string;
  effectiveMode: EffectiveMode;
  segments: EditableSegment[];
};

type PreviewResult = {
  code: string;
  error: string | null;
};

const detailTabs: DetailTab[] = ["basic", "rule", "versions", "materials", "recodes", "mappings"];
const segmentTypes: SegmentType[] = ["fixed", "category_path", "attribute_code", "date", "serial"];
const dateFormats: DateFormat[] = ["YYYY", "YYMM", "YYYYMMDD"];
const serialScopes: SerialScope[] = ["global", "category", "category_attribute", "year", "month"];
const mockCategoryCodes = ["NETWORK", "SWITCH", "CORE"];
const mockAttributes: Record<string, string> = { color: "red" };
const segmentIconMap = {
  fixed: Type,
  category_path: Layers,
  attribute_code: Tags,
  date: Calendar,
  serial: Hash,
};

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createMappingRow(value = "", code = ""): AttributeMappingRow {
  return { id: nextId("map"), value, code };
}

function createSegment(type: SegmentType): EditableSegment {
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

function segmentTypeFromRaw(raw: unknown): SegmentType {
  if (raw === "fixed_text") {
    return "fixed";
  }
  if (raw === "serial_number") {
    return "serial";
  }
  if (segmentTypes.includes(raw as SegmentType)) {
    return raw as SegmentType;
  }
  return "fixed";
}

function mappingRowsFromSegment(segment: Record<string, unknown>) {
  const mappings = segment.mappings;
  if (Array.isArray(mappings)) {
    const rows = mappings
      .map((item) => (typeof item === "object" && item ? item as Record<string, unknown> : null))
      .filter(Boolean)
      .map((item) => createMappingRow(String(item?.value ?? ""), String(item?.code ?? "")));
    if (rows.length > 0) {
      return rows;
    }
  }

  const valueToCode = segment.value_to_code ?? segment.value_to_code_mapping;
  if (typeof valueToCode === "object" && valueToCode) {
    const rows = Object.entries(valueToCode as Record<string, unknown>).map(([value, code]) =>
      createMappingRow(value, String(code)),
    );
    if (rows.length > 0) {
      return rows;
    }
  }

  return [createMappingRow()];
}

function segmentToForm(segment: Record<string, unknown>): EditableSegment {
  const type = segmentTypeFromRaw(segment.type);
  const next = createSegment(type);
  if (type === "fixed") {
    next.fixedValue = String(segment.value ?? segment.text ?? segment.literal ?? "");
  }
  if (type === "category_path") {
    const levelLengths = Array.isArray(segment.level_lengths) ? segment.level_lengths : [];
    const level = Number(segment.level ?? levelLengths.length ?? 1) || 1;
    next.categoryLevel = Math.min(3, Math.max(1, level));
    next.categoryLengths = [
      String(levelLengths[0] ?? segment.length ?? 2),
      String(levelLengths[1] ?? 2),
      String(levelLengths[2] ?? 2),
    ];
  }
  if (type === "attribute_code") {
    next.attributeName = String(segment.attribute_name ?? segment.attribute ?? "");
    next.mappings = mappingRowsFromSegment(segment);
  }
  if (type === "date") {
    const format = String(segment.format ?? "YYYY");
    next.dateFormat = dateFormats.includes(format as DateFormat) ? format as DateFormat : "YYYY";
  }
  if (type === "serial") {
    next.serialLength = String(segment.length ?? 3);
    next.serialStart = String(segment.start ?? 1);
    const scope = String(segment.scope ?? "global");
    next.serialScope = serialScopes.includes(scope as SerialScope) ? scope as SerialScope : "global";
  }
  return next;
}

function ruleToForm(rule: MaterialCodeRuleVersion): RuleFormState {
  return {
    ruleName: rule.rule_name,
    separator: rule.separator,
    changeReason: "",
    effectiveMode: "new_materials",
    segments: rule.segments.map((segment) => segmentToForm(segment)),
  };
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

function segmentPreview(segment: EditableSegment, missingMappingMessage: string): PreviewResult {
  if (segment.type === "fixed") {
    return { code: segment.fixedValue.trim().toUpperCase(), error: null };
  }
  if (segment.type === "category_path") {
    const code = mockCategoryCodes
      .slice(0, segment.categoryLevel)
      .map((item, index) => item.slice(0, Number(segment.categoryLengths[index]) || 2))
      .join("");
    return { code, error: null };
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

function buildPreview(form: RuleFormState, missingMappingMessage: string): PreviewResult {
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

function segmentToPayload(segment: EditableSegment, order: number) {
  if (segment.type === "fixed") {
    return { type: "fixed", order, value: segment.fixedValue.trim().toUpperCase() };
  }
  if (segment.type === "category_path") {
    return {
      type: "category_path",
      order,
      level: segment.categoryLevel,
      level_lengths: segment.categoryLengths.slice(0, segment.categoryLevel).map((value) => Number(value) || 2),
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

function formToPayload(form: RuleFormState): MaterialCodeRuleVersionPayload {
  return {
    rule_name: form.ruleName.trim() || "Material code rule",
    rule_config: {
      separator: form.separator,
      segments: form.segments.map((segment, index) => segmentToPayload(segment, index + 1)),
    },
    change_reason: form.changeReason.trim(),
    activate: form.effectiveMode === "new_materials",
  };
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  if (item) {
    next.splice(toIndex, 0, item);
  }
  return next;
}

function moveItemById<T extends { id: string }>(items: T[], draggedId: string, targetId: string) {
  const fromIndex = items.findIndex((item) => item.id === draggedId);
  const toIndex = items.findIndex((item) => item.id === targetId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return items;
  }
  return moveItem(items, fromIndex, toIndex);
}

function segmentValidationError(
  segment: EditableSegment,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (segment.type === "fixed" && !segment.fixedValue.trim()) {
    return t("codeRule.validation.fixedValueRequired");
  }
  if (segment.type === "attribute_code" && !segment.attributeName.trim()) {
    return t("codeRule.validation.attributeNameRequired");
  }
  return "";
}

function parseMappingCsv(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      const [value = "", code = ""] = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
      return value && code ? createMappingRow(value, code.toUpperCase()) : null;
    })
    .filter((row): row is AttributeMappingRow => Boolean(row));
}

function serialScopePreviewRows(segment: EditableSegment, t: (key: string, options?: Record<string, unknown>) => string) {
  const length = Number(segment.serialLength) || 3;
  const start = Number(segment.serialStart) || 1;
  const current = Math.max(0, start - 1);
  const next = String(start).padStart(length, "0");
  if (segment.serialScope === "category" || segment.serialScope === "category_attribute") {
    return [
      {
        key: "CAT-NETWORK",
        current,
        next,
      },
    ];
  }
  if (segment.serialScope === "year") {
    return [{ key: String(new Date().getFullYear()), current, next }];
  }
  if (segment.serialScope === "month") {
    return [{ key: new Date().toISOString().slice(0, 7), current, next }];
  }
  return [{ key: t("codeRule.serialScopes.global"), current, next }];
}

function SegmentHelp({ type }: { type: SegmentType }) {
  const { t } = useTranslation();
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus:bg-accent focus:text-foreground"
        aria-label={t("codeRule.segmentHelpLabel", { type: t(`codeRule.segmentTypes.${type}`) })}
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <span className="pointer-events-none absolute left-0 top-7 z-10 hidden w-64 rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground shadow-lg group-focus-within:block group-hover:block">
        {t(`codeRule.segmentHelp.${type}`)}
      </span>
    </span>
  );
}

function statusTone(status: string) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "draft") {
    return "border-border bg-muted/40 text-foreground";
  }
  if (status === "failed") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  return "border-red-200 bg-red-50 text-red-700";
}

function formatTime(value?: string | null) {
  if (!value) {
    return "-";
  }
  return value.replace("T", " ").slice(0, 19);
}

function displayValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object" && value) {
    return JSON.stringify(value);
  }
  return String(value ?? "-");
}

function SegmentSummary({
  segment,
  index,
}: {
  segment: Record<string, unknown>;
  index: number;
}) {
  const { t } = useTranslation();
  const type = segmentTypeFromRaw(segment.type);
  const title = t(`codeRule.segmentTypes.${type}`);
  const details: string[] = [];

  if (type === "fixed") {
    details.push(`${t("codeRule.fixedValue")}: ${displayValue(segment.value ?? segment.text ?? segment.literal)}`);
  }
  if (type === "category_path") {
    details.push(`${t("codeRule.categoryLevel")}: ${displayValue(segment.level ?? 1)}`);
    details.push(`${t("codeRuleDetail.levelLengths")}: ${displayValue(segment.level_lengths ?? segment.length)}`);
  }
  if (type === "attribute_code") {
    details.push(`${t("codeRule.attributeName")}: ${displayValue(segment.attribute_name ?? segment.attribute)}`);
    details.push(`${t("codeRule.mappingTable")}: ${displayValue(segment.mappings ?? segment.value_to_code)}`);
  }
  if (type === "date") {
    details.push(`${t("codeRule.dateFormat")}: ${displayValue(segment.format ?? "YYYY")}`);
  }
  if (type === "serial") {
    details.push(`${t("codeRule.serialLength")}: ${displayValue(segment.length ?? 3)}`);
    details.push(`${t("codeRule.serialStart")}: ${displayValue(segment.start ?? 1)}`);
    details.push(`${t("codeRule.serialScope")}: ${t(`codeRule.serialScopes.${String(segment.scope ?? "global")}`)}`);
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-xs font-medium text-blue-700">
          {index + 1}
        </span>
        <div>
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground">{String(segment.type ?? type)}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
        {details.map((detail) => (
          <span key={detail}>{detail}</span>
        ))}
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={statusTone(status)}>
      {t(`codeRuleDetail.statuses.${status}`, { defaultValue: status })}
    </Badge>
  );
}

function RuleEditor({
  library,
  currentRule,
  isOpen,
  onClose,
  onRecodeDraft,
}: {
  library: MaterialLibrary;
  currentRule: MaterialCodeRuleVersion;
  isOpen: boolean;
  onClose: () => void;
  onRecodeDraft: (version: MaterialCodeRuleVersion, mode: Exclude<EffectiveMode, "new_materials">) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RuleFormState>(() => ruleToForm(currentRule));
  const [showValidation, setShowValidation] = useState(false);
  const [_previewRequested, setPreviewRequested] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draggedSegmentId, setDraggedSegmentId] = useState<string | null>(null);
  const attributesQuery = useQuery({
    queryKey: ["attributes", "code-rule-autocomplete"],
    queryFn: () => apiClient.attributes(null),
    enabled: isOpen,
    retry: false,
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories", "code-rule-serial-preview"],
    queryFn: apiClient.categories,
    enabled: isOpen,
    retry: false,
  });
  const attributeOptions = attributesQuery.data ?? [];
  const categoryOptions = categoriesQuery.data ?? [];

  const preview = useMemo(
    () => buildPreview(form, t("codeRule.previewMissingMapping")),
    [form, t],
  );
  const reasonMissing = showValidation && !form.changeReason.trim();
  const hasSegmentErrors = form.segments.some((segment) => segmentValidationError(segment, t));

  const saveMutation = useMutation({
    mutationFn: (payload: MaterialCodeRuleVersionPayload) => apiClient.createCodeRuleVersion(library.id, payload),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["material-libraries"] });
      await queryClient.invalidateQueries({ queryKey: ["material-library", library.id] });
      await queryClient.invalidateQueries({ queryKey: ["material-code-rule-current", library.id] });
      await queryClient.invalidateQueries({ queryKey: ["material-code-rule-versions", library.id] });
      if (form.effectiveMode === "new_materials") {
        toast.success(t("codeRuleDetail.ruleActivated"));
        onClose();
        return;
      }
      const promptKey =
        form.effectiveMode === "all_recode" ? "codeRuleDetail.allRecodePrompt" : "codeRuleDetail.selectedRecodePrompt";
      setDraftPrompt(t(promptKey, { version: created.version_label }));
      toast.success(t("codeRuleDetail.draftCreated"));
      onClose();
      onRecodeDraft(created, form.effectiveMode);
    },
    onError: (error) => toast.error(`${t("toast.saveFailed")}: ${error.message}`),
  });

  const updateSegment = (segmentId: string, patch: Partial<EditableSegment>) => {
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

  const handleSave = () => {
    setShowValidation(true);
    setDraftPrompt("");
    if (!form.changeReason.trim() || hasSegmentErrors) {
      return;
    }
    saveMutation.mutate(formToPayload(form));
  };

  const handlePreview = () => {
    setShowValidation(true);
    setPreviewRequested(true);
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

  const importMappings = (segmentId: string, file: File | null) => {
    if (!file) {
      return;
    }
    void file.text().then((text) => {
      const rows = parseMappingCsv(text);
      if (rows.length === 0) {
        toast.error(t("codeRule.csvImportEmpty"));
        return;
      }
      updateSegment(segmentId, { mappings: rows });
      toast.success(t("codeRule.csvImportSuccess", { count: rows.length }));
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("codeRuleDetail.editRuleTitle")}
      size="xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? t("action.saving") : t("action.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-foreground">
            <span>{t("codeRuleDetail.ruleName")}</span>
            <input
              type="text"
              value={form.ruleName}
              onChange={(event) => setForm((current) => ({ ...current, ruleName: event.target.value }))}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-foreground">
            <span>{t("codeRule.separator")}</span>
            <input
              type="text"
              maxLength={1}
              value={form.separator}
              onChange={(event) => setForm((current) => ({ ...current, separator: event.target.value.toUpperCase() }))}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-foreground md:col-span-2">
            <span>{t("codeRuleDetail.changeReason")}</span>
            <textarea
              value={form.changeReason}
              onChange={(event) => setForm((current) => ({ ...current, changeReason: event.target.value }))}
              rows={2}
              aria-invalid={reasonMissing}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40 aria-invalid:border-red-400"
            />
            {reasonMissing && <span className="text-sm text-red-600">{t("codeRuleDetail.changeReasonRequired")}</span>}
          </label>
          <label className="flex flex-col gap-1 text-sm text-foreground md:col-span-2">
            <span>{t("codeRuleDetail.effectiveMode")}</span>
            <select
              value={form.effectiveMode}
              onChange={(event) =>
                setForm((current) => ({ ...current, effectiveMode: event.target.value as EffectiveMode }))
              }
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
            >
              <option value="new_materials">{t("codeRuleDetail.effectiveModes.new_materials")}</option>
              <option value="all_recode">{t("codeRuleDetail.effectiveModes.all_recode")}</option>
              <option value="selected_recode">{t("codeRuleDetail.effectiveModes.selected_recode")}</option>
            </select>
          </label>
        </div>

        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-foreground">{t("codeRule.livePreview")}</div>
              {preview.error && <p className="mt-2 text-sm text-red-600">{preview.error}</p>}
              {!preview.error && (
                <p className="mt-2 break-all font-mono text-lg text-blue-700">{preview.code || t("codeRule.emptyPreview")}</p>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handlePreview}>
              <Eye data-icon="inline-start" />
              {t("codeRuleDetail.preview")}
            </Button>
          </div>
        </div>

        {draftPrompt && (
          <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {draftPrompt}
          </div>
        )}

        <div className="flex flex-wrap gap-2" aria-label={t("codeRule.addSegment")}>
          {segmentTypes.map((type) => (
            <Button key={type} type="button" variant="outline" size="sm" onClick={() => addSegment(type)}>
              <Plus data-icon="inline-start" />
              {t(`codeRule.segmentTypes.${type}`)}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {form.segments.map((segment, index) => (
            <article
              key={segment.id}
              draggable
              onDragStart={() => setDraggedSegmentId(segment.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!draggedSegmentId) {
                  return;
                }
                setForm((current) => ({
                  ...current,
                  segments: moveItemById(current.segments, draggedSegmentId, segment.id),
                }));
                setDraggedSegmentId(null);
                setPreviewRequested(true);
              }}
              className={`rounded-lg border bg-card p-4 ${
                showValidation && segmentValidationError(segment, t)
                  ? "border-red-300 ring-2 ring-red-100"
                  : "border-border"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                    {(() => {
                      const Icon = segmentIconMap[segment.type];
                      return <Icon className="h-4 w-4" />;
                    })()}
                  </span>
                  <label className="flex w-56 flex-col gap-1 text-sm text-foreground">
                    <span className="flex items-center gap-1">
                      {t("codeRule.segmentType")}
                      <SegmentHelp type={segment.type} />
                    </span>
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
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("codeRule.moveUp")}
                    onClick={() => reorderSegment(index, -1)}
                    disabled={index === 0}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("codeRule.moveDown")}
                    onClick={() => reorderSegment(index, 1)}
                    disabled={index === form.segments.length - 1}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("codeRule.removeSegment")}
                    onClick={() => removeSegment(segment.id)}
                  >
                    <X />
                  </Button>
                </div>
              </div>
              {showValidation && segmentValidationError(segment, t) && (
                <p className="mt-3 text-sm text-red-600">{segmentValidationError(segment, t)}</p>
              )}

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {segment.type === "fixed" && (
                  <label className="flex flex-col gap-1 text-sm text-foreground">
                    <span>{t("codeRule.fixedValue")}</span>
                    <input
                      type="text"
                      value={segment.fixedValue}
                      onChange={(event) => updateSegment(segment.id, { fixedValue: event.target.value })}
                      className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                    />
                  </label>
                )}

                {segment.type === "category_path" && (
                  <>
                    <label className="flex flex-col gap-1 text-sm text-foreground">
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
                      <label key={lengthIndex} className="flex flex-col gap-1 text-sm text-foreground">
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
                  <div className="flex flex-col gap-3 md:col-span-3">
                    <label className="flex flex-col gap-1 text-sm text-foreground">
                      <span>{t("codeRule.attributeName")}</span>
                      <input
                        type="text"
                        list="code-rule-attribute-options"
                        value={segment.attributeName}
                        onChange={(event) => updateSegment(segment.id, { attributeName: event.target.value })}
                        className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                      />
                      <datalist id="code-rule-attribute-options">
                        {attributeOptions.map((attribute) => (
                          <option key={attribute.id} value={attribute.name} />
                        ))}
                      </datalist>
                      {segment.attributeName.trim() && (
                        <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-card shadow-sm">
                          {attributeOptions
                            .filter((attribute) =>
                              attribute.name.toLowerCase().includes(segment.attributeName.trim().toLowerCase()),
                            )
                            .slice(0, 6)
                            .map((attribute) => (
                              <button
                                key={attribute.id}
                                type="button"
                                className="block w-full px-3 py-2 text-left text-xs text-foreground hover:bg-blue-50"
                                onClick={() => updateSegment(segment.id, { attributeName: attribute.name })}
                              >
                                {attribute.name}
                              </button>
                            ))}
                        </div>
                      )}
                    </label>
                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-medium text-foreground">{t("codeRule.mappingTable")}</div>
                      {segment.mappings.map((row) => (
                        <div key={row.id} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                          <input
                            type="text"
                            aria-label={t("codeRule.attributeValue")}
                            value={row.value}
                            onChange={(event) => updateMapping(segment.id, row.id, { value: event.target.value })}
                            className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                          />
                          <input
                            type="text"
                            aria-label={t("codeRule.attributeCode")}
                            value={row.code}
                            onChange={(event) => updateMapping(segment.id, row.id, { code: event.target.value })}
                            className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={segment.mappings.length === 1}
                            onClick={() =>
                              updateSegment(segment.id, {
                                mappings: segment.mappings.filter((item) => item.id !== row.id),
                              })
                            }
                          >
                            {t("action.delete")}
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateSegment(segment.id, { mappings: [...segment.mappings, createMappingRow()] })
                        }
                      >
                        <Plus data-icon="inline-start" />
                        {t("codeRule.addMapping")}
                      </Button>
                      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-blue-200 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50">
                        <Upload className="h-3.5 w-3.5" />
                        {t("codeRule.importCsv")}
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="sr-only"
                          onChange={(event) => {
                            importMappings(segment.id, event.target.files?.[0] ?? null);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {segment.type === "date" && (
                  <label className="flex flex-col gap-1 text-sm text-foreground">
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
                    <label className="flex flex-col gap-1 text-sm text-foreground">
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
                    <label className="flex flex-col gap-1 text-sm text-foreground">
                      <span>{t("codeRule.serialStart")}</span>
                      <input
                        type="number"
                        min={1}
                        value={segment.serialStart}
                        onChange={(event) => updateSegment(segment.id, { serialStart: event.target.value })}
                        className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-foreground">
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
                    {(segment.serialScope === "category" || segment.serialScope === "category_attribute") && (
                      <label className="flex flex-col gap-1 text-sm text-foreground">
                        <span>{t("codeRule.serialScopeKey")}</span>
                        <select className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40">
                          {(categoryOptions.length > 0 ? categoryOptions : [{ id: 0, name: "NETWORK", code: "NETWORK" }]).map((category) => (
                            <option key={category.id} value={category.code}>
                              {category.name} ({category.code})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 md:col-span-3">
                      <div className="font-medium">{t("codeRule.serialPreviewTitle")}</div>
                      <div className="mt-2 grid gap-2 md:grid-cols-3">
                        {serialScopePreviewRows(segment, t).map((row) => (
                          <div key={row.key} className="rounded border border-blue-100 bg-card px-3 py-2">
                            <div className="text-xs text-blue-600">{row.key}</div>
                            <div className="mt-1 font-mono">
                              {t("codeRule.serialCurrent")}: {row.current} / {t("codeRule.serialNext")}: {row.next}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function MaterialLibraryDetail({
  library: initialLibrary,
  onBack,
}: {
  library: MaterialLibrary;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<DetailTab>("basic");
  const [versionPage, setVersionPage] = useState(1);
  const [selectedVersion, setSelectedVersion] = useState<MaterialCodeRuleVersion | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [previewBatch, setPreviewBatch] = useState<MaterialCodeChangeBatch | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedRecodeVersion, setSelectedRecodeVersion] = useState<MaterialCodeRuleVersion | null>(null);
  const [isSelectionOpen, setIsSelectionOpen] = useState(false);

  const libraryQuery = useQuery({
    queryKey: ["material-library", initialLibrary.id],
    queryFn: () => apiClient.materialLibrary(initialLibrary.id),
    initialData: initialLibrary,
    retry: false,
  });
  const library = libraryQuery.data ?? initialLibrary;
  const canEdit = Boolean(user?.is_super_admin || user?.material_library_scope_ids?.includes(library.id));

  const currentRuleQuery = useQuery({
    queryKey: ["material-code-rule-current", library.id],
    queryFn: () => apiClient.currentCodeRule(library.id),
    enabled: Boolean(library.auto_code_enabled),
    retry: false,
  });
  const versionsQuery = useQuery({
    queryKey: ["material-code-rule-versions", library.id, versionPage],
    queryFn: () => apiClient.codeRuleVersions(library.id, versionPage, 10),
    enabled: Boolean(library.auto_code_enabled),
    retry: false,
  });

  const currentRule = currentRuleQuery.data;
  const versions = versionsQuery.data;
  const pageCount = versions ? Math.max(1, Math.ceil(versions.total / versions.page_size)) : 1;
  const serialSegment = currentRule?.segments.find((segment) => segmentTypeFromRaw(segment.type) === "serial");

  const openExport = () => {
    window.open(`${API_BASE_URL}/material-libraries/${library.id}/code-mappings?export=csv`, "_blank", "noopener,noreferrer");
  };

  const previewMutation = useMutation({
    mutationFn: ({
      versionId,
      mode,
      materialIds,
    }: {
      versionId: number;
      mode: Exclude<EffectiveMode, "new_materials">;
      materialIds: number[];
    }) =>
      apiClient.recodePreview(library.id, versionId, {
        scope: mode === "all_recode" ? "all" : "selected",
        material_ids: materialIds,
      }),
    onSuccess: (batch) => {
      setPreviewBatch(batch);
      setIsSelectionOpen(false);
      setIsPreviewOpen(true);
    },
    onError: (error) => toast.error(`${t("toast.saveFailed")}: ${error.message}`),
  });

  const startRecodePreview = (
    version: MaterialCodeRuleVersion,
    mode: Exclude<EffectiveMode, "new_materials">,
    materialIds: number[] = [],
  ) => {
    setPreviewBatch(null);
    setIsPreviewOpen(true);
    previewMutation.mutate({ versionId: version.id, mode, materialIds });
  };

  const handleRecodeDraft = (
    version: MaterialCodeRuleVersion,
    mode: Exclude<EffectiveMode, "new_materials">,
  ) => {
    if (mode === "selected_recode") {
      setSelectedRecodeVersion(version);
      setIsSelectionOpen(true);
      return;
    }
    startRecodePreview(version, mode);
  };

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button type="button" variant="outline" size="icon" onClick={onBack} aria-label={t("codeRuleDetail.back")}>
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-2xl text-foreground">{library.name}</h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground">{library.code}</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DetailTab)} className="gap-4">
        <TabsList className="h-auto flex-wrap justify-start rounded-lg">
          {detailTabs.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`codeRuleDetail.tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="basic">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-base font-medium text-foreground">{t("codeRuleDetail.basicInfo")}</h2>
            <dl className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <dt className="text-sm text-muted-foreground">{t("field.name")}</dt>
                <dd className="mt-1 text-sm text-foreground">{library.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("field.code")}</dt>
                <dd className="mt-1 font-mono text-sm text-foreground">{library.code}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("codeRule.autoCoding")}</dt>
                <dd className="mt-1 text-sm text-foreground">
                  {library.auto_code_enabled ? t("status.enabled") : t("status.disabled")}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("field.materialLibraryAdmins")}</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5 text-sm text-foreground">
                  {(library.material_library_admin_names?.length ? library.material_library_admin_names : library.material_library_admin_name ? [library.material_library_admin_name] : []).map((name) => (
                    <Badge key={name} variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">
                      {name}
                    </Badge>
                  ))}
                  {!library.material_library_admin_names?.length && !library.material_library_admin_name && "-"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("field.categoryLibraries")}</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5 text-sm text-foreground">
                  {(library.category_library_names?.length ? library.category_library_names : library.category_library_name ? [library.category_library_name] : []).map((name) => (
                    <Badge key={name} variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">
                      {name}
                    </Badge>
                  ))}
                  {!library.category_library_names?.length && !library.category_library_name && "-"}
                </dd>
              </div>
              <div className="md:col-span-3">
                <dt className="text-sm text-muted-foreground">{t("field.description")}</dt>
                <dd className="mt-1 text-sm text-foreground">{library.description || t("codeRule.noDescription")}</dd>
              </div>
            </dl>
          </section>
        </TabsContent>

        <TabsContent value="rule">
          <ApiState
            isLoading={currentRuleQuery.isLoading}
            isError={currentRuleQuery.isError}
            isEmpty={!library.auto_code_enabled}
            emptyLabel={t("codeRuleDetail.noAutoRule")}
            onRetry={() => void currentRuleQuery.refetch()}
          >
            {currentRule && (
              <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-medium text-foreground">
                        {currentRule.version_label} {currentRule.rule_name}
                      </h2>
                      <StatusBadge status={currentRule.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                      <span>{t("codeRuleDetail.effectiveTime")}: {formatTime(currentRule.effective_time)}</span>
                      <span>{t("codeRuleDetail.createdBy")}: {currentRule.created_by}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canEdit && (
                      <Button type="button" size="sm" onClick={() => setIsEditorOpen(true)}>
                        <Pencil data-icon="inline-start" />
                        {t("codeRuleDetail.editRule")}
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab("versions")}>
                      <History data-icon="inline-start" />
                      {t("codeRuleDetail.viewHistory")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={openExport}>
                      <Download data-icon="inline-start" />
                      {t("codeRuleDetail.exportMappings")}
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  <span className="font-medium">{t("codeRuleDetail.serialStrategy")}</span>
                  <span className="mx-2 text-blue-300">/</span>
                  {serialSegment ? (
                    <span>
                      {t("codeRule.serialLength")}: {displayValue(serialSegment.length ?? 3)} · {t("codeRule.serialStart")}:{" "}
                      {displayValue(serialSegment.start ?? 1)} · {t("codeRule.serialScope")}:{" "}
                      {t(`codeRule.serialScopes.${String(serialSegment.scope ?? "global")}`)}
                    </span>
                  ) : (
                    <span>{t("codeRuleDetail.noSerial")}</span>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {currentRule.segments.map((segment, index) => (
                    <SegmentSummary key={`${currentRule.id}-${index}`} segment={segment} index={index} />
                  ))}
                </div>
              </section>
            )}
          </ApiState>
        </TabsContent>

        <TabsContent value="versions">
          <ApiState
            isLoading={versionsQuery.isLoading}
            isError={versionsQuery.isError}
            isEmpty={!library.auto_code_enabled}
            emptyLabel={t("codeRuleDetail.noVersions")}
            onRetry={() => void versionsQuery.refetch()}
          >
            <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-medium text-foreground">{t("codeRuleDetail.versionHistory")}</h2>
                <Button type="button" variant="outline" size="sm" onClick={() => void versionsQuery.refetch()}>
                  <RefreshCw data-icon="inline-start" />
                  {t("app.reload")}
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-4 font-medium">{t("codeRuleDetail.versionNo")}</th>
                      <th className="py-2 pr-4 font-medium">{t("codeRuleDetail.ruleName")}</th>
                      <th className="py-2 pr-4 font-medium">{t("codeRuleDetail.status")}</th>
                      <th className="py-2 pr-4 font-medium">{t("codeRuleDetail.effectiveTime")}</th>
                      <th className="py-2 pr-4 font-medium">{t("codeRuleDetail.createdBy")}</th>
                      <th className="py-2 pr-4 font-medium">{t("codeRuleDetail.changeReason")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(versions?.items ?? []).map((version) => (
                      <tr key={version.id} className="hover:bg-muted/40">
                        <td className="py-3 pr-4">
                          <button
                            type="button"
                            onClick={() => setSelectedVersion(version)}
                            className="font-mono text-blue-700 hover:underline"
                          >
                            {version.version_label}
                          </button>
                        </td>
                        <td className="py-3 pr-4 text-foreground">{version.rule_name}</td>
                        <td className="py-3 pr-4"><StatusBadge status={version.status} /></td>
                        <td className="py-3 pr-4 text-muted-foreground">{formatTime(version.effective_time)}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{version.created_by}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{version.change_reason || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>{t("rules.pageSummary", { page: versionPage, pages: pageCount })}</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={versionPage <= 1}
                    onClick={() => setVersionPage((page) => Math.max(1, page - 1))}
                  >
                    {t("rules.previousPage")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={versionPage >= pageCount}
                    onClick={() => setVersionPage((page) => Math.min(pageCount, page + 1))}
                  >
                    {t("rules.nextPage")}
                  </Button>
                </div>
              </div>
              {selectedVersion && (
                <div className="rounded-lg border border-blue-100 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-medium text-foreground">
                      {selectedVersion.version_label} {t("codeRuleDetail.segmentDetail")}
                    </h3>
                    <StatusBadge status={selectedVersion.status} />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {selectedVersion.segments.map((segment, index) => (
                      <SegmentSummary key={`${selectedVersion.id}-${index}`} segment={segment} index={index} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          </ApiState>
        </TabsContent>

        <TabsContent value="materials">
          <MaterialList fixedLibraryId={library.id} />
        </TabsContent>
        <TabsContent value="recodes">
          <RecodeRecordsPanel library={library} />
        </TabsContent>
        <TabsContent value="mappings">
          <CodeMappingsPanel library={library} />
        </TabsContent>
      </Tabs>

      {currentRule && canEdit && (
        <RuleEditor
          key={currentRule.id}
          library={library}
          currentRule={currentRule}
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          onRecodeDraft={handleRecodeDraft}
        />
      )}

      <SelectedMaterialModal
        library={library}
        isOpen={isSelectionOpen}
        isGenerating={previewMutation.isPending}
        onClose={() => setIsSelectionOpen(false)}
        onGenerate={(materialIds) => {
          if (selectedRecodeVersion) {
            startRecodePreview(selectedRecodeVersion, "selected_recode", materialIds);
          }
        }}
      />

      <RecodePreviewModal
        library={library}
        batch={previewBatch}
        isOpen={isPreviewOpen}
        isGenerating={previewMutation.isPending}
        onClose={() => setIsPreviewOpen(false)}
        onBatchUpdated={setPreviewBatch}
        onViewRecords={() => {
          setIsPreviewOpen(false);
          setActiveTab("recodes");
        }}
      />
    </div>
  );
}

function _PlaceholderPanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </section>
  );
}
