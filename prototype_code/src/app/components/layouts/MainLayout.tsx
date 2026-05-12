import { Outlet, Link, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Database,
  Package,
  FileText,
  Settings,
  ChevronDown,
  User
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/app/auth/AuthContext";

interface MenuItem {
  title: string;
  icon: React.ReactNode;
  path?: string;
  children?: {
    title: string;
    path: string;
  }[];
}

const menuItems: MenuItem[] = [
  {
    title: "标准管理",
    icon: <Database className="w-5 h-5" />,
    children: [
      { title: "类目库管理", path: "/standard/category-library" },
      { title: "类目管理", path: "/standard/category" },
      { title: "品名管理", path: "/standard/product-name" },
      { title: "属性管理", path: "/standard/attribute" },
      { title: "品牌管理", path: "/standard/brand" },
    ],
  },
  {
    title: "物料管理",
    icon: <Package className="w-5 h-5" />,
    children: [
      { title: "物料库管理", path: "/material/library" },
      { title: "物料管理", path: "/material/list" },
    ],
  },
  {
    title: "申请流程",
    icon: <FileText className="w-5 h-5" />,
    children: [
      { title: "新增物料类目申请", path: "/application/category" },
      { title: "新增物料编码申请", path: "/application/material-code" },
      { title: "物料停采申请", path: "/application/stop-purchase" },
      { title: "物料停用申请", path: "/application/stop-use" },
    ],
  },
  {
    title: "系统管理",
    icon: <Settings className="w-5 h-5" />,
    children: [
      { title: "用户管理", path: "/system/users" },
      { title: "角色管理", path: "/system/roles" },
      { title: "权限配置", path: "/system/permissions" },
      { title: "系统信息配置", path: "/system/info" },
      { title: "原因选项维护", path: "/system/reason-options" },
      { title: "审批模式切换", path: "/system/approval-mode" },
    ],
  },
];

export function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const [expandedMenus, setExpandedMenus] = useState<string[]>(["标准管理", "物料管理", "申请流程", "系统管理"]);

  const toggleMenu = (title: string) => {
    setExpandedMenus(prev =>
      prev.includes(title) ? prev.filter(item => item !== title) : [...prev, title]
    );
  };

  const roleLabel = auth.user?.is_super_admin
    ? "super-admin"
    : auth.user?.roles[0]?.name || "user";

  const handleLogout = () => {
    auth.logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 侧边栏 */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <Link to="/" className="flex items-center gap-2">
            <LayoutDashboard className="w-8 h-8 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">AI物料中台</h1>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          {menuItems.map((item) => (
            <div key={item.title} className="mb-2">
              <button
                onClick={() => toggleMenu(item.title)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.title}</span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    expandedMenus.includes(item.title) ? "rotate-180" : ""
                  }`}
                />
              </button>

              {expandedMenus.includes(item.title) && item.children && (
                <div className="ml-8 mt-1 space-y-1">
                  {item.children.map((child) => (
                    <Link
                      key={child.path}
                      to={child.path}
                      className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                        location.pathname === child.path
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {child.title}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部栏 */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg text-gray-900">AI物料中台管理系统</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100">
                <User className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-700">{auth.user?.display_name}</span>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {roleLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                退出登录
              </button>
            </div>
          </div>
        </header>

        {/* 页面内容 */}
        <main className="flex-1 overflow-auto p-6 flex flex-col">
          <div className="flex-1 flex flex-col">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
