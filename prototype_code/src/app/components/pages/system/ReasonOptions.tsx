import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { apiClient, type ReasonOption } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";

type ReasonSectionProps = {
  title: string;
  inputValue: string;
  reasons: ReasonOption[];
  onInputChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
};

function mutationError(error: unknown) {
  return error instanceof Error ? error.message : "后端操作失败";
}

function normalizeReasons(reasons: ReasonOption[]) {
  return reasons.map((reason) => ({ name: reason.name.trim(), enabled: reason.enabled }));
}

function ReasonSection({ title, inputValue, reasons, onInputChange, onAdd, onRemove }: ReasonSectionProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg text-gray-900">{title}</h2>
      </div>
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={`新增${title}`}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          新增
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {reasons.length === 0 ? (
          <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
            暂无原因选项
          </p>
        ) : (
          reasons.map((reason, index) => (
            <div key={`${reason.name}-${index}`} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2">
              <span className="text-sm text-gray-900">{reason.name}</span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function ReasonOptions() {
  const [stopPurchaseReasons, setStopPurchaseReasons] = useState<ReasonOption[]>([]);
  const [stopUseReasons, setStopUseReasons] = useState<ReasonOption[]>([]);
  const [purchaseInput, setPurchaseInput] = useState("");
  const [useInput, setUseInput] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const query = useQuery({
    queryKey: ["system-config"],
    queryFn: apiClient.systemConfig,
    retry: false,
  });

  useEffect(() => {
    if (query.data) {
      setStopPurchaseReasons(query.data.stop_purchase_reasons);
      setStopUseReasons(query.data.stop_use_reasons);
      setValidationMessage("");
      setSuccessMessage("");
    }
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.updateSystemConfig({
        stop_purchase_reasons: normalizeReasons(stopPurchaseReasons),
        stop_use_reasons: normalizeReasons(stopUseReasons),
      }),
    onSuccess: (config) => {
      setStopPurchaseReasons(config.stop_purchase_reasons);
      setStopUseReasons(config.stop_use_reasons);
      setSuccessMessage("原因选项已保存。");
    },
  });

  const addReason = (type: "purchase" | "use") => {
    const value = type === "purchase" ? purchaseInput.trim() : useInput.trim();
    if (!value) {
      setValidationMessage("原因选项不能为空。");
      setSuccessMessage("");
      return;
    }
    const reason = { name: value, enabled: true };
    if (type === "purchase") {
      setStopPurchaseReasons((current) => [...current, reason]);
      setPurchaseInput("");
    } else {
      setStopUseReasons((current) => [...current, reason]);
      setUseInput("");
    }
    setValidationMessage("");
    setSuccessMessage("");
  };

  const removeReason = (type: "purchase" | "use", index: number) => {
    if (type === "purchase") {
      setStopPurchaseReasons((current) => current.filter((_, currentIndex) => currentIndex !== index));
    } else {
      setStopUseReasons((current) => current.filter((_, currentIndex) => currentIndex !== index));
    }
    setSuccessMessage("");
  };

  const handleSave = () => {
    const hasBlank = [...stopPurchaseReasons, ...stopUseReasons].some((reason) => !reason.name.trim());
    if (hasBlank) {
      setValidationMessage("原因选项不能为空。");
      setSuccessMessage("");
      return;
    }
    setValidationMessage("");
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-gray-900">原因选项维护</h1>
        <p className="mt-1 text-sm text-gray-500">停采和停用原因独立编辑，并通过系统配置接口统一保存。</p>
      </div>

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={false}
        errorLabel="系统配置加载失败"
        onRetry={() => void query.refetch()}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <ReasonSection
            title="停采原因"
            inputValue={purchaseInput}
            reasons={stopPurchaseReasons}
            onInputChange={setPurchaseInput}
            onAdd={() => addReason("purchase")}
            onRemove={(index) => removeReason("purchase", index)}
          />
          <ReasonSection
            title="停用原因"
            inputValue={useInput}
            reasons={stopUseReasons}
            onInputChange={setUseInput}
            onAdd={() => addReason("use")}
            onRemove={(index) => removeReason("use", index)}
          />
        </div>

        {(validationMessage || saveMutation.isError || successMessage) && (
          <div
            className={`rounded-md px-4 py-3 text-sm ${
              successMessage && !validationMessage && !saveMutation.isError
                ? "border border-green-200 bg-green-50 text-green-700"
                : "border border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {successMessage || validationMessage || mutationError(saveMutation.error)}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="rounded-md bg-blue-600 px-6 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {saveMutation.isPending ? "保存中..." : "保存设置"}
          </button>
        </div>
      </ApiState>
    </div>
  );
}
