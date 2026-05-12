import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Sparkles, FileInput } from "lucide-react";
import { apiClient, type Attribute } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";

export function AttributeList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiModalType, setAiModalType] = useState<'治理' | '推荐'>('治理');
  const query = useQuery({
    queryKey: ["attributes"],
    queryFn: apiClient.attributes,
    retry: false,
  });

  const data = (query.data ?? []).filter((item) =>
    item.name.includes(searchTerm) || item.product_name.includes(searchTerm),
  );

  const columns = [
    { header: "编号", accessor: "id" as keyof Attribute },
    { header: "属性名称", accessor: "name" as keyof Attribute },
    { header: "属性类型", accessor: "data_type" as keyof Attribute },
    {
      header: "是否必填",
      accessor: (row: Attribute) => (row.required ? "是" : "否"),
    },
    { header: "默认值", accessor: "default_value" as keyof Attribute },
    {
      header: "操作",
      accessor: () => (
        <div className="flex gap-2">
          <button className="text-blue-600 hover:underline text-sm">编辑</button>
          <button className="text-orange-600 hover:underline text-sm">日志</button>
          <button className="text-red-600 hover:underline text-sm">删除</button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-gray-900">属性管理</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setAiModalType('治理'); setIsAIModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 shadow-md"
          >
            <Sparkles className="w-4 h-4" />
            AI属性治理
          </button>
          <button
            onClick={() => { setAiModalType('推荐'); setIsAIModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 shadow-md"
          >
            <Sparkles className="w-4 h-4" />
            AI属性推荐
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" />
            新增属性
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索属性名称..."
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

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && data.length === 0}
        emptyLabel="后端暂无属性数据"
        onRetry={() => void query.refetch()}
      >
        <DataTable data={data} columns={columns} />
      </ApiState>

      <Modal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        title={aiModalType === '治理' ? 'AI属性治理' : 'AI属性推荐'}
        footer={
          <>
            <button
              onClick={() => setIsAIModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700">
              {aiModalType === '治理' ? '开始分析' : '开始推荐'}
            </button>
          </>
        }
      >
        {aiModalType === '治理' ? (
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-purple-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm text-purple-900 mb-1">AI属性治理功能</h4>
                  <p className="text-xs text-purple-700">
                    添加属性支持导入，对原始导入表进行AI分析，形成标准化数据
                  </p>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-2">导入属性文件</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-500 transition-colors cursor-pointer">
                <FileInput className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">点击或拖拽上传文件</p>
                <p className="text-xs text-gray-400 mt-1">支持 Excel、CSV 格式</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-purple-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm text-purple-900 mb-1">AI属性推荐功能</h4>
                  <p className="text-xs text-purple-700">
                    选择品名，自动推荐属性（属性名、属性值、填写方式）
                  </p>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                选择品名 <span className="text-red-500">*</span>
              </label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option>请选择品名</option>
                <option>A4打印纸</option>
                <option>签字笔</option>
                <option>订书机</option>
              </select>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-700 mb-3">AI推荐结果预览：</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">属性名：</span>
                  <span className="text-gray-900">颜色</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">属性值：</span>
                  <span className="text-gray-900">白色、蓝色、黄色</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">填写方式：</span>
                  <span className="text-gray-900">下拉选择</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
