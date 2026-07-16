import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, RotateCcw, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiClient, type PermissionEntry, type Role } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";

type PermissionModule = {
  id: string;
  title: string;
  permissions: PermissionEntry[];
};

function groupByModule(permissions: PermissionEntry[]): PermissionModule[] {
  const groups = new Map<string, PermissionEntry[]>();
  for (const permission of permissions) {
    const current = groups.get(permission.module) ?? [];
    current.push(permission);
    groups.set(permission.module, current);
  }

  return Array.from(groups.entries()).map(([module, modulePermissions]) => ({
    id: module,
    title: module,
    permissions: modulePermissions.sort((left, right) =>
      `${left.permission_type}:${left.permission_key}`.localeCompare(`${right.permission_type}:${right.permission_key}`),
    ),
  }));
}

function groupByType(permissions: PermissionEntry[]) {
  const groups = new Map<string, PermissionEntry[]>();
  for (const permission of permissions) {
    const current = groups.get(permission.permission_type) ?? [];
    current.push(permission);
    groups.set(permission.permission_type, current);
  }
  return Array.from(groups.entries());
}

function loadedKeys(permissions: PermissionEntry[] | undefined) {
  return new Set((permissions ?? []).map((permission) => permission.permission_key));
}

function mutationError(error: unknown) {
  return error instanceof Error ? error.message : "后端操作失败";
}

function operationLabel(t: (key: string) => string, permissionType: string): string {
  const map: Record<string, string> = {
    GET: t("permission.operation.view"),
    POST: t("permission.operation.create"),
    PUT: t("permission.operation.edit"),
    PATCH: t("permission.operation.edit"),
    DELETE: t("permission.operation.delete"),
    approve: t("permission.operation.approve"),
    reject: t("permission.operation.reject"),
    list: t("permission.operation.list"),
    export: t("permission.operation.export"),
    import: t("permission.operation.import"),
  };
  return map[permissionType] ?? (() => {
    const translated = t(`permission.type.${permissionType}` as const);
    return translated === `permission.type.${permissionType}` ? permissionType : translated;
  })();
}

