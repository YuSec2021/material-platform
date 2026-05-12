import { useState } from "react";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { ApprovalTimeline } from "../../common/ApprovalTimeline";
import { StatusBadge } from "../../common/StatusBadge";
import { Modal } from "../../common/Modal";

interface StopMaterial {
  id: number;
  code: string;
  name: string;
  spec: string;
  stock: number;
  reason: string;
}

export function StopPurchaseApplication() {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<StopMaterial[]>([
    { id: 1, code: "MAT003", name: "订书机-标准型", spec: "标准型", stock: 0, reason: "" },
  ]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const timelineSteps = [
    { title: "申请提交", status: "current" as const },
    { title: "部门审批", status: "pending" as const },
    { title: "资产管理部审批", status: "pending" as const },
    { title: "完结", status: "pending" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/application/stop-purchase')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex items-center justify-between flex-1">
          <h1 className="text-2xl text-gray-900">物料停采申请详情</h1>
          <StatusBadge status="draft">草稿</StatusBadge>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">单据编码</label>
            <div className="px-3 py-2 bg-white rounded-lg text-sm text-gray-900">APP2026042900003</div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">申请人员</label>
            <div className="px-3 py-2 bg-white rounded-lg text-sm text-gray-900">张三</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg text-gray-900">停采信息</h2>
        <div>
          <label className="block text-sm text-gray-700 mb-1">
            停采原因说明 <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="请输入停采原因"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm text-gray-700">
              停采物料明细 <span className="text-red-500">*</span>
            </label>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              添加物料
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">物料编码</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">物料名称</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">规格型号</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">总库存</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">停采原因</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {materials.map((material) => (
                  <tr key={material.id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{material.code}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{material.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{material.spec}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{material.stock}</td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="请输入停采原因*"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-red-600 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ApprovalTimeline steps={timelineSteps} />

      <div className="flex justify-end gap-3">
        <button className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
          保存草稿
        </button>
        <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          提交审批
        </button>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="选择物料"
        size="lg"
      >
        <p className="text-sm text-gray-600">物料选择列表（仅显示正常状态的物料）</p>
      </Modal>
    </div>
  );
}
