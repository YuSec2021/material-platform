import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { apiClient, type SystemConfig } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { Button } from "../../ui/button";

type ApprovalModeValue = SystemConfig["approval_mode"];

const modes: {
  value: ApprovalModeValue;
  title: string;
  description: string;
  flow: string;
}[] = [
  {
    value: "simple",
    title: "简易审批",
    description: "申请提交后直接流转至资产管理部审批，适用于简单快速的审批场景。",
    flow: "申请提交 -> 资产管理部审批 -> 完结",
  },
  {
    value: "multi_node",
    title: "工作流审批",
    description: "多节点层级审批流程，支持部门和资产管理部审批，适用于复杂场景。",
    flow: "申请提交 -> 部门正/副职 -> 资产管理部 -> 完结",
  },
];

function mutationError(error: unknown) {
  return error instanceof Error ? error.message : "后端操作失败";
}

export function ApprovalMode() {
  const [selectedMode, setSelectedMode] = useState<ApprovalModeValue>("multi_node");
  const [successMessage, setSuccessMessage] = useState("");

  const query = useQuery({
    queryKey: ["system-config"],
    queryFn: apiClient.systemConfig,
    retry: false,
  });

  useEffect(() => {
    if (query.data) {
      setSelectedMode(query.data.approval_mode);
      setSuccessMessage("");
    }
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: () => apiClient.updateSystemConfig({ approval_mode: selectedMode }),
    onSuccess: (config) => {
      setSelectedMode(config.approval_mode);
      setSuccessMessage("审批模式已保存。");
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-foreground">审批模式切换</h1>
        <p className="mt-1 text-sm text-muted-foreground">选择简易审批或工作流审批，并写入系统配置。</p>
      </div>

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={false}
        errorLabel="系统配置加载失败"
        onRetry={() => void query.refetch()}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {modes.map((mode) => {
            const selected = selectedMode === mode.value;
            return (
              <Button
                key={mode.value}
                type="button"
                onClick={() => {
                  setSelectedMode(mode.value);
                  setSuccessMessage("");
                }}
                aria-pressed={selected}
                className={`relative rounded-lg border-2 bg-card p-6 text-left transition-all ${
                  selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"
                }`}
              >
                {selected && (
                  <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                    <Check className="h-4 w-4 text-white" />
                  </span>
                )}
                <span className="block pr-8 text-lg text-foreground">{mode.title}</span>
                <span className="mt-3 block text-sm leading-relaxed text-muted-foreground">{mode.description}</span>
                <span className="mt-4 block border-t border-border pt-4 text-xs text-muted-foreground">审批流程</span>
                <span className="mt-1 block text-xs text-foreground">{mode.flow}</span>
              </Button>
            );
          })}
        </div>

        {(saveMutation.isError || successMessage) && (
          <div
            className={`rounded-md px-4 py-3 text-sm ${
              successMessage && !saveMutation.isError
                ? "border border-success/30 bg-success/10 text-success-foreground"
                : "border border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {successMessage || mutationError(saveMutation.error)}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
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
