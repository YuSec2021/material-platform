import { useState } from "react";
import { Plus, Search, ChevronRight, ChevronDown, Edit, Trash2, Sparkles, FileInput } from "lucide-react";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";

interface CategoryLibrary {
  id: number;
  name: string;
  children?: Category[];
}

interface Category {
  id: number;
  name: string;
  code: string;
  parentName: string;
  level: number;
  order: number;
  children?: Category[];
}

const mockLibraries: CategoryLibrary[] = [
  {
    id: 1,
    name: "全部类目",
    children: [
      { id: 1, name: "办公用品", code: "BGYP001", parentName: "-", level: 1, order: 1 },
      { id: 2, name: "电子设备", code: "DZSB001", parentName: "-", level: 1, order: 2 },
    ],
  },
  {
    id: 2,
    name: "办公用品库",
    children: [
      { id: 3, name: "纸张", code: "BGYP002", parentName: "办公用品", level: 2, order: 1 },
      { id: 4, name: "文具", code: "BGYP003", parentName: "办公用品", level: 2, order: 2 },
    ],
  },
  {
    id: 3,
    name: "电子设备库",
    children: [
      { id: 5, name: "电脑", code: "DZSB002", parentName: "电子设备", level: 2, order: 1 },
      { id: 6, name: "配件", code: "DZSB003", parentName: "电子设备", level: 2, order: 2 },
    ],
  },
];

export function CategoryList() {
  const [selectedLibrary, setSelectedLibrary] = useState(mockLibraries[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedLibraries, setExpandedLibraries] = useState<number[]>([1]);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiModalType, setAiModalType] = useState<'治理' | '匹配'>('治理');

  const toggleLibrary = (id: number) => {
    setExpandedLibraries(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const categories = selectedLibrary.children || [];

  const columns = [
    { header: "编号", accessor: "id" as keyof Category },
    { header: "类目名称", accessor: "name" as keyof Category },
    { header: "类目编码", accessor: "code" as keyof Category },
    { header: "父级类目", accessor: "parentName" as keyof Category },
    { header: "层级", accessor: "level" as keyof Category },
    { header: "顺序", accessor: "order" as keyof Category },
    {
      header: "操作",
      accessor: () => (
        <div className="flex gap-2">
          <button className="p-1 text-blue-600 hover:bg-blue-50 rounded">
            <Edit className="w-4 h-4" />
          </button>
          <button className="p-1 text-red-600 hover:bg-red-50 rounded">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
      width: "100px"
    },
  ];

  return (
    <div className="flex gap-6 h-full">
      {/* 左侧类目库列表 */}
      <div className="w-64 bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-sm text-gray-900 mb-4">类目库</h2>
        <div className="space-y-1">
          {mockLibraries.map((library) => (
            <div key={library.id}>
              <button
                onClick={() => {
                  toggleLibrary(library.id);
                  setSelectedLibrary(library);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedLibrary.id === library.id
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  {expandedLibraries.includes(library.id) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span>{library.name}</span>
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧类目列表 */}
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl text-gray-900">类目管理</h1>
          <div className="flex gap-2">
            <button
              onClick={() => { setAiModalType('治理'); setIsAIModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 shadow-md"
            >
              <Sparkles className="w-4 h-4" />
              AI类目治理
            </button>
            <button
              onClick={() => { setAiModalType('匹配'); setIsAIModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 shadow-md"
            >
              <Sparkles className="w-4 h-4" />
              AI类目匹配
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus className="w-4 h-4" />
              新增类目
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索类目名称或编码..."
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

        <DataTable data={categories} columns={columns} />

        <Modal
          isOpen={isAIModalOpen}
          onClose={() => setIsAIModalOpen(false)}
          title={aiModalType === '治理' ? 'AI类目治理' : 'AI类目匹配'}
          footer={
            <>
              <button
                onClick={() => setIsAIModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700">
                开始分析
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
                    <h4 className="text-sm text-purple-900 mb-1">AI类目治理功能</h4>
                    <p className="text-xs text-purple-700">
                      添加类目支持导入，对导入的类目进行AI分析，形成标准化数据
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">导入类目文件</label>
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
                    <h4 className="text-sm text-purple-900 mb-1">AI类目匹配功能</h4>
                    <p className="text-xs text-purple-700">
                      选择物料库，输入品名类目，自动关联全级类目
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  选择物料库 <span className="text-red-500">*</span>
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option>请选择物料库</option>
                  <option>通用物料库</option>
                  <option>专用物料库</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  输入品名类目 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="例如：A4打印纸"
                />
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}
