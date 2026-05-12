import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { ApprovalTimeline } from "../../common/ApprovalTimeline";
import { StatusBadge } from "../../common/StatusBadge";

export function StopUseApplication() {
  const navigate = useNavigate();
  const timelineSteps = [
    { title: "申请提交", approver: "王五", time: "2026-04-27 10:00", status: "completed" as const },
    { title: "部门审批", approver: "李四", time: "2026-04-27 14:00", status: "completed" as const },
    { title: "资产管理部审批", status: "current" as const },
    { title: "完结", status: "pending" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/application/stop-use')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex items-center justify-between flex-1">
          <h1 className="text-2xl text-gray-900">物料停用申请详情</h1>
          <StatusBadge status="pending">审批中</StatusBadge>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">单据编码</label>
            <div className="px-3 py-2 bg-white rounded-lg text-sm text-gray-900">APP2026042700004</div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">申请人员</label>
            <div className="px-3 py-2 bg-white rounded-lg text-sm text-gray-900">王五</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg text-gray-900">停用信息</h2>
        <div>
          <label className="block text-sm text-gray-700 mb-1">停用原因说明</label>
          <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-900">
            该物料已完成停采流程,且库存已清空,现申请停用
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-3">停用物料明细</label>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">物料编码</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">物料名称</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">规格型号</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">停用原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-900">MAT003</td>
                  <td className="px-4 py-3 text-sm text-gray-900">订书机-标准型</td>
                  <td className="px-4 py-3 text-sm text-gray-900">标准型</td>
                  <td className="px-4 py-3 text-sm text-gray-900">产品已停产,无法继续采购</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ApprovalTimeline steps={timelineSteps} />
    </div>
  );
}
