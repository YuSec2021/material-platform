import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { useMutation, type QueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileInput, RefreshCcw, Search, Sparkles } from "lucide-react";
import {
  apiClient,
  type MaterialAddPreviewResult,
  type MaterialGovernancePreviewResult,
  type MaterialMatch,
} from "@/app/api/client";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Modal } from "../../common/Modal";

export type AiModalType = "治理" | "添加" | "匹配";

type MaterialAIModalProps = {
  isOpen: boolean;
  type: AiModalType;
  selectedLibraryId: number | "";
  selectedCategoryId: number | "";
  onClose: () => void;
  queryClient: QueryClient;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function normalizeGovernanceItems(result: MaterialGovernancePreviewResult | null) {
  if (!result) {
    return [];
  }
  return result.items ?? result.rows ?? result.changes ?? [];
}

function valueText(value: unknown) {
  if (Array.isArray(value)) {
    return value.join(" / ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value ?? "-");
}

function attributeEntries(preview: MaterialAddPreviewResult | null) {
  if (!preview) {
    return [];
  }
  const proposed = asRecord(preview.proposed_material);
  const source = preview.recommended_attributes ?? preview.attributes ?? proposed.attributes;
  if (Array.isArray(source)) {
    return source.map((item, index) => {
      const record = asRecord(item);
      return [String(record.name ?? `属性${index + 1}`), valueText(record.value ?? record.recommended_value ?? item)] as const;
    });
  }
  return Object.entries(asRecord(source)).map(([key, value]) => [key, valueText(value)] as const);
}

function previewText(preview: MaterialAddPreviewResult | null, key: "category" | "product_name") {
  if (!preview) {
    return "-";
  }
  const proposed = asRecord(preview.proposed_material);
  const categoryPath = preview.category_path ?? proposed.category_path;
  if (key === "category" && categoryPath) {
    return valueText(categoryPath);
  }
  return valueText(preview[key] ?? proposed[key]);
}

function normalizeMatches(result: unknown): MaterialMatch[] {
  const record = asRecord(result);
  const matches = record.matches ?? record.top_matches ?? record.results;
  return Array.isArray(matches) ? matches.slice(0, 3).map((item) => asRecord(item) as MaterialMatch) : [];
}

function confidencePercent(match: MaterialMatch) {
  const raw = Number(match.confidence ?? match.score ?? match.total_score ?? 0);
  return raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
}

function confidenceClass(percent: number) {
  if (percent >= 90) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (percent >= 75) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function matchIdentity(match: MaterialMatch) {
  const nested = asRecord(match.material);
  const code = match.material_code ?? match.code ?? nested.code;
  const name = match.material_name ?? match.name ?? nested.name;
  return {
    code: valueText(code),
    name: valueText(name),
    productName: valueText(match.product_name ?? nested.product_name),
    brand: valueText(match.brand ?? nested.brand),
  };
}

function modalTitle(type: AiModalType) {
  if (type === "治理") {
    return "AI物料治理";
  }
  if (type === "添加") {
    return "AI自然语言添加";
  }
  return "AI向量匹配";
}

export function MaterialAIModal({ isOpen, type, selectedLibraryId, selectedCategoryId, onClose, queryClient }: MaterialAIModalProps) {
  const [governanceFile, setGovernanceFile] = useState<File | null>(null);
  const [governancePreview, setGovernancePreview] = useState<MaterialGovernancePreviewResult | null>(null);
  const [governanceSuccess, setGovernanceSuccess] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState("");
  const [addPreview, setAddPreview] = useState<MaterialAddPreviewResult | null>(null);
  const [addSuccess, setAddSuccess] = useState("");
  const [matchQuery, setMatchQuery] = useState("");
  const [matchResult, setMatchResult] = useState<unknown>(null);
  const libraryId = selectedLibraryId === "" ? null : Number(selectedLibraryId);
  const categoryId = selectedCategoryId === "" ? null : Number(selectedCategoryId);
  const governanceItems = useMemo(() => normalizeGovernanceItems(governancePreview), [governancePreview]);
  const matches = useMemo(() => normalizeMatches(matchResult), [matchResult]);

  useEffect(() => {
    if (!isOpen) {
      setGovernanceFile(null);
      setGovernancePreview(null);
      setGovernanceSuccess("");
      setDescription("");
      setDescriptionError("");
      setAddPreview(null);
      setAddSuccess("");
      setMatchQuery("");
      setMatchResult(null);
    }
  }, [isOpen, type]);

  const governancePreviewMutation = useMutation({
    mutationFn: async () => {
      if (!governanceFile || !libraryId) {
        throw new Error("请选择物料库和 Excel/CSV 文件");
      }
      const fileContent = await readFileAsDataUrl(governanceFile);
      return apiClient.previewMaterialGovernance({
        material_library_id: libraryId,
        category_id: categoryId,
        file_name: governanceFile.name,
        file_content: fileContent,
      });
    },
    onSuccess: (result) => {
      setGovernancePreview(result);
      setGovernanceSuccess("");
    },
  });

  const governanceImportMutation = useMutation({
    mutationFn: () => {
      if (!libraryId) {
        throw new Error("请选择物料库");
      }
      return apiClient.importMaterialGovernance({
        material_library_id: libraryId,
        category_id: categoryId,
        items: governanceItems,
      });
    },
    onSuccess: async () => {
      setGovernanceSuccess("批量写入成功，物料列表已刷新。");
      setGovernancePreview(null);
      setGovernanceFile(null);
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });

  const addPreviewMutation = useMutation({
    mutationFn: () => {
      if (!libraryId) {
        throw new Error("请选择物料库");
      }
      return apiClient.previewMaterialAdd({
        input_text: description.trim(),
        material_library_id: libraryId,
        category_id: categoryId,
      });
    },
    onSuccess: (result) => {
      setAddPreview(result);
      setDescriptionError("");
      setAddSuccess("");
    },
  });

  const addConfirmMutation = useMutation({
    mutationFn: () => {
      if (!addPreview) {
        throw new Error("请先完成预览分析");
      }
      return apiClient.confirmMaterialAdd({ preview: addPreview });
    },
    onSuccess: async () => {
      setAddSuccess("物料创建成功，物料列表已刷新。");
      setAddPreview(null);
      setDescription("");
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });

  const matchMutation = useMutation({
    mutationFn: () => {
      if (!libraryId) {
        throw new Error("请选择物料库");
      }
      return apiClient.matchMaterials({
        material_library_id: libraryId,
        query: matchQuery.trim(),
        top_k: 3,
      });
    },
    onSuccess: (result) => setMatchResult(result),
  });

  const analyzeDescription = () => {
    if (!description.trim()) {
      setDescriptionError("请输入物料描述后再分析。");
      return;
    }
    addPreviewMutation.mutate();
  };

  const footer = (
    <>
      <Button type="button" variant="outline" onClick={onClose}>
        关闭
      </Button>
      {type === "治理" && (
        <Button
          type="button"
          onClick={() => governanceImportMutation.mutate()}
          disabled={governanceItems.length === 0 || governanceImportMutation.isPending}
        >
          {governanceImportMutation.isPending ? "写入中..." : "确认批量写入"}
        </Button>
      )}
      {type === "添加" && (
        <Button type="button" onClick={() => addConfirmMutation.mutate()} disabled={!addPreview || addConfirmMutation.isPending}>
          {addConfirmMutation.isPending ? "创建中..." : "确认创建"}
        </Button>
      )}
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle(type)} size="xl" footer={footer}>
      {type === "治理" && (
        <div className="space-y-5">
          <label className="block rounded-lg border-2 border-dashed border-gray-300 p-5 text-center text-sm text-gray-600 hover:border-blue-400">
            <FileInput className="mx-auto mb-2 h-8 w-8 text-gray-400" />
            <span className="block font-medium text-gray-900">上传 Excel 或 CSV 文件</span>
            <span className="mt-1 block text-xs text-gray-500">{governanceFile?.name ?? "支持 .csv 和 .xlsx"}</span>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setGovernanceFile(event.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => governancePreviewMutation.mutate()}
            disabled={!governanceFile || governancePreviewMutation.isPending || !libraryId}
          >
            <Sparkles className="h-4 w-4" />
            {governancePreviewMutation.isPending ? "分析中..." : "分析预览"}
          </Button>
          {governancePreviewMutation.isPending && (
            <div className="space-y-2" aria-label="AI治理预览加载中">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-4/5" />
            </div>
          )}
          {governancePreviewMutation.isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              预览失败：{governancePreviewMutation.error.message}
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => governancePreviewMutation.mutate()}>
                <RefreshCcw className="h-4 w-4" />
                重试
              </Button>
            </div>
          )}
          {governanceItems.length === 0 && !governancePreviewMutation.isPending && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">暂无预览行</div>
          )}
          {governanceItems.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">源行</th>
                    <th className="px-3 py-2 text-left">Before</th>
                    <th className="px-3 py-2 text-left">After</th>
                    <th className="px-3 py-2 text-left">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {governanceItems.map((item, index) => (
                    <tr key={`${valueText(item.source_row)}-${index}`}>
                      <td className="px-3 py-2">{valueText(item.source_row ?? index + 1)}</td>
                      <td className="px-3 py-2 text-gray-600">{valueText(item.original ?? item.raw ?? item.source ?? governanceFile?.name)}</td>
                      <td className="px-3 py-2">
                        {valueText(item.name)} / {valueText(item.product_name)} / {valueText(item.category)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{valueText(item.validation_status ?? "changed")}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {governanceImportMutation.isError && <p className="text-sm text-red-600">写入失败：{governanceImportMutation.error.message}</p>}
          {governanceSuccess && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {governanceSuccess}
            </div>
          )}
        </div>
      )}

      {type === "添加" && (
        <div className="space-y-5">
          <label className="space-y-2 text-sm text-gray-700">
            <span>物料描述</span>
            <textarea
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setDescriptionError("");
              }}
              rows={5}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="例如：新增一款华为工业交换机，8口千兆，导轨安装..."
            />
          </label>
          <Button type="button" variant="outline" onClick={analyzeDescription} disabled={!description.trim() || addPreviewMutation.isPending || !libraryId}>
            <Sparkles className="h-4 w-4" />
            {addPreviewMutation.isPending ? "分析中..." : "分析预览"}
          </Button>
          {descriptionError && <p className="text-sm text-red-600">{descriptionError}</p>}
          {addPreviewMutation.isPending && (
            <div className="space-y-2" aria-label="自然语言添加预览加载中">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-11/12" />
              <Skeleton className="h-10 w-10/12" />
            </div>
          )}
          {addPreviewMutation.isError && <p className="text-sm text-red-600">预览失败：{addPreviewMutation.error.message}</p>}
          {addPreview && (
            <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-500">Linked category path</p>
                  <p className="mt-1 text-sm text-gray-900">{previewText(addPreview, "category")}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Linked product name</p>
                  <p className="mt-1 text-sm text-gray-900">{previewText(addPreview, "product_name")}</p>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs text-gray-500">Recommended attribute values</p>
                <div className="flex flex-wrap gap-2">
                  {attributeEntries(addPreview).map(([key, value]) => (
                    <Badge key={key} variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                      {key}: {value}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
          {addConfirmMutation.isError && <p className="text-sm text-red-600">创建失败：{addConfirmMutation.error.message}</p>}
          {addSuccess && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {addSuccess}
            </div>
          )}
        </div>
      )}

      {type === "匹配" && (
        <div className="space-y-5">
          <label className="space-y-2 text-sm text-gray-700">
            <span>匹配查询</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={matchQuery}
                onChange={(event) => setMatchQuery(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="输入物料名称、品牌、规格或描述"
              />
              <Button type="button" onClick={() => matchMutation.mutate()} disabled={!matchQuery.trim() || matchMutation.isPending || !libraryId}>
                <Search className="h-4 w-4" />
                {matchMutation.isPending ? "匹配中..." : "匹配"}
              </Button>
            </div>
          </label>
          {matchMutation.isPending && (
            <div className="space-y-2" aria-label="向量匹配加载中">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}
          {matchMutation.isError && <p className="text-sm text-red-600">匹配失败：{matchMutation.error.message}</p>}
          {matchResult && matches.length === 0 && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-600">暂无匹配结果</div>
          )}
          {matches.length > 0 && (
            <div className="space-y-3">
              {matches.map((match, index) => {
                const identity = matchIdentity(match);
                const percent = confidencePercent(match);
                return (
                  <div key={`${identity.code}-${index}`} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-gray-500">{identity.code}</p>
                        <p className="mt-1 text-sm font-medium text-gray-900">{identity.name}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {identity.productName} / {identity.brand}
                        </p>
                      </div>
                      <Badge variant="outline" className={confidenceClass(percent)}>
                        {percent}% confidence
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm">
                        查看物料
                      </Button>
                      <Button type="button" variant="outline" size="sm">
                        用作参考
                      </Button>
                      <Button type="button" variant="outline" size="sm">
                        标记重复
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
