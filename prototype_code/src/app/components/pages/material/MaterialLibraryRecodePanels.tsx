import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, RefreshCw, RotateCcw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  apiClient,
  type Material,
  type MaterialCodeChangeBatch,
  type MaterialCodeChangeRow,
  type MaterialCodeMapping,
  type MaterialLibrary,
} from "@/app/api/client";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Modal } from "../../common/Modal";

const PREVIEW_PAGE_SIZE = 50;
const MAPPING_PAGE_SIZE = 10;

type ErrorBreakdown = {
  missingAttribute: number;
  codeConflict: number;
  categoryMissing: number;
};

function formatTime(value?: string | null) {
  if (!value) {
    return "-";
  }
  return value.replace("T", " ").slice(0, 19);
}

function statusTone(status: string) {
  if (["success", "executed", "active", "preview"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "failed") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (status === "rolled_back") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function rowTone(status: string, errorMessage = "") {
  if (status === "failed" || /unique|duplicate|conflict|冲突/i.test(errorMessage)) {
    return "bg-red-50 text-red-900";
  }
  return "bg-emerald-50 text-emerald-900";
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function previewRowsToCsv(rows: MaterialCodeChangeRow[], statusLabel: (status: string) => string) {
  const headers = [
    "material_name",
    "specification",
    "category_path",
    "old_code",
    "new_code",
    "status",
    "failure_reason",
  ];
  const lines = rows.map((row) =>
    [
      row.material_name,
      "",
      "",
      row.old_code,
      row.new_code,
      statusLabel(row.status),
      row.error_message,
    ].map(escapeCsv).join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

function mappingsToWorkbook(rows: MaterialCodeMapping[], statusLabel: (status: string) => string) {
  const headers = ["old_code", "new_code", "material_name", "batch_id", "change_time", "status"];
  const lines = rows.map((row) =>
    [
      row.old_code,
      row.new_code,
      row.material_name,
      row.batch_id ?? "",
      formatTime(row.created_at),
      statusLabel(row.status),
    ].map((value) => String(value ?? "").replaceAll("\t", " ")).join("\t"),
  );
  return [headers.join("\t"), ...lines].join("\n");
}

function mappingsToCsv(rows: MaterialCodeMapping[], statusLabel: (status: string) => string) {
  const headers = ["old_code", "new_code", "material_name", "batch_id", "change_time", "status"];
  const lines = rows.map((row) =>
    [
      row.old_code,
      row.new_code,
      row.material_name,
      row.batch_id ?? "",
      formatTime(row.created_at),
      statusLabel(row.status),
    ].map(escapeCsv).join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

function classifyErrors(rows: MaterialCodeChangeRow[]): ErrorBreakdown {
  return rows.reduce<ErrorBreakdown>(
    (breakdown, row) => {
      const message = row.error_message.toLowerCase();
      if (message.includes("attribute") || message.includes("属性")) {
        breakdown.missingAttribute += 1;
      }
      if (message.includes("unique") || message.includes("duplicate") || message.includes("conflict") || message.includes("冲突")) {
        breakdown.codeConflict += 1;
      }
      if (message.includes("category") || message.includes("类目")) {
        breakdown.categoryMissing += 1;
      }
      return breakdown;
    },
    { missingAttribute: 0, codeConflict: 0, categoryMissing: 0 },
  );
}

function localizedRowStatus(status: string, t: (key: string, options?: Record<string, unknown>) => string) {
  if (status === "failed") {
    return t("codeRuleRecode.statuses.failed");
  }
  return t("codeRuleRecode.statuses.passed");
}

function localizedStatus(status: string, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`codeRuleRecode.statuses.${status}`, { defaultValue: status });
}

async function allPreviewRows(batchId: number, total: number) {
  const pageSize = 100;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, index) => apiClient.recodePreviewRows(batchId, index + 1, pageSize)),
  );
  return pages.flatMap((page) => page.items);
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-medium text-gray-900">{value}</div>
    </div>
  );
}

export function RecodePreviewModal({
  library,
  batch,
  isOpen,
  isGenerating,
  onClose,
  onBatchUpdated,
  onViewRecords,
}: {
  library: MaterialLibrary;
  batch: MaterialCodeChangeBatch | null;
  isOpen: boolean;
  isGenerating: boolean;
  onClose: () => void;
  onBatchUpdated: (batch: MaterialCodeChangeBatch) => void;
  onViewRecords: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [forceEnabled, setForceEnabled] = useState(false);
  const [forceConfirmOpen, setForceConfirmOpen] = useState(false);

  const rowsQuery = useQuery({
    queryKey: ["material-recode-preview-rows", batch?.batch_id, page],
    queryFn: () => apiClient.recodePreviewRows(batch!.batch_id, page, PREVIEW_PAGE_SIZE),
    enabled: Boolean(isOpen && batch?.batch_id),
    retry: false,
  });

  const rows = rowsQuery.data?.items ?? batch?.rows ?? [];
  const total = rowsQuery.data?.total ?? batch?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PREVIEW_PAGE_SIZE));
  const breakdown = classifyErrors(batch?.rows ?? rows);
  const hasConflicts =
    breakdown.codeConflict > 0 ||
    rows.some((row) => /unique|duplicate|conflict|冲突/i.test(row.error_message));
  const canExecute = Boolean(batch && batch.status === "preview" && batch.failed_count === 0 && !hasConflicts);

  const executeMutation = useMutation({
    mutationFn: () => apiClient.executeRecodeBatch(batch!.batch_id, { confirm: true, reason: t("codeRuleRecode.executeReason") }),
    onSuccess: async (updated) => {
      onBatchUpdated(updated);
      setConfirmOpen(false);
      toast.success(t("codeRuleRecode.executeComplete"));
      await queryClient.invalidateQueries({ queryKey: ["material-recode-records", library.id] });
      await queryClient.invalidateQueries({ queryKey: ["material-code-mappings", library.id] });
      await queryClient.invalidateQueries({ queryKey: ["material-libraries"] });
      await queryClient.invalidateQueries({ queryKey: ["material-library", library.id] });
    },
    onError: (error) => toast.error(`${t("toast.saveFailed")}: ${error.message}`),
  });

  const handleDownloadCsv = async () => {
    if (!batch) {
      return;
    }
    const exportRows = await allPreviewRows(batch.batch_id, total);
    downloadTextFile(
      `recode-preview-${batch.batch_id}.csv`,
      previewRowsToCsv(exportRows, (status) => localizedRowStatus(status, t)),
      "text/csv;charset=utf-8",
    );
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={t("codeRuleRecode.previewTitle")} size="xl">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-medium text-gray-900">{t("codeRuleRecode.previewTitle")}</h2>
              <div className="mt-1 text-sm text-gray-600">
                {t("codeRuleRecode.libraryName")}: {library.name}
              </div>
              <div className="mt-1 font-mono text-sm text-gray-600">
                {t("codeRuleRecode.batchId")}: {batch?.batch_id ?? t("codeRuleRecode.generating")}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {batch && (
                <Button type="button" variant="outline" size="sm" onClick={handleDownloadCsv}>
                  <Download data-icon="inline-start" />
                  {t("codeRuleRecode.downloadCsv")}
                </Button>
              )}
              {batch?.status === "executed" && (
                <Button type="button" size="sm" onClick={onViewRecords}>
                  {t("codeRuleRecode.viewRecords")}
                </Button>
              )}
            </div>
          </div>

          {(isGenerating || rowsQuery.isLoading || executeMutation.isPending) && (
            <div role="status" className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              {executeMutation.isPending ? t("codeRuleRecode.executing") : t("codeRuleRecode.generating")}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-4">
            <SummaryCard label={t("codeRuleRecode.totalMaterials")} value={batch?.total_count ?? "-"} />
            <SummaryCard label={t("codeRuleRecode.successCount")} value={batch?.success_count ?? "-"} />
            <SummaryCard label={t("codeRuleRecode.failedCount")} value={batch?.failed_count ?? "-"} />
            <SummaryCard label={t("codeRuleRecode.status")} value={batch ? localizedStatus(batch.status, t) : "-"} />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <SummaryCard label={t("codeRuleRecode.missingAttribute")} value={breakdown.missingAttribute} />
            <SummaryCard label={t("codeRuleRecode.codeConflict")} value={breakdown.codeConflict} />
            <SummaryCard label={t("codeRuleRecode.categoryMissing")} value={breakdown.categoryMissing} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("codeRuleRecode.materialName")}</th>
                  <th className="px-3 py-2 font-medium">{t("codeRuleRecode.specification")}</th>
                  <th className="px-3 py-2 font-medium">{t("codeRuleRecode.categoryPath")}</th>
                  <th className="px-3 py-2 font-medium">{t("codeRuleRecode.oldCode")}</th>
                  <th className="px-3 py-2 font-medium">{t("codeRuleRecode.newCode")}</th>
                  <th className="px-3 py-2 font-medium">{t("codeRuleRecode.status")}</th>
                  <th className="px-3 py-2 font-medium">{t("codeRuleRecode.failureReason")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id} className={rowTone(row.status, row.error_message)}>
                    <td className="px-3 py-2 text-gray-900">{row.material_name}</td>
                    <td className="px-3 py-2 text-gray-600">-</td>
                    <td className="px-3 py-2 text-gray-600">-</td>
                    <td className="px-3 py-2 font-mono text-gray-700">{row.old_code}</td>
                    <td className="px-3 py-2 font-mono text-gray-700">{row.new_code || "-"}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={statusTone(row.status)}>
                        {localizedRowStatus(row.status, t)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{row.error_message || "-"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-gray-500" colSpan={7}>
                      {t("codeRuleRecode.emptyRows")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
            <span>{t("rules.pageSummary", { page, pages: pageCount })}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                {t("rules.previousPage")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage((value) => value + 1)}
              >
                {t("rules.nextPage")}
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {hasConflicts ? t("codeRuleRecode.conflictExecutionBlocked") : t("codeRuleRecode.externalWarning")}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("action.cancel")}
            </Button>
            {hasConflicts && (
              <label className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm text-red-700">
                <input
                  type="checkbox"
                  checked={forceEnabled}
                  onChange={(event) => setForceEnabled(event.target.checked)}
                />
                {t("codeRuleRecode.forceOption")}
              </label>
            )}
            <Button type="button" onClick={() => setConfirmOpen(true)} disabled={!canExecute || executeMutation.isPending}>
              {executeMutation.isPending ? t("codeRuleRecode.executing") : t("codeRuleRecode.execute")}
            </Button>
            {hasConflicts && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setForceConfirmOpen(true)}
                disabled={!forceEnabled || executeMutation.isPending}
              >
                {t("codeRuleRecode.forceExecute")}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("codeRuleRecode.executeConfirmTitle")}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="button" onClick={() => executeMutation.mutate()} disabled={executeMutation.isPending}>
              {executeMutation.isPending ? t("codeRuleRecode.executing") : t("codeRuleRecode.confirmExecute")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-gray-700">
          <p>{t("codeRuleRecode.executeConfirmBody", { library: library.name, count: batch?.total_count ?? 0 })}</p>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            {t("codeRuleRecode.externalWarning")}
          </p>
        </div>
      </Modal>
      <Modal
        isOpen={forceConfirmOpen}
        onClose={() => setForceConfirmOpen(false)}
        title={t("codeRuleRecode.forceConfirmTitle")}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setForceConfirmOpen(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="button" onClick={() => executeMutation.mutate()} disabled={executeMutation.isPending}>
              {executeMutation.isPending ? t("codeRuleRecode.executing") : t("codeRuleRecode.forceConfirmExecute")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-gray-700">
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">
            {t("codeRuleRecode.forceConfirmBody")}
          </p>
          <p>{t("codeRuleRecode.executeConfirmBody", { library: library.name, count: batch?.total_count ?? 0 })}</p>
        </div>
      </Modal>
    </>
  );
}

export function SelectedMaterialModal({
  library,
  isOpen,
  isGenerating,
  onClose,
  onGenerate,
}: {
  library: MaterialLibrary;
  isOpen: boolean;
  isGenerating: boolean;
  onClose: () => void;
  onGenerate: (materialIds: number[]) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const materialsQuery = useQuery({
    queryKey: ["materials", "library-selection", library.id],
    queryFn: () => apiClient.materials({ material_library_id: library.id }),
    enabled: isOpen,
    retry: false,
  });

  const materials = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (materialsQuery.data ?? [])
      .filter((material) => material.material_library_id === library.id)
      .filter((material) => {
        if (!query) {
          return true;
        }
        return [material.name, material.code, material.description].some((value) => value.toLowerCase().includes(query));
      });
  }, [library.id, materialsQuery.data, search]);

  const toggleMaterial = (material: Material) => {
    setSelectedIds((current) =>
      current.includes(material.id) ? current.filter((id) => id !== material.id) : [...current, material.id],
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("codeRuleRecode.selectMaterialsTitle")}
      size="xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button type="button" onClick={() => onGenerate(selectedIds)} disabled={selectedIds.length === 0 || isGenerating}>
            {isGenerating ? t("codeRuleRecode.generating") : t("codeRuleRecode.generatePreview")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {isGenerating && (
          <div role="status" className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            {t("codeRuleRecode.generating")}
          </div>
        )}
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          <span>{t("codeRuleRecode.searchMaterials")}</span>
          <div className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full border-0 bg-transparent text-sm outline-none"
            />
          </div>
        </label>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">{t("codeRuleRecode.select")}</th>
                <th className="px-3 py-2 font-medium">{t("codeRuleRecode.materialName")}</th>
                <th className="px-3 py-2 font-medium">{t("codeRuleRecode.oldCode")}</th>
                <th className="px-3 py-2 font-medium">{t("codeRuleRecode.categoryPath")}</th>
                <th className="px-3 py-2 font-medium">{t("field.description")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {materials.map((material) => (
                <tr key={material.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(material.id)}
                      onChange={() => toggleMaterial(material)}
                      aria-label={material.name}
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-900">{material.name}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{material.code}</td>
                  <td className="px-3 py-2 text-gray-600">{material.category}</td>
                  <td className="px-3 py-2 text-gray-600">{material.description || "-"}</td>
                </tr>
              ))}
              {materials.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={5}>
                    {materialsQuery.isLoading ? t("app.loading") : t("codeRuleRecode.emptyMaterials")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function RecodeBatchDetail({
  batch,
  library,
  onUpdated,
}: {
  batch: MaterialCodeChangeBatch;
  library: MaterialLibrary;
  onUpdated: (batch: MaterialCodeChangeBatch) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [rollbackOpen, setRollbackOpen] = useState(false);

  const rowsQuery = useQuery({
    queryKey: ["material-recode-batch-detail", batch.batch_id],
    queryFn: () => apiClient.recodePreviewRows(batch.batch_id, 1, 100),
    retry: false,
  });

  const rollbackMutation = useMutation({
    mutationFn: () => apiClient.rollbackRecodeBatch(batch.batch_id, { confirm: true, reason: t("codeRuleRecode.rollbackReason") }),
    onSuccess: async (updated) => {
      onUpdated(updated);
      setRollbackOpen(false);
      toast.success(t("codeRuleRecode.rollbackComplete"));
      await queryClient.invalidateQueries({ queryKey: ["material-recode-records", library.id] });
      await queryClient.invalidateQueries({ queryKey: ["material-code-mappings", library.id] });
      await queryClient.invalidateQueries({ queryKey: ["material-libraries"] });
      await queryClient.invalidateQueries({ queryKey: ["material-library", library.id] });
    },
    onError: (error) => toast.error(`${t("toast.saveFailed")}: ${error.message}`),
  });

  return (
    <div className="rounded-lg border border-blue-100 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-900">
            {t("codeRuleRecode.batchId")}: {batch.batch_id}
          </h3>
          <div className="mt-2 grid gap-2 text-sm text-gray-600 md:grid-cols-3">
            <span>{t("codeRuleRecode.oldVersion")}: {batch.old_rule_version_id ?? "-"}</span>
            <span>{t("codeRuleRecode.newVersion")}: {batch.new_rule_version_id ?? "-"}</span>
            <span>{t("codeRuleRecode.changeMode")}: {localizedStatus(batch.change_mode, t)}</span>
            <span>{t("codeRuleRecode.createdBy")}: super_admin</span>
            <span>{t("codeRuleRecode.createdAt")}: {formatTime(batch.created_at)}</span>
            <span>{t("codeRuleRecode.status")}: {localizedStatus(batch.status, t)}</span>
          </div>
        </div>
        {batch.status === "executed" && (
          <Button type="button" variant="outline" size="sm" onClick={() => setRollbackOpen(true)}>
            <RotateCcw data-icon="inline-start" />
            {t("codeRuleRecode.rollback")}
          </Button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.materialName")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.oldCode")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.newCode")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.status")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.failureReason")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(rowsQuery.data?.items ?? batch.rows).map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-900">{row.material_name}</td>
                <td className="px-3 py-2 font-mono text-gray-700">{row.old_code}</td>
                <td className="px-3 py-2 font-mono text-gray-700">{row.new_code || "-"}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={statusTone(row.status)}>
                    {localizedStatus(row.status, t)}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-gray-700">{row.error_message || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={rollbackOpen}
        onClose={() => setRollbackOpen(false)}
        title={t("codeRuleRecode.rollbackConfirmTitle")}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setRollbackOpen(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="button" onClick={() => rollbackMutation.mutate()} disabled={rollbackMutation.isPending}>
              {rollbackMutation.isPending ? t("codeRuleRecode.rollingBack") : t("codeRuleRecode.confirmRollback")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-gray-700">
          {rollbackMutation.isPending && (
            <div role="status" className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800">
              {t("codeRuleRecode.rollingBack")}
            </div>
          )}
          <p>{t("codeRuleRecode.rollbackConfirmBody", { batch: batch.batch_id })}</p>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            {t("codeRuleRecode.externalWarning")}
          </p>
        </div>
      </Modal>
    </div>
  );
}

export function RecodeRecordsPanel({ library }: { library: MaterialLibrary }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const batchesQuery = useQuery({
    queryKey: ["material-recode-records", library.id, page],
    queryFn: async () => {
      const mappings = await apiClient.codeMappings(library.id, { page: 1, page_size: 100 });
      const batchIds = Array.from(new Set(mappings.items.map((item) => item.batch_id).filter((id): id is number => id !== null)));
      const batches = await Promise.all(batchIds.map((batchId) => apiClient.recodeBatch(batchId)));
      return batches.sort((left, right) => right.batch_id - left.batch_id);
    },
    retry: false,
  });

  const batches = batchesQuery.data ?? [];
  const pageCount = Math.max(1, Math.ceil(batches.length / MAPPING_PAGE_SIZE));
  const visibleBatches = batches.slice((page - 1) * MAPPING_PAGE_SIZE, page * MAPPING_PAGE_SIZE);
  const selectedBatch = batches.find((batch) => batch.batch_id === selectedBatchId) ?? null;

  const handleUpdated = (updated: MaterialCodeChangeBatch) => {
    queryClient.setQueryData<MaterialCodeChangeBatch[]>(["material-recode-records", library.id, page], (current) =>
      (current ?? batches).map((batch) => (batch.batch_id === updated.batch_id ? updated : batch)),
    );
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium text-gray-900">{t("codeRuleDetail.tabs.recodes")}</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => void batchesQuery.refetch()}>
          <RefreshCw data-icon="inline-start" />
          {t("app.reload")}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.batchId")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.oldVersion")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.newVersion")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.changeMode")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.totalMaterials")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.successCount")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.failedCount")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.status")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.createdBy")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.createdAt")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleBatches.map((batch) => (
              <tr key={batch.batch_id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setSelectedBatchId(batch.batch_id)}
                    className="font-mono text-blue-700 hover:underline"
                  >
                    {batch.batch_id}
                  </button>
                </td>
                <td className="px-3 py-2 text-gray-700">{batch.old_rule_version_id ?? "-"}</td>
                <td className="px-3 py-2 text-gray-700">{batch.new_rule_version_id ?? "-"}</td>
                <td className="px-3 py-2 text-gray-700">{localizedStatus(batch.change_mode, t)}</td>
                <td className="px-3 py-2 text-gray-700">{batch.total_count}</td>
                <td className="px-3 py-2 text-gray-700">{batch.success_count}</td>
                <td className="px-3 py-2 text-gray-700">{batch.failed_count}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={statusTone(batch.status)}>
                    {localizedStatus(batch.status, t)}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-gray-700">super_admin</td>
                <td className="px-3 py-2 text-gray-700">{formatTime(batch.created_at)}</td>
              </tr>
            ))}
            {visibleBatches.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={10}>
                  {batchesQuery.isLoading ? t("app.loading") : t("codeRuleRecode.emptyBatches")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
        <span>{t("rules.pageSummary", { page, pages: pageCount })}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            {t("rules.previousPage")}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>
            {t("rules.nextPage")}
          </Button>
        </div>
      </div>

      {selectedBatch && <RecodeBatchDetail batch={selectedBatch} library={library} onUpdated={handleUpdated} />}
    </section>
  );
}

export function CodeMappingsPanel({ library }: { library: MaterialLibrary }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx">("csv");

  const mappingsQuery = useQuery({
    queryKey: ["material-code-mappings", library.id, page, batchFilter],
    queryFn: () =>
      apiClient.codeMappings(library.id, {
        page,
        page_size: 100,
        batch_id: batchFilter ? Number(batchFilter) : null,
      }),
    retry: false,
  });

  const allRows = mappingsQuery.data?.items ?? [];
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    return allRows.filter((row) => {
      const rowTime = new Date(row.created_at).getTime();
      const matchesSearch =
        !query ||
        [row.old_code, row.new_code, row.material_name, String(row.batch_id ?? "")].some((value) =>
          value.toLowerCase().includes(query),
        );
      const matchesDate = (fromTime === null || rowTime >= fromTime) && (toTime === null || rowTime <= toTime);
      return matchesSearch && matchesDate;
    });
  }, [allRows, dateFrom, dateTo, search]);

  const pageCount = Math.max(1, Math.ceil((mappingsQuery.data?.total ?? filteredRows.length) / MAPPING_PAGE_SIZE));
  const visibleRows = filteredRows.slice(0, MAPPING_PAGE_SIZE);

  const handleExport = async () => {
    if (exportFormat === "csv") {
      downloadTextFile(
        `material-code-mappings-${library.id}.csv`,
        mappingsToCsv(filteredRows, (status) => localizedStatus(status, t)),
        "text/csv;charset=utf-8",
      );
      return;
    }
    downloadTextFile(
      `material-code-mappings-${library.id}.xlsx`,
      mappingsToWorkbook(filteredRows, (status) => localizedStatus(status, t)),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8",
    );
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium text-gray-900">{t("codeRuleDetail.tabs.mappings")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span>{t("codeRuleRecode.exportFormat")}</span>
            <select
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as "csv" | "xlsx")}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="csv">{t("codeRuleRecode.exportCsv")}</option>
              <option value="xlsx">{t("codeRuleRecode.exportExcel")}</option>
            </select>
          </label>
          <Button type="button" variant="outline" size="sm" onClick={handleExport}>
            <FileSpreadsheet data-icon="inline-start" />
            {t("action.export")}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm text-gray-700 md:col-span-2">
          <span>{t("codeRuleRecode.searchMappings")}</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          <span>{t("codeRuleRecode.batchId")}</span>
          <input
            type="number"
            value={batchFilter}
            onChange={(event) => {
              setBatchFilter(event.target.value);
              setPage(1);
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>{t("codeRuleRecode.dateFrom")}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>{t("codeRuleRecode.dateTo")}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.oldCode")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.newCode")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.materialName")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.batchId")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.changeTime")}</th>
              <th className="px-3 py-2 font-medium">{t("codeRuleRecode.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleRows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-gray-700">{row.old_code}</td>
                <td className="px-3 py-2 font-mono text-gray-700">{row.new_code}</td>
                <td className="px-3 py-2 text-gray-900">{row.material_name}</td>
                <td className="px-3 py-2 font-mono text-blue-700">{row.batch_id ?? "-"}</td>
                <td className="px-3 py-2 text-gray-700">{formatTime(row.created_at)}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={statusTone(row.status)}>
                    {localizedStatus(row.status, t)}
                  </Badge>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={6}>
                  {mappingsQuery.isLoading ? t("app.loading") : t("codeRuleRecode.emptyMappings")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
        <span>{t("rules.pageSummary", { page, pages: pageCount })}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            {t("rules.previousPage")}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>
            {t("rules.nextPage")}
          </Button>
        </div>
      </div>
    </section>
  );
}
