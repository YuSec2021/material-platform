import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

export function PermissionConfig() {
  const [expandedItems, setExpandedItems] = useState<string[]>(["standard"]);

  const menuTree = [
    {
      id: "standard",
      title: "标准管理",
      children: [
        { id: "category-library", title: "类目库管理" },
        { id: "category", title: "类目管理" },
        { id: "product-name", title: "品名管理" },
        { id: "attribute", title: "属性管理" },
        { id: "brand", title: "品牌管理" },
      ],
    },
    {
      id: "material",
      title: "物料管理",
      children: [
        { id: "material-library", title: "物料库管理" },
        { id: "material-list", title: "物料管理" },
      ],
    },
  ];

  const permissions = [
    { id: "view", label: "查看" },
    { id: "add", label: "新增" },
    { id: "edit", label: "编辑" },
    { id: "delete", label: "删除" },
    { id: "export", label: "导出" },
  ];

  const toggleItem = (id: string) => {
    setExpandedItems(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-gray-900">权限配置</h1>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4 bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-sm text-gray-700 mb-4">功能目录</h2>
          <div className="space-y-1">
            {menuTree.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => toggleItem(item.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-sm text-gray-900"
                >
                  {expandedItems.includes(item.id) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  {item.title}
                </button>
                {expandedItems.includes(item.id) && item.children && (
                  <div className="ml-6 mt-1 space-y-1">
                    {item.children.map((child) => (
                      <button
                        key={child.id}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 text-sm text-gray-700"
                      >
                        {child.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-8 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-sm text-gray-700 mb-4">权限配置</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-700 mb-2">选择角色</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option>超级管理员</option>
                <option>物料管理员</option>
                <option>一线员工</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-3">功能权限</label>
              <div className="space-y-2">
                {permissions.map((permission) => (
                  <label key={permission.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{permission.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <div className="flex gap-3">
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  保存配置
                </button>
                <button className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                  还原默认
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