function moduleLabel(t: (key: string) => string, moduleKey: string): string {
  const key = `permission.module.${moduleKey}` as const;
  const translated = t(key);
  if (translated !== key) return translated;
  // Fallback: snake_case -> Title Case
  return moduleKey
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function catalogForModule(moduleKey: string): string {
  if (moduleKey.includes("category_management") || moduleKey.includes("category_library") || moduleKey.includes("attribute_management") ||
      moduleKey.includes("brand") || moduleKey.includes("product_name") || moduleKey.includes("code_rule")) {
    return "standards";
  }
  if (moduleKey.includes("material_archives") || moduleKey.includes("material_library") ||
      moduleKey.includes("material_code") || moduleKey === "material") {
    return "materials";
  }
  if (moduleKey.includes("application")) {
    return "applications";
  }
  return "system";
}

function catalogLabel(t: (key: string) => string, moduleKey: string): string {
  const catalog = catalogForModule(moduleKey);
  return t(`permission.catalog.${catalog}`);
}

export function PermissionConfig() {
  const { t } = useTranslation();
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedPermissionKeys, setSelectedPermissionKeys] = useState<Set<string>>(new Set());
  const [saveMessage, setSaveMessage] = useState("");

  const catalogQuery = useQuery({
    queryKey: ["permissions-catalog"],
    queryFn: apiClient.permissionsCatalog,
    retry: false,
  });

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: apiClient.roles,
    retry: false,
  });

  const modules = useMemo(() => groupByModule(catalogQuery.data ?? []), [catalogQuery.data]);

  useEffect(() => {
    if (!selectedModuleId && modules.length > 0) {
      const firstModule = modules[0];
      if (firstModule) {
        setSelectedModuleId(firstModule.id);
      }
    }
  }, [modules, selectedModuleId]);

  useEffect(() => {
    if (!selectedRoleId && rolesQuery.data && rolesQuery.data.length > 0) {
      const firstEditableRole =
        rolesQuery.data.find((role) => role.code !== "super_admin" && role.name !== "超级管理员") ?? rolesQuery.data[0];
      if (firstEditableRole) {
        setSelectedRoleId(String(firstEditableRole.id));
      }
    }
  }, [rolesQuery.data, selectedRoleId]);

  const rolePermissionsQuery = useQuery({
    queryKey: ["roles", selectedRoleId, "permissions"],
    queryFn: () => apiClient.rolePermissions(Number(selectedRoleId)),
    enabled: Boolean(selectedRoleId),
    retry: false,
  });

  useEffect(() => {
    if (rolePermissionsQuery.data) {
      setSelectedPermissionKeys(loadedKeys(rolePermissionsQuery.data.permissions));
      setSaveMessage("");
    }
  }, [rolePermissionsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => apiClient.saveRolePermissions(Number(selectedRoleId), Array.from(selectedPermissionKeys).sort()),
    onSuccess: (result) => {
      setSelectedPermissionKeys(loadedKeys(result.permissions));
      setSaveMessage("权限配置已保存。");
    },
  });

  const selectedModule = modules.find((module) => module.id === selectedModuleId) ?? modules[0];
  const selectedRole = rolesQuery.data?.find((role: Role) => String(role.id) === selectedRoleId);
  const lastLoadedKeys = loadedKeys(rolePermissionsQuery.data?.permissions);

  const togglePermission = (permissionKey: string) => {
    setSaveMessage("");
    setSelectedPermissionKeys((current) => {
      const next = new Set(current);
      if (next.has(permissionKey)) {
        next.delete(permissionKey);
      } else {
        next.add(permissionKey);
      }
      return next;
    });
  };

  const resetToLoaded = () => {
    setSelectedPermissionKeys(lastLoadedKeys);
    setSaveMessage("已还原为当前后端权限状态。");
  };

  const isLoading = catalogQuery.isLoading || rolesQuery.isLoading || rolePermissionsQuery.isLoading;
  const isError = catalogQuery.isError || rolesQuery.isError || rolePermissionsQuery.isError;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-foreground">权限配置</h1>
        <p className="mt-1 text-sm text-muted-foreground">按角色编辑后端目录、API 和按钮权限，保存后由 RBAC 接口持久化。</p>
      </div>

      <ApiState
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && !isError && (modules.length === 0 || (rolesQuery.data ?? []).length === 0)}
        emptyLabel="后端暂无权限目录或角色数据"
        onRetry={() => {
          void catalogQuery.refetch();
          void rolesQuery.refetch();
          void rolePermissionsQuery.refetch();
        }}
      >
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4 rounded-lg border border-border bg-card p-4">
            <h2 className="mb-4 text-sm font-medium text-foreground">{t("permission.catalog.system")}</h2>
            <div className="flex flex-col gap-1">
              {modules.map((module) => (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setSelectedModuleId(module.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selectedModuleId === module.id ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "text-foreground hover:bg-accent"
                  }`}
                >
                  <span>{moduleLabel(t, module.id)}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {module.permissions.length}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="col-span-8 rounded-lg border border-border bg-card p-6">
            <div className="mb-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <label className="flex flex-col gap-2 text-sm text-foreground">
                <span>选择角色</span>
                <select
                  value={selectedRoleId}
                  onChange={(event) => setSelectedRoleId(event.target.value)}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
                >
                  {(rolesQuery.data ?? []).map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}（{role.code}）
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-sm text-muted-foreground">
                当前角色：{selectedRole?.name ?? "未选择"}
              </div>
            </div>

            <div className="rounded-lg border border-border">
              <div className="border-b border-border bg-muted/40 px-4 py-3">
                <h2 className="text-sm font-medium text-foreground">{catalogLabel(t, selectedModule?.id ?? "")} / {moduleLabel(t, selectedModule?.id ?? "")}</h2>
              </div>
              <div className="max-h-[28rem] overflow-y-auto p-4">
                {groupByType(selectedModule?.permissions ?? []).map(([type, permissions]) => (
                  <fieldset key={type} className="mb-5 last:mb-0">
                    <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {operationLabel(t, type)}
                    </legend>
                    <div className="grid gap-2 md:grid-cols-2">
                      {permissions.map((permission) => (
                        <label
                          key={permission.permission_key}
                          className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPermissionKeys.has(permission.permission_key)}
                            onChange={() => togglePermission(permission.permission_key)}
                            className="mt-0.5 h-4 w-4 rounded border-border"
                          />
                          <span>
                            <span className="block text-foreground">{operationLabel(t, permission.permission_type)}</span>
                            <span className="block break-all text-xs text-muted-foreground">{moduleLabel(t, permission.module)}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="text-sm">
                {saveMutation.isError && <span className="text-red-700">{mutationError(saveMutation.error)}</span>}
                {saveMessage && !saveMutation.isError && <span className="text-green-700">{saveMessage}</span>}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={resetToLoaded}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/40"
                >
                  <RotateCcw className="h-4 w-4" />
                  重置
                </button>
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={!selectedRoleId || saveMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? "保存中..." : "保存配置"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </ApiState>
    </div>
  );
}
