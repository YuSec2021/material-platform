import { useState } from "react";
import { Check } from "lucide-react";

export function ApprovalMode() {
  const [selectedMode, setSelectedMode] = useState<'simple' | 'workflow'>('simple');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl text-gray-900">审批模式切换</h1>

      <div className="grid grid-cols-2 gap-6">
        <div
          onClick={() => setSelectedMode('simple')}
          className={`relative bg-white rounded-lg border-2 p-6 cursor-pointer transition-all ${
            selectedMode === 'simple'
              ? 'border-blue-600 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          {selectedMode === 'simple' && (
            <div className="absolute top-4 right-4">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            </div>
          )}
          <h3 className="text-lg text-gray-900 mb-3">简易审批</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            申请提交后直接流转至资产管理部审批，适用于简单快速的审批场景。
          </p>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">审批流程：</p>
            <p className="text-xs text-gray-700 mt-1">申请提交 → 资产管理部审批 → 完结</p>
          </div>
        </div>

        <div
          onClick={() => setSelectedMode('workflow')}
          className={`relative bg-white rounded-lg border-2 p-6 cursor-pointer transition-all ${
            selectedMode === 'workflow'
              ? 'border-blue-600 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          {selectedMode === 'workflow' && (
            <div className="absolute top-4 right-4">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            </div>
          )}
          <h3 className="text-lg text-gray-900 mb-3">工作流审批</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            多节点层级审批流程，支持自定义审批节点和审批人，适用于复杂的审批场景。
          </p>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">审批流程：</p>
            <p className="text-xs text-gray-700 mt-1">申请提交 → 部门正/副职 → 资产管理部 → 完结</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          保存设置
        </button>
      </div>
    </div>
  );
}
