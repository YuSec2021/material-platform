import { Upload } from "lucide-react";

export function SystemInfo() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl text-gray-900">系统信息配置</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm text-gray-700 mb-2">系统名称</label>
          <input
            type="text"
            defaultValue="AI物料中台"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-2">系统图标</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">点击或拖拽上传图标</p>
            <p className="text-xs text-gray-400 mt-1">推荐尺寸：512x512px，支持 PNG、JPG 格式</p>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
