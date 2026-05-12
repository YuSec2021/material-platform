import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { DataTable } from "../../common/DataTable";

interface Brand {
  id: number;
  name: string;
  code: string;
  description: string;
  logo: string;
}

const mockData: Brand[] = [
  { id: 1, name: "得力", code: "DELI", description: "办公用品品牌", logo: "" },
  { id: 2, name: "晨光", code: "CHGQ", description: "文具品牌", logo: "" },
];

export function BrandList() {
  const [searchTerm, setSearchTerm] = useState("");

  const columns = [
    { header: "编号", accessor: "id" as keyof Brand },
    { header: "品牌名称", accessor: "name" as keyof Brand },
    { header: "品牌编码", accessor: "code" as keyof Brand },
    { header: "描述", accessor: "description" as keyof Brand },
    {
      header: "Logo",
      accessor: (row: Brand) => row.logo || "未上传",
    },
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
        <h1 className="text-2xl text-gray-900">品牌管理</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" />
          新增品牌
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索品牌名称或编码..."
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
