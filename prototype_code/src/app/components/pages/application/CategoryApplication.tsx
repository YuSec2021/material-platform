import { useState } from "react";
import { Upload, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { StatusBadge } from "../../common/StatusBadge";
import { ApprovalTimeline } from "../../common/ApprovalTimeline";

export function CategoryApplication() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    categoryLevel1: "",
    categoryLevel2: "",
    categoryLevel3: "",
    materialName: "",
    unit: "",
    definition: "",
    reference: null as File | null,
  });

  const timelineSteps = [
    { title: "申请提交", approver: "张三", time: "2026-04-29 10:00", status: "completed" as const },
    { title: "部门审批", approver: "待审批", status: "current" as const },
    { title: "资产管理部审批", status: "pending" as const },
    { title: "完结", status: "pending" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/application/category')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex items-center justify-between flex-1">
          <h1 className="text-2xl text-gray-900">新增物料类目申请详情</h1>
          <StatusBadge status="pending">审批中</StatusBadge>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">单据编码</label>
            <input
              type="text"
              value="APP2026042900001"
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">申请人员</label>
            <input
              type="text"
              value="张三"
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">所属单位</label>
            <input
              type="text"
              value="技术部"
              onChange={(e) => setFormData({ ...formData })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">申请日期</label>
            <input
              type="text"
              value="2026-04-29"
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg text-gray-900">申请内容</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">
              一级类目 <span className="text-red-500">*</span>
            </label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>请选择</option>
              <option>办公用品</option>
              <option>电子设备</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">
              二级类目 <span className="text-red-500">*</span>
            </label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>请选择</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">
              三级类目 <span className="text-red-500">*</span>
            </label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>请选择</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">
              物料名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入物料名称"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">
              品类单位 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="如：个、台、包"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">
            物料定义 <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="请输入物料定义"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-2">
            参考文件 <span className="text-red-500">*</span>
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">点击或拖拽文件上传</p>
            <p className="text-xs text-gray-400 mt-1">支持 PDF、Word、Excel 格式</p>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-2">物料图片</label>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-500 transition-colors cursor-pointer">
                <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                <p className="text-xs text-gray-600">上传图片 {i}</p>
              </div>
            ))}
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
    </div>
  );
}
