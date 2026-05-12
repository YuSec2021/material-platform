import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { ApprovalTimeline } from "../../common/ApprovalTimeline";
import { StatusBadge } from "../../common/StatusBadge";

export function MaterialCodeApplication() {
  const navigate = useNavigate();
  const timelineSteps = [
    { title: "申请提交", approver: "李四", time: "2026-04-28 14:00", status: "completed" as const },
    { title: "部门审批", approver: "王五", time: "2026-04-28 15:30", status: "completed" as const },
    { title: "资产管理部审批", approver: "赵六", time: "2026-04-29 09:00", status: "completed" as const },
    { title: "完结", status: "completed" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/application/material-code')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex items-center justify-between flex-1">
          <h1 className="text-2xl text-gray-900">新增物料编码申请详情</h1>
          <StatusBadge status="approved">已通过</StatusBadge>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">单据编码</label>
            <div className="px-3 py-2 bg-white rounded-lg text-sm text-gray-900">APP2026042800002</div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">申请人员</label>
            <div className="px-3 py-2 bg-white rounded-lg text-sm text-gray-900">李四</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg text-gray-900">物料信息</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">物料名称</label>
            <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-900">
              A4打印纸-白色-500张
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">最终物料编码</label>
            <div className="px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-700 font-mono">
              MAT2026042800001
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">三级类目</label>
          <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-900">
            办公用品 / 纸张 / 打印纸
          </div>
        </div>
      </div>

      <ApprovalTimeline steps={timelineSteps} />
    </div>
  );
}
