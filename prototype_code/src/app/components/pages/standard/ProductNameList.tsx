import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { DataTable } from "../../common/DataTable";

interface ProductName {
  id: number;
  name: string;
  code: string;
  category: string;
  unit: string;
}

const mockData: ProductName[] = [
  { id: 1, name: "A4打印纸", code: "PN001", category: "办公用品/纸张", unit: "包" },
  { id: 2, name: "签字笔", code: "PN002", category: "办公用品/文具", unit: "支" },
];

export function ProductNameList() {
  const [searchTerm, setSearchTerm] = useState("");

  const columns = [
    { header: "编号", accessor: "id" as keyof ProductName },
    { header: "品名", accessor: "name" as keyof ProductName },
    { header: "编码", accessor: "code" as keyof ProductName },
    { header: "所属类目", accessor: "category" as keyof ProductName },
    { header: "品名单位", accessor: "unit" as keyof ProductName },
    {
      header: "操作",
      accessor: () => (
        <div className="flex gap-2">
          <button className="text-blue-600 hover:underline text-sm">编辑</button>
          <button className="text-red-600 hover:underline text-sm">删除</button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-gray-900">品名管理</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" />
          新增品名
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索品名或编码..."
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

      <DataTable data={mockData} columns={columns} />
    </div>
  );
}
