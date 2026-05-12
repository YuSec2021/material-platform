import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Package } from "lucide-react";
import { apiClient, type MaterialLibrary } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";

export function MaterialLibraryList() {
  const [searchTerm, setSearchTerm] = useState("");
  const query = useQuery({
    queryKey: ["material-libraries"],
    queryFn: apiClient.materialLibraries,
    retry: false,
  });

  const data = (query.data ?? []).filter((item) =>
    item.name.includes(searchTerm) || item.code.includes(searchTerm),
  );

  return (
    <div className="space-y-4 flex flex-col flex-1">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-gray-900">物料库管理</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" />
          新建物料库
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索物料库名称或编码..."
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
        emptyLabel="后端暂无物料库数据"
        onRetry={() => void query.refetch()}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.map((item: MaterialLibrary) => (
            <div
              key={item.id}
              className="rounded-lg border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                  <Package className="h-6 w-6 text-green-600" />
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                  {item.enabled ? "启用" : "停用"}
                </span>
              </div>
              <h3 className="mb-1 text-lg font-medium text-gray-900">{item.name}</h3>
              <p className="mb-3 font-mono text-sm text-gray-500">{item.code}</p>
              <p className="text-sm text-gray-600">{item.description || "暂无描述"}</p>
            </div>
          ))}
        </div>
      </ApiState>
    </div>
  );
}
