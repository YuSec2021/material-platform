import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Edit, Plus, Trash2 } from "lucide-react";
import { apiClient, type Category } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { DisabledBackendButton, SearchPanel } from "./standardPageUtils";

export function CategoryList() {
  const [searchTerm, setSearchTerm] = useState("");
  const query = useQuery({
    queryKey: ["categories"],
    queryFn: apiClient.categories,
    retry: false,
  });

  const data = useMemo(() => {
    const term = searchTerm.trim();
    const categories = query.data ?? [];
    if (!term) {
      return categories;
    }
    return categories.filter((item) =>
      [item.name, item.code, item.description].some((value) => value.includes(term)),
    );
  }, [query.data, searchTerm]);

  const columns = [
    { header: "编号", accessor: "id" as keyof Category },
    { header: "类目名称", accessor: "name" as keyof Category },
    { header: "类目编码", accessor: "code" as keyof Category },
    { header: "描述", accessor: "description" as keyof Category },
    {
      header: "状态",
      accessor: (row: Category) => (row.enabled ? "启用" : "停用"),
    },
    {
      header: "操作",
      accessor: () => (
        <div className="flex gap-2">
          <DisabledBackendButton compact icon={<Edit className="h-3.5 w-3.5" />}>编辑</DisabledBackendButton>
          <DisabledBackendButton compact icon={<Trash2 className="h-3.5 w-3.5" />}>删除</DisabledBackendButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-900">类目管理</h1>
          <p className="mt-1 text-sm text-gray-500">数据来自 GET /api/v1/categories，写操作等待后端接口。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DisabledBackendButton icon={<Plus className="h-4 w-4" />}>新增类目</DisabledBackendButton>
          <DisabledBackendButton icon={<Edit className="h-4 w-4" />}>编辑</DisabledBackendButton>
          <DisabledBackendButton icon={<Trash2 className="h-4 w-4" />}>删除</DisabledBackendButton>
        </div>
      </div>

      <SearchPanel value={searchTerm} onChange={setSearchTerm} placeholder="搜索类目名称、编码或描述..." />

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && data.length === 0}
        emptyLabel="后端暂无类目数据"
        onRetry={() => void query.refetch()}
      >
        <DataTable data={data} columns={columns} />
      </ApiState>
    </div>
  );
}
