import { useEffect, useState, type DragEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import {
  apiClient,
  type MaterialImportConfirmItem,
  type MaterialImportPreviewResult,
  type MaterialImportResult,
  type MaterialLibrary,
} from "@/app/api/client";
import { Button } from "@/app/components/ui/button";
import { Modal } from "../../common/Modal";
import { SearchableSelect } from "../../common/SearchableSelect";

const MATERIAL_IMPORT_ACCEPT = ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

type MaterialBulkImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  libraries: MaterialLibrary[];
  defaultLibraryId: number | "";
};

function SummaryTile({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "success" | "warning" }) {
  const toneClass =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : tone === "warning"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border bg-muted/30 text-foreground";
  return (
    <div className={`rounded-md border p-3 text-center ${toneClass}`}>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function MaterialBulkImportModal({ isOpen, onClose, libraries, defaultLibraryId }: MaterialBulkImportModalProps) {
  const queryClient = useQueryClient();
  const [libraryId, setLibraryId] = useState<number | "">(defaultLibraryId);
  const [templateExportedForLibraryId, setTemplateExportedForLibraryId] = useState<number | "">("");
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<MaterialImportPreviewResult | null>(null);
  const [result, setResult] = useState<MaterialImportResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLibraryId(defaultLibraryId);
      setTemplateExportedForLibraryId("");
      setFileName("");
      setPreview(null);
      setResult(null);
    }
  }, [isOpen]);

  const templateExported = libraryId !== "" && templateExportedForLibraryId === libraryId;

  const downloadTemplate = async () => {
    if (libraryId === "") {
      toast.error("请先选择物料库");
      return;
    }
    setIsDownloadingTemplate(true);
    try {
      const blob = await apiClient.downloadMaterialImportTemplate(Number(libraryId));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "material-import-template.xlsx";
      link.click();
      URL.revokeObjectURL(url);
      setTemplateExportedForLibraryId(libraryId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "模板导出失败");
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const previewMutation = useMutation({
    mutationFn: (file: File) => apiClient.previewMaterialImport(Number(libraryId), file),
    onSuccess: (data) => {
      setPreview(data);
      setResult(null);
    },
    onError: (error) => {
      setPreview(null);
      toast.error(`解析导入文件失败：${error.message}`);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (items: MaterialImportConfirmItem[]) => apiClient.confirmMaterialImport(Number(libraryId), items),
    onSuccess: async (data) => {
      setResult(data);
      if (data.success_count > 0) {
        toast.success(`成功导入 ${data.success_count} 条物料`);
        await queryClient.invalidateQueries({ queryKey: ["materials"] });
      }
      if (data.error_count > 0) {
        toast.error(`${data.error_count} 条物料导入失败，请查看下方详情`);
      }
    },
    onError: (error) => toast.error(`批量导入失败：${error.message}`),
  });

  const handleFile = (file: File) => {
    if (!templateExported) {
      toast.error("请先点击「导出模板」再上传填写好的文件");
      return;
    }
    setFileName(file.name);
    setResult(null);
    previewMutation.mutate(file);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const validItems: MaterialImportConfirmItem[] = (preview?.items ?? [])
    .filter((item) => item.errors.length === 0 && item.category_id !== null)
    .map((item) => ({
      row_number: item.row_number,
      material_name: item.material_name,
      category_id: item.category_id as number,
      attributes: item.attributes,
    }));

  const canConfirm = validItems.length > 0 && !confirmMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="批量添加物料"
      size="xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => confirmMutation.mutate(validItems)}
            disabled={!canConfirm}
            aria-busy={confirmMutation.isPending}
          >
            {confirmMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmMutation.isPending ? "导入中..." : `确认导入（${validItems.length} 条有效记录）`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          请按顺序操作：选择物料库 → 导出模板（模板会根据该物料库下的末级类目和所需属性自动生成）→ 按模板填写物料后上传 → 确认导入。
        </p>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="space-y-1 text-sm text-foreground">
            <span>物料库</span>
            <SearchableSelect
              ariaLabel="物料库"
              value={libraryId === "" ? "" : String(libraryId)}
              onValueChange={(value) => {
                setLibraryId(value ? Number(value) : "");
                setTemplateExportedForLibraryId("");
                setFileName("");
                setPreview(null);
                setResult(null);
              }}
              options={libraries.map((library) => ({
                value: String(library.id),
                label: library.name,
                keywords: library.code,
              }))}
              placeholder="请选择物料库"
              searchPlaceholder="搜索物料库名称或编码..."
              emptyText="暂无匹配物料库"
            />
          </label>
          <button
            type="button"
            onClick={() => void downloadTemplate()}
            disabled={libraryId === "" || isDownloadingTemplate}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDownloadingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            导出模板
          </button>
        </div>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            if (templateExported) {
              setIsDragging(true);
            }
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center ${
            !templateExported
              ? "cursor-not-allowed border-border bg-muted/10 opacity-60"
              : isDragging
                ? "cursor-pointer border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                : "cursor-pointer border-border bg-muted/20 hover:bg-muted/30"
          }`}
        >
          <UploadCloud className="mb-2 h-8 w-8 text-blue-600" />
          <span className="text-sm font-medium text-foreground">
            {templateExported ? "拖拽或点击上传填写好的物料文件" : "请先点击「导出模板」后再上传"}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">{fileName || "支持 CSV / XLSX / XLS"}</span>
          <input
            type="file"
            accept={MATERIAL_IMPORT_ACCEPT}
            disabled={!templateExported}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                handleFile(file);
              }
              event.target.value = "";
            }}
          />
        </label>

        {previewMutation.isPending && (
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在解析导入文件...
          </div>
        )}

        {preview && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryTile label="总行数" value={preview.total_rows} />
              <SummaryTile label="有效行数" value={preview.valid_count} tone="success" />
              <SummaryTile label="错误行数" value={preview.error_count} tone={preview.error_count > 0 ? "warning" : "default"} />
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 border-b border-border bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">行号</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">物料名称</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">类目</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">属性</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.items.map((item) => (
                    <tr key={item.row_number} className={item.errors.length > 0 ? "bg-destructive/5" : undefined}>
                      <td className="px-3 py-2 text-muted-foreground">{item.row_number}</td>
                      <td className="px-3 py-2 text-foreground">{item.material_name || "-"}</td>
                      <td className="px-3 py-2 text-foreground">{item.category_name || "-"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {Object.entries(item.attributes).map(([key, value]) => `${key}: ${value}`).join("；") || "-"}
                      </td>
                      <td className="px-3 py-2">
                        {item.errors.length > 0 ? (
                          <span className="inline-flex items-start gap-1 text-xs text-destructive">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {item.errors.join("；")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            可导入
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <SummaryTile label="导入成功" value={result.success_count} tone="success" />
              <SummaryTile label="导入失败" value={result.error_count} tone={result.error_count > 0 ? "warning" : "default"} />
            </div>
            {result.errors.length > 0 && (
              <ul className="space-y-1 text-xs text-destructive">
                {result.errors.map((row) => (
                  <li key={row.row_number}>
                    第 {row.row_number} 行（{row.material_name}）：{row.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
