import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Edit, Plus, Trash2 } from "lucide-react";
import { apiClient, type ProductName } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { DisabledBackendButton, SearchPanel } from "./standardPageUtils";

export function ProductNameList() {
  const [searchTerm, setSearchTerm] = useState("");
  const query = useQuery({
    queryKey: ["product-names"],
    queryFn: apiClient.productNames,
    retry: false,
  });

  const data = useMemo(() => {
    const term = searchTerm.trim();
    const productNames = query.data ?? [];
    if (!term) {
      return productNames;
    }
    return productNames.filter((item) =>
      [item.name, item.category, item.unit].some((value) => value.includes(term)),
    );
  }, [query.data, searchTerm]);

  const columns = [
    { header: "编号", accessor: "id" as keyof ProductName },
    { header: "品名", accessor: "name" as keyof ProductName },
    { header: "所属类目", accessor: "category" as keyof ProductName },
    { header: "品名单位", accessor: "unit" as keyof ProductName },
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
          <h1 className="text-2xl text-gray-900">品名管理</h1>
          <p className="mt-1 text-sm text-gray-500">仅显示后端返回的品名字段，写操作等待后端接口。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DisabledBackendButton icon={<Plus className="h-4 w-4" />}>新增品名</DisabledBackendButton>
          <DisabledBackendButton icon={<Edit className="h-4 w-4" />}>编辑</DisabledBackendButton>
          <DisabledBackendButton icon={<Trash2 className="h-4 w-4" />}>删除</DisabledBackendButton>
        </div>
      </div>

      <SearchPanel value={searchTerm} onChange={setSearchTerm} placeholder="搜索品名、类目或单位..." />

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && data.length === 0}
        emptyLabel="后端暂无品名数据"
        onRetry={() => void query.refetch()}
      >
        <DataTable data={data} columns={columns} />
      </ApiState>
    </div>
  );
}
