import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Download, ChevronRight, ChevronDown, Image, Sparkles, FileInput } from "lucide-react";
import { apiClient, type Material } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { StatusBadge } from "../../common/StatusBadge";
import { Modal } from "../../common/Modal";

interface MaterialLibrary {
  id: number;
  name: string;
  code: string;
  children?: MaterialCategory[];
}

interface MaterialCategory {
  id: number;
  name: string;
  children?: MaterialCategory[];
}

const mockLibraries: MaterialLibrary[] = [
  {
    id: 1,
    name: "全部物料",
    code: "ALL",
    children: [
      { id: 1, name: "办公用品", children: [
        { id: 11, name: "纸张" },
        { id: 12, name: "文具" },
      ]},
      { id: 2, name: "电子设备", children: [
        { id: 21, name: "电脑" },
        { id: 22, name: "配件" },
      ]},
    ],
  },
  {
    id: 2,
    name: "通用物料库",
    code: "GY",
    children: [
      { id: 3, name: "办公用品" },
    ],
  },
  {
    id: 3,
    name: "专用物料库",
    code: "ZY",
    children: [
      { id: 4, name: "电子设备" },
    ],
  },
];

export function MaterialList() {
  const [selectedLibrary, setSelectedLibrary] = useState<MaterialLibrary>(mockLibraries[0]!);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedLibraries, setExpandedLibraries] = useState<number[]>([1]);
  const [expandedCategories, setExpandedCategories] = useState<number[]>([1]);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiModalType, setAiModalType] = useState<'治理' | '添加' | '匹配'>('治理');
  const query = useQuery({
    queryKey: ["materials"],
    queryFn: apiClient.materials,
    retry: false,
  });

  const materials = (query.data ?? []).filter((item) =>
    item.name.includes(searchTerm) || item.code.includes(searchTerm),
  );

  const toggleLibrary = (id: number) => {
    setExpandedLibraries(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleCategory = (id: number) => {
    setExpandedCategories(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const renderCategory = (category: MaterialCategory, level: number = 0) => (
    <div key={category.id}>
      <button
        onClick={() => toggleCategory(category.id)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-gray-700 hover:bg-gray-100"
        style={{ paddingLeft: `${(level + 1) * 12}px` }}
      >
        {category.children && category.children.length > 0 && (
          expandedCategories.includes(category.id) ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )
        )}
        <span>{category.name}</span>
      </button>
      {expandedCategories.includes(category.id) && category.children && (
        <div>
          {category.children.map(child => renderCategory(child, level + 1))}
        </div>
      )}
    </div>
  );

  const columns = [
    { header: "编号", accessor: "id" as keyof Material, width: "80px" },
    { header: "物料名称", accessor: "name" as keyof Material },
    { header: "物料编码", accessor: "code" as keyof Material, width: "120px" },
    { header: "所属类目", accessor: "category" as keyof Material },
    {
      header: "规格型号",
      accessor: (row: Material) => {
        const spec = row.attributes.spec || row.attributes["规格型号"] || row.description;
        return spec ? String(spec) : "-";
      },
    },
    { header: "计量单位", accessor: "unit" as keyof Material, width: "100px" },
    {
      header: "图片",
      accessor: (row: Material) => (
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center" title={row.name}>
            <Image className="w-4 h-4 text-gray-400" />
          </div>
        </div>
      ),
      width: "80px"
    },
    {
      header: "状态",
      accessor: (row: Material) => (
        <StatusBadge status={row.status === "stop_purchase" ? "stop-purchase" : row.status === "stop_use" ? "stop-use" : row.status}>
          {row.status === 'normal' ? '正常' : row.status === 'stop_purchase' || row.status === 'stop-purchase' ? '停采' : '停用'}
        </StatusBadge>
      ),
      width: "100px"
    },
    {
      header: "操作",
      accessor: (row: Material) => (
        <div className="flex gap-2">
          <button className="text-blue-600 hover:underline text-sm">编辑</button>
          {row.status === 'normal' && (
            <button className="text-orange-600 hover:underline text-sm">停采</button>
          )}
          {(row.status === 'stop_purchase' || row.status === 'stop-purchase') && (
            <button className="text-gray-600 hover:underline text-sm">停用</button>
          )}
          <button className="text-red-600 hover:underline text-sm">删除</button>
        </div>
      ),
      width: "180px"
    },
  ];

  return (
    <div className="flex gap-6 h-full">
      {/* 左侧物料库和类目树 */}
      <div className="w-64 bg-white rounded-lg border border-gray-200 p-4 overflow-y-auto">
        <h2 className="text-sm text-gray-900 mb-4">物料库</h2>
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
              {expandedLibraries.includes(library.id) && library.children && (
                <div className="mt-1">
                  {library.children.map(category => renderCategory(category))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 右侧物料列表 */}
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl text-gray-900">物料管理</h1>
          <div className="flex gap-2">
            <button
              onClick={() => { setAiModalType('治理'); setIsAIModalOpen(true); }}
              className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 shadow-md text-sm"
            >
              <Sparkles className="w-4 h-4" />
              AI物料治理
            </button>
            <button
              onClick={() => { setAiModalType('添加'); setIsAIModalOpen(true); }}
              className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 shadow-md text-sm"
            >
              <Sparkles className="w-4 h-4" />
              AI添加物料
            </button>
            <button
              onClick={() => { setAiModalType('匹配'); setIsAIModalOpen(true); }}
              className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 shadow-md text-sm"
            >
              <Sparkles className="w-4 h-4" />
              AI物料匹配
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              <Download className="w-4 h-4" />
              导出
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus className="w-4 h-4" />
              新增物料
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索物料名称或编码..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 outline-none text-sm"
              />
            </div>
            <select className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
              <option>全部状态</option>
              <option>正常</option>
              <option>停采</option>
              <option>停用</option>
            </select>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              搜索
            </button>
          </div>
        </div>

        <ApiState
          isLoading={query.isLoading}
          isError={query.isError}
          isEmpty={!query.isLoading && !query.isError && materials.length === 0}
          emptyLabel="后端暂无物料数据"
          onRetry={() => void query.refetch()}
        >
          <DataTable data={materials} columns={columns} />
        </ApiState>

        <Modal
          isOpen={isAIModalOpen}
          onClose={() => setIsAIModalOpen(false)}
          title={
            aiModalType === '治理' ? 'AI物料治理' :
            aiModalType === '添加' ? 'AI添加物料' : 'AI物料匹配'
          }
          size="lg"
          footer={
            <>
              <button
                onClick={() => setIsAIModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700">
                {aiModalType === '治理' ? '开始分析' : aiModalType === '添加' ? '开始添加' : '开始匹配'}
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
                    <h4 className="text-sm text-purple-900 mb-1">AI物料治理功能</h4>
                    <p className="text-xs text-purple-700">
                      添加物料支持导入，对原始导入表进行AI分析，形成标准化数据
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">导入物料文件</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-500 transition-colors cursor-pointer">
                  <FileInput className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">点击或拖拽上传文件</p>
                  <p className="text-xs text-gray-400 mt-1">支持 Excel、CSV 格式</p>
                </div>
              </div>
            </div>
          ) : aiModalType === '添加' ? (
            <div className="space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-purple-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm text-purple-900 mb-1">AI添加物料功能</h4>
                    <p className="text-xs text-purple-700">
                      输入物料描述，自动添加物料（关联类目、关联品名、推荐属性）
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  物料描述 <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="例如：白色A4打印纸，500张每包，适用于激光打印机"
                />
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 mb-3">AI分析结果预览：</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start">
                    <span className="text-gray-600 w-24">关联类目：</span>
                    <span className="text-gray-900">办公用品 / 纸张 / 打印纸</span>
                  </div>
                  <div className="flex items-start">
                    <span className="text-gray-600 w-24">关联品名：</span>
                    <span className="text-gray-900">A4打印纸</span>
                  </div>
                  <div className="flex items-start">
                    <span className="text-gray-600 w-24">推荐属性：</span>
                    <div className="flex-1 space-y-1">
                      <div>颜色: 白色</div>
                      <div>规格: 500张/包</div>
                      <div>适用设备: 激光打印机</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-purple-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm text-purple-900 mb-1">AI物料匹配功能</h4>
                    <p className="text-xs text-purple-700">
                      对添加的物料进行在已有物料的关联匹配，提示重复物料（无需重复添加）
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  物料信息 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="输入物料名称或描述"
                />
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-900 mb-2">⚠️ 发现可能重复的物料：</p>
                <div className="space-y-2">
                  <div className="bg-white rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-900">A4打印纸-白色-500张</span>
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">相似度: 95%</span>
                    </div>
                    <p className="text-xs text-gray-600">物料编码: MAT001</p>
                  </div>
                  <div className="bg-white rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-900">A4复印纸-白色-500张</span>
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">相似度: 85%</span>
                    </div>
                    <p className="text-xs text-gray-600">物料编码: MAT006</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}
