import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { apiClient, type Role } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";

export function RoleList() {
  const [searchTerm, setSearchTerm] = useState("");
  const query = useQuery({
    queryKey: ["roles"],
    queryFn: apiClient.roles,
    retry: false,
  });

  const data = (query.data ?? []).filter((item) =>
    item.name.includes(searchTerm) || item.code.includes(searchTerm),
  );

  const columns = [
    { header: "编号", accessor: "id" as keyof Role },
    { header: "角色名称", accessor: "name" as keyof Role },
    { header: "角色代码", accessor: "code" as keyof Role },
    { header: "描述", accessor: "description" as keyof Role },
    {
      header: "是否启用",
      accessor: (row: Role) => (
        <span className={`px-2 py-1 rounded text-xs ${row.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
          {row.enabled ? "已启用" : "已停用"}
        </span>
      ),
    },
    {
      header: "用户数",
      accessor: (row: Role) => row.user_count,
    },
    {
      header: "操作",
      accessor: () => (
        <div className="flex gap-2">
          <button className="text-blue-600 hover:underline text-sm">编辑</button>
          <button className="text-purple-600 hover:underline text-sm">绑定用户</button>
          <button className="text-orange-600 hover:underline text-sm">切换状态</button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-gray-900">角色管理</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" />
          新增角色
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索角色名称或代码..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 outline-none text-sm"
            />
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            搜索
          </button>
        </div>
      </div>

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && data.length === 0}
        emptyLabel="后端暂无角色数据"
        onRetry={() => void query.refetch()}
      >
        <DataTable data={data} columns={columns} />
      </ApiState>
    </div>
  );
}
