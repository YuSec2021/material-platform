import { useState } from "react";
import { Search, Eye, Plus } from "lucide-react";
import { useNavigate } from "react-router";
import { DataTable } from "../../common/DataTable";
import { StatusBadge } from "../../common/StatusBadge";

interface Application {
  id: number;
  code: string;
  type: string;
  applicant: string;
  department: string;
  applyDate: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
}

interface ApplicationListProps {
  type: 'category' | 'material-code' | 'stop-purchase' | 'stop-use';
  title: string;
}

const mockData: Record<string, Application[]> = {
  category: [
    { id: 1, code: "CAT2026042900001", type: "新增物料类目", applicant: "张三", department: "技术部", applyDate: "2026-04-29", status: "pending" },
    { id: 2, code: "CAT2026042800001", type: "新增物料类目", applicant: "李四", department: "采购部", applyDate: "2026-04-28", status: "approved" },
  ],
  'material-code': [
    { id: 1, code: "MAT2026042900002", type: "新增物料编码", applicant: "王五", department: "技术部", applyDate: "2026-04-29", status: "pending" },
    { id: 2, code: "MAT2026042800002", type: "新增物料编码", applicant: "李四", department: "采购部", applyDate: "2026-04-28", status: "approved" },
    { id: 3, code: "MAT2026042700001", type: "新增物料编码", applicant: "张三", department: "技术部", applyDate: "2026-04-27", status: "rejected" },
  ],
  'stop-purchase': [
    { id: 1, code: "STP2026042900003", type: "物料停采", applicant: "赵六", department: "采购部", applyDate: "2026-04-29", status: "draft" },
    { id: 2, code: "STP2026042800003", type: "物料停采", applicant: "王五", department: "技术部", applyDate: "2026-04-28", status: "approved" },
  ],
  'stop-use': [
    { id: 1, code: "STU2026042900004", type: "物料停用", applicant: "李四", department: "采购部", applyDate: "2026-04-29", status: "pending" },
    { id: 2, code: "STU2026042700004", type: "物料停用", applicant: "王五", department: "技术部", applyDate: "2026-04-27", status: "approved" },
  ],
};

const statusMap = {
  draft: { label: "草稿", status: "draft" as const },
  pending: { label: "审批中", status: "pending" as const },
  approved: { label: "已通过", status: "approved" as const },
  rejected: { label: "已驳回", status: "rejected" as const },
};

export function ApplicationList({ type, title }: ApplicationListProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const data = mockData[type] || [];
  const filteredData = data.filter(item => {
    const matchSearch = item.code.includes(searchTerm) || item.applicant.includes(searchTerm);
    const matchStatus = statusFilter === "all" || item.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleView = (id: number) => {
    navigate(`/application/${type}/detail/${id}`);
  };

  const columns = [
    { header: "申请单号", accessor: "code" as keyof Application, width: "180px" },
    { header: "申请类型", accessor: "type" as keyof Application },
    { header: "申请人", accessor: "applicant" as keyof Application },
    { header: "所属部门", accessor: "department" as keyof Application },
    { header: "申请日期", accessor: "applyDate" as keyof Application },
    {
      header: "状态",
      accessor: (row: Application) => (
        <StatusBadge status={statusMap[row.status].status}>
          {statusMap[row.status].label}
        </StatusBadge>
      ),
      width: "100px"
    },
    {
      header: "操作",
      accessor: (row: Application) => (
        <button
          onClick={() => handleView(row.id)}
          className="flex items-center gap-1 text-blue-600 hover:underline text-sm"
        >
          <Eye className="w-4 h-4" />
          查看
        </button>
      ),
      width: "100px"
    },
  ];

  const handleCreate = () => {
    navigate(`/application/${type}/detail/new`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-gray-900">{title}</h1>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          新建申请
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索申请单号或申请人..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 outline-none text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="all">全部状态</option>
            <option value="draft">草稿</option>
            <option value="pending">审批中</option>
            <option value="approved">已通过</option>
            <option value="rejected">已驳回</option>
          </select>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            搜索
          </button>
        </div>
      </div>

      <DataTable data={filteredData} columns={columns} />
    </div>
  );
}
