import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { apiClient, type PermissionEntry } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";

export function PermissionConfig() {
  const [expandedItems, setExpandedItems] = useState<string[]>(["system_admin"]);
  const query = useQuery({
    queryKey: ["permissions-catalog"],
    queryFn: apiClient.permissionsCatalog,
    retry: false,
  });

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, PermissionEntry[]>();
    for (const permission of query.data ?? []) {
      const current = groups.get(permission.module) ?? [];
      current.push(permission);
      groups.set(permission.module, current);
    }
    return Array.from(groups.entries()).map(([module, permissions]) => ({
      id: module,
      title: module,
      permissions,
    }));
  }, [query.data]);

  const selectedModule = groupedPermissions.find((item) => expandedItems.includes(item.id)) ?? groupedPermissions[0];

  const toggleItem = (id: string) => {
    setExpandedItems(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-gray-900">权限配置</h1>
      </div>

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && groupedPermissions.length === 0}
        emptyLabel="后端暂无权限目录"
        onRetry={() => void query.refetch()}
      >
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4 bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm text-gray-700 mb-4">功能目录</h2>
            <div className="space-y-1">
              {groupedPermissions.map((item) => (
                <div key={item.id}>
                  <button
                    onClick={() => toggleItem(item.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-sm text-gray-900"
                  >
                    {expandedItems.includes(item.id) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    {item.title}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-8 bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-sm text-gray-700 mb-4">权限配置</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">选择角色</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option>超级管理员</option>
                  <option>物料管理员</option>
                  <option>一线员工</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-3">后端权限目录</label>
                <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3">
                  {(selectedModule?.permissions ?? []).map((permission) => (
                    <label key={permission.permission_key} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        {permission.label}
                        <span className="ml-2 text-xs text-gray-400">{permission.permission_type}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="flex gap-3">
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    保存配置
                  </button>
                  <button className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                    还原默认
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ApiState>
    </div>
  );
}
