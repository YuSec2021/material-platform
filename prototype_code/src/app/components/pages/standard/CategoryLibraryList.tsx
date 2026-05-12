import { Database, Edit, Plus, Trash2 } from "lucide-react";
import { DisabledBackendButton } from "./standardPageUtils";

export function CategoryLibraryList() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-900">类目库管理</h1>
          <p className="mt-1 text-sm text-gray-500">类目库后端接口尚未实现，当前页面只显示安全的不可写状态。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DisabledBackendButton icon={<Plus className="h-4 w-4" />}>新增类目库</DisabledBackendButton>
          <DisabledBackendButton icon={<Edit className="h-4 w-4" />}>编辑</DisabledBackendButton>
          <DisabledBackendButton icon={<Trash2 className="h-4 w-4" />}>删除</DisabledBackendButton>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        backend not implemented
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <Database className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-gray-700">后端暂无类目库接口</p>
        <p className="mt-1 text-sm text-gray-500">未渲染任何硬编码类目库数据，写操作已禁用。</p>
      </div>
    </div>
  );
}
