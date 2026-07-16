import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { apiClient, type ReasonOption } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

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
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg text-foreground">{title}</h2>
      </div>
      <div className="mb-4 flex gap-2">
        <Input
          aria-label={`新增${title}`}
          type="text"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={`新增${title}`}
          className="flex-1 rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
        />
        <Button
          type="button"
          onClick={onAdd}
        >
          <Plus className="h-4 w-4" />
          新增
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {reasons.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">
            暂无原因选项
          </p>
        ) : (
          reasons.map((reason, index) => (
            <div key={`${reason.name}-${index}`} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span className="text-sm text-foreground">{reason.name}</span>
              <Button
                type="button"
                onClick={() => onRemove(index)}
                variant="destructive"
                size="sm"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </Button>
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
        <h1 className="text-2xl text-foreground">原因选项维护</h1>
        <p className="mt-1 text-sm text-muted-foreground">停采和停用原因独立编辑，并通过系统配置接口统一保存。</p>
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
                ? "border border-success/30 bg-success/10 text-success-foreground"
                : "border border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {successMessage || validationMessage || mutationError(saveMutation.error)}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            aria-busy={saveMutation.isPending}
          >
            {saveMutation.isPending ? "保存中..." : "保存设置"}
          </Button>
        </div>
      </ApiState>
    </div>
  );
}
