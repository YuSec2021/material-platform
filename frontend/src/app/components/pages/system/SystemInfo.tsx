import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { apiClient, type SystemIcon } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const emptyIcon: SystemIcon = {
  filename: "",
  content_type: "",
  data_url: "",
};

function mutationError(error: unknown) {
  return error instanceof Error ? error.message : "后端操作失败";
}

export function SystemInfo() {
  const [systemName, setSystemName] = useState("");
  const [icon, setIcon] = useState<SystemIcon>(emptyIcon);
  const [validationMessage, setValidationMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const query = useQuery({
    queryKey: ["system-config"],
    queryFn: apiClient.systemConfig,
    retry: false,
  });

  useEffect(() => {
    if (query.data) {
      setSystemName(query.data.system_name);
      setIcon(query.data.icon ?? emptyIcon);
      setValidationMessage("");
      setSuccessMessage("");
    }
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: () => apiClient.updateSystemConfig({ system_name: systemName.trim(), icon }),
    onSuccess: (config) => {
      setSystemName(config.system_name);
      setIcon(config.icon);
      setSuccessMessage("系统信息已保存。");
    },
  });

  const handleFile = (file: File | null) => {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setIcon({
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        data_url: String(reader.result ?? ""),
      });
      setSuccessMessage("");
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!systemName.trim()) {
      setValidationMessage("系统名称不能为空。");
      setSuccessMessage("");
      return;
    }
    setValidationMessage("");
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-foreground">系统信息配置</h1>
        <p className="mt-1 text-sm text-muted-foreground">系统名称和图标元数据从后端配置读取并持久化。</p>
      </div>

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={false}
        errorLabel="系统配置加载失败"
        onRetry={() => void query.refetch()}
      >
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-col gap-6">
            <label className="flex flex-col gap-2 text-sm text-foreground">
              <span>系统名称</span>
              <Input
                type="text"
                value={systemName}
                onChange={(event) => {
                  setSystemName(event.target.value);
                  setValidationMessage("");
                  setSuccessMessage("");
                }}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
              />
            </label>

            <div className="flex flex-col gap-2 text-sm text-foreground">
              <span>系统图标</span>
              <label className="cursor-pointer rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-blue-500">
                <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <span className="block text-sm text-muted-foreground">点击上传图标文件</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  图标上传当前需要技术配置；此处保存文件名、类型和预览元数据。
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                  className="sr-only"
                />
              </label>
              {icon.data_url ? (
                <div className="flex items-center gap-3 rounded-md border border-border p-3">
                  <img src={icon.data_url} alt="当前系统图标" className="h-12 w-12 rounded-md border border-border object-cover" />
                  <div>
                    <p className="text-sm text-foreground">{icon.filename}</p>
                    <p className="text-xs text-muted-foreground">{icon.content_type}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  暂无图标预览
                </div>
              )}
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

            <div className="border-t border-border pt-4">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                aria-busy={saveMutation.isPending}
              >
                {saveMutation.isPending ? "保存中..." : "保存设置"}
              </Button>
            </div>
          </div>
        </div>
      </ApiState>
    </div>
  );
}
