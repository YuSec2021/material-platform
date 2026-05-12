import { useState } from "react";
import { Plus, Search, Package, Edit, Trash2, User, Link2 } from "lucide-react";
import { Modal } from "../../common/Modal";

interface MaterialLibrary {
  id: number;
  name: string;
  code: string;
  description: string;
  manager: string;
  materialCount: number;
  linkedCategoryLibraries: string[];
}

const mockData: MaterialLibrary[] = [
  { id: 1, name: "通用物料库", code: "GY", description: "通用物料管理库", manager: "张三", materialCount: 156, linkedCategoryLibraries: ["办公用品库", "电子设备库"] },
  { id: 2, name: "专用物料库", code: "ZY", description: "专用物料管理库", manager: "李四", materialCount: 89, linkedCategoryLibraries: ["家具物料库"] },
  { id: 3, name: "办公用品库", code: "BGYP", description: "办公用品专用库", manager: "王五", materialCount: 234, linkedCategoryLibraries: ["办公用品库"] },
  { id: 4, name: "电子设备库", code: "DZSB", description: "电子设备专用库", manager: "赵六", materialCount: 67, linkedCategoryLibraries: ["电子设备库"] },
];

const categoryLibraries = ["办公用品库", "电子设备库", "家具物料库", "劳保用品库"];

export function MaterialLibraryList() {
  const [data, setData] = useState(mockData);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialLibrary | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    manager: "",
    linkedCategoryLibraries: [] as string[]
  });

  const filteredData = data.filter(item =>
    item.name.includes(searchTerm) || item.code.includes(searchTerm)
  );

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({ name: "", description: "", manager: "", linkedCategoryLibraries: [] });
    setIsModalOpen(true);
  };

  const handleEdit = (item: MaterialLibrary) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description,
      manager: item.manager,
      linkedCategoryLibraries: item.linkedCategoryLibraries
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("确定要删除此物料库吗？删除后数据不可恢复")) {
      setData(data.filter(item => item.id !== id));
    }
  };

  const handleSubmit = () => {
    if (editingItem) {
      setData(data.map(item => item.id === editingItem.id
        ? { ...item, ...formData }
        : item
      ));
    } else {
      const newItem: MaterialLibrary = {
        id: Date.now(),
        code: formData.name.substring(0, 2).toUpperCase(),
        materialCount: 0,
        ...formData,
      };
      setData([...data, newItem]);
    }
    setIsModalOpen(false);
  };

  const toggleCategoryLibrary = (library: string) => {
    setFormData(prev => ({
      ...prev,
      linkedCategoryLibraries: prev.linkedCategoryLibraries.includes(library)
        ? prev.linkedCategoryLibraries.filter(l => l !== library)
        : [...prev.linkedCategoryLibraries, library]
    }));
  };

  return (
    <div className="space-y-4 flex flex-col flex-1">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-gray-900">物料库管理</h1>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          新建物料库
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索物料库名称或编码..."
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredData.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(item)}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="编辑"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <h3 className="text-lg text-gray-900 mb-1">{item.name}</h3>
            <p className="text-sm text-gray-500 mb-3">编码：{item.code}</p>

            <p className="text-sm text-gray-600 mb-4 line-clamp-2 min-h-[40px]">
              {item.description}
            </p>

            <div className="pt-4 border-t border-gray-100 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">物料数量</span>
                <span className="text-gray-900 font-medium">{item.materialCount}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">管理员：</span>
                <span className="text-gray-900">{item.manager}</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <Link2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <span className="text-gray-500">关联类目库：</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.linkedCategoryLibraries.map((lib, index) => (
                      <span key={index} className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                        {lib}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredData.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">暂无物料库数据</p>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? "编辑物料库" : "新增物料库"}
        footer={
          <>
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              确定
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">
              物料库名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入物料库名称"
            />
          </div>
          {editingItem && (
            <div>
              <label className="block text-sm text-gray-700 mb-1">物料库编码</label>
              <input
                type="text"
                value={editingItem.code}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
              />
              <p className="text-xs text-gray-500 mt-1">提示：编码规则为拼音首字母前2位大写</p>
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-700 mb-1">描述</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="请输入描述"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">管理员</label>
            <select
              value={formData.manager}
              onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">请选择管理员</option>
              <option value="张三">张三</option>
              <option value="李四">李四</option>
              <option value="王五">王五</option>
              <option value="赵六">赵六</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              关联类目库 <span className="text-red-500">*</span>
            </label>
            <div className="border border-gray-300 rounded-lg p-3 space-y-2">
              {categoryLibraries.map((library) => (
                <label key={library} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                  <input
                    type="checkbox"
                    checked={formData.linkedCategoryLibraries.includes(library)}
                    onChange={() => toggleCategoryLibrary(library)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{library}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">选择该物料库可以使用的类目库</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
