import { useState } from "react";
import { Plus, Search, Edit, Trash2, Database, User } from "lucide-react";
import { Modal } from "../../common/Modal";

interface CategoryLibrary {
  id: number;
  name: string;
  code: string;
  description: string;
  manager: string;
  categoryCount: number;
}

const mockData: CategoryLibrary[] = [
  { id: 1, name: "办公用品库", code: "BGYP", description: "办公日常用品类目管理", manager: "张三", categoryCount: 25 },
  { id: 2, name: "电子设备库", code: "DZSB", description: "电子类设备类目管理", manager: "李四", categoryCount: 18 },
  { id: 3, name: "家具物料库", code: "JJWL", description: "办公家具类目管理", manager: "王五", categoryCount: 12 },
  { id: 4, name: "劳保用品库", code: "LBYP", description: "劳保用品类目管理", manager: "赵六", categoryCount: 8 },
];

export function CategoryLibraryList() {
  const [data, setData] = useState(mockData);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CategoryLibrary | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", manager: "" });

  const filteredData = data.filter(item =>
    item.name.includes(searchTerm) || item.code.includes(searchTerm)
  );

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({ name: "", description: "", manager: "" });
    setIsModalOpen(true);
  };

  const handleEdit = (item: CategoryLibrary) => {
    setEditingItem(item);
    setFormData({ name: item.name, description: item.description, manager: item.manager });
    setIsModalOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("确定要删除此类目库吗？删除后数据不可恢复")) {
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
      const newItem: CategoryLibrary = {
        id: Date.now(),
        code: formData.name.split('').map(c => c.charCodeAt(0).toString(36).toUpperCase()).join('').substring(0, 4),
        categoryCount: 0,
        ...formData,
      };
      setData([...data, newItem]);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-4 flex flex-col flex-1">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-gray-900">类目库管理</h1>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增类目库
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索类目库名称或编码..."
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
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Database className="w-6 h-6 text-blue-600" />
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

            <div className="pt-4 border-t border-gray-100 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">类目数量</span>
                <span className="text-gray-900 font-medium">{item.categoryCount}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">管理员：</span>
                <span className="text-gray-900">{item.manager}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredData.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Database className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">暂无类目库数据</p>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? "编辑类目库" : "新增类目库"}
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
              类目库名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入类目库名称"
            />
          </div>
          {editingItem && (
            <div>
              <label className="block text-sm text-gray-700 mb-1">类目库编码</label>
              <input
                type="text"
                value={editingItem.code}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
              />
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
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
