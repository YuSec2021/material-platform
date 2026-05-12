import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export function ReasonOptions() {
  const [stopPurchaseReasons, setStopPurchaseReasons] = useState([
    "产品已停产",
    "市场需求变化",
    "替代产品出现",
  ]);
  const [stopUseReasons, setStopUseReasons] = useState([
    "库存清空",
    "不再使用",
    "设备淘汰",
  ]);

  const addReason = (type: 'purchase' | 'use') => {
    const newReason = prompt("请输入新的原因选项:");
    if (newReason) {
      if (type === 'purchase') {
        setStopPurchaseReasons([...stopPurchaseReasons, newReason]);
      } else {
        setStopUseReasons([...stopUseReasons, newReason]);
      }
    }
  };

  const removeReason = (type: 'purchase' | 'use', index: number) => {
    if (type === 'purchase') {
      setStopPurchaseReasons(stopPurchaseReasons.filter((_, i) => i !== index));
    } else {
      setStopUseReasons(stopUseReasons.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl text-gray-900">原因选项维护</h1>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg text-gray-900">停采原因选项</h2>
            <button
              onClick={() => addReason('purchase')}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              新增选项
            </button>
          </div>
          <div className="space-y-2">
            {stopPurchaseReasons.map((reason, index) => (
              <div key={index} className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg">
                <span className="text-sm text-gray-900">{reason}</span>
                <button
                  onClick={() => removeReason('purchase', index)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg text-gray-900">停用原因选项</h2>
            <button
              onClick={() => addReason('use')}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              新增选项
            </button>
          </div>
          <div className="space-y-2">
            {stopUseReasons.map((reason, index) => (
              <div key={index} className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg">
                <span className="text-sm text-gray-900">{reason}</span>
                <button
                  onClick={() => removeReason('use', index)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
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
