import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { DataTable } from "../../common/DataTable";

interface User {
  id: number;
  username: string;
  company: string;
  department: string;
  team: string;
  account: string;
}

const mockData: User[] = [
  { id: 1, username: "张三", company: "总公司", department: "技术部", team: "开发组", account: "超级管理员" },
  { id: 2, username: "李四", company: "总公司", department: "采购部", team: "采购组", account: "物料管理员" },
];

export function UserList() {
  const [searchTerm, setSearchTerm] = useState("");

  const columns = [
    { header: "编号", accessor: "id" as keyof User },
    { header: "用户名", accessor: "username" as keyof User },
    { header: "单位", accessor: "company" as keyof User },
    { header: "部门", accessor: "department" as keyof User },
    { header: "班组", accessor: "team" as keyof User },
    { header: "账号归属", accessor: "account" as keyof User },
    {
      header: "操作",
      accessor: () => (
        <div className="flex gap-2">
          <button className="text-blue-600 hover:underline text-sm">编辑</button>
          <button className="text-orange-600 hover:underline text-sm">重置密码</button>
          <button className="text-red-600 hover:underline text-sm">删除</button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-gray-900">用户管理</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" />
          新增用户
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索用户名..."
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
