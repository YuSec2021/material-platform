import { Link, Outlet, useLocation, useNavigate } from "react-router";
import {
  Bug,
  ChevronDown,
  Database,
  FileText,
  Languages,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  User,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/app/auth/AuthContext";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet";

interface MenuItem {
  key: string;
  title: string;
  icon: ReactNode;
  children: {
    key: string;
    title: string;
    path: string;
  }[];
}

function buildMenuItems(t: (key: string) => string): MenuItem[] {
  const items: MenuItem[] = [
    {
      key: "standard",
      title: t("nav.standard"),
      icon: <Database className="h-5 w-5" />,
      children: [
        { key: "categoryLibrary", title: t("nav.categoryLibrary"), path: "/standard/category-library" },
        { key: "category", title: t("nav.category"), path: "/standard/category" },
        { key: "productName", title: t("nav.productName"), path: "/standard/product-name" },
        { key: "attribute", title: t("nav.attribute"), path: "/standard/attribute" },
        { key: "brand", title: t("nav.brand"), path: "/standard/brand" },
      ],
    },
    {
      key: "material",
      title: t("nav.material"),
      icon: <Package className="h-5 w-5" />,
      children: [
        { key: "materialLibrary", title: t("nav.materialLibrary"), path: "/material/library" },
        { key: "materials", title: t("nav.material"), path: "/materials" },
      ],
    },
    {
      key: "applications",
      title: t("nav.applications"),
      icon: <FileText className="h-5 w-5" />,
      children: [
        { key: "categoryApplication", title: t("nav.categoryApplication"), path: "/application/category" },
        { key: "materialCodeApplication", title: t("nav.materialCodeApplication"), path: "/application/material-code" },
        { key: "stopPurchaseApplication", title: t("nav.stopPurchaseApplication"), path: "/application/stop-purchase" },
        { key: "stopUseApplication", title: t("nav.stopUseApplication"), path: "/application/stop-use" },
      ],
    },
    {
      key: "system",
      title: t("nav.system"),
      icon: <Settings className="h-5 w-5" />,
      children: [
        { key: "users", title: t("nav.users"), path: "/system/users" },
        { key: "roles", title: t("nav.roles"), path: "/system/roles" },
        { key: "permissions", title: t("nav.permissions"), path: "/system/permissions" },
        { key: "systemInfo", title: t("nav.systemInfo"), path: "/system/info" },
        { key: "reasons", title: t("nav.reasons"), path: "/system/reason-options" },
        { key: "approvalMode", title: t("nav.approvalMode"), path: "/system/approval-mode" },
      ],
    },
  ];

  if (import.meta.env.DEV) {
    items.push({
      key: "debug",
      title: t("nav.debug"),
      icon: <Bug className="h-5 w-5" />,
      children: [{ key: "trace", title: t("nav.trace"), path: "/debug/trace" }],
    });
  }

  return items;
}

function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const nextLanguage = i18n.language === "en-US" ? "zh-CN" : "en-US";

  return (
    <button
      type="button"
      aria-label={t("app.language")}
      onClick={() => void i18n.changeLanguage(nextLanguage)}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
    >
      <Languages className="h-4 w-4" />
      {i18n.language === "en-US" ? t("app.chinese") : t("app.english")}
    </button>
  );
}

function NavigationTree({
  menuItems,
  expandedMenus,
  onToggle,
  onNavigate,
}: {
  menuItems: MenuItem[];
  expandedMenus: string[];
  onToggle: (key: string) => void;
  onNavigate?: () => void;
}) {
  const location = useLocation();

  return (
    <nav className="flex-1 overflow-y-auto p-4" aria-label="Primary">
      {menuItems.map((item) => (
        <div key={item.key} className="mb-2">
          <button
            type="button"
            onClick={() => onToggle(item.key)}
            aria-expanded={expandedMenus.includes(item.key)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-gray-700 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.99]"
          >
            <span className="flex items-center gap-3">
              {item.icon}
              <span>{item.title}</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                expandedMenus.includes(item.key) ? "rotate-180" : ""
              }`}
            />
          </button>

          {expandedMenus.includes(item.key) && (
            <div className="ml-8 mt-1 space-y-1">
              {item.children.map((child) => (
                <Link
                  key={child.path}
                  to={child.path}
                  onClick={onNavigate}
                  className={`block rounded-lg px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.99] ${
                    location.pathname === child.path
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
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
  );
}

export function MainLayout() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { t } = useTranslation();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([
    "standard",
    "material",
    "applications",
    "system",
    "debug",
  ]);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const menuItems = buildMenuItems(t);

  const toggleMenu = (key: string) => {
    setExpandedMenus((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
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
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="border-b border-gray-200 p-6">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <LayoutDashboard className="h-8 w-8 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">{t("app.name")}</h1>
          </Link>
        </div>
        <NavigationTree menuItems={menuItems} expandedMenus={expandedMenus} onToggle={toggleMenu} />
      </aside>

      <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
        <SheetContent side="left" className="w-80 max-w-[86vw]">
          <SheetHeader>
            <SheetTitle>{t("app.name")}</SheetTitle>
            <SheetDescription>{t("app.system")}</SheetDescription>
          </SheetHeader>
          <NavigationTree
            menuItems={menuItems}
            expandedMenus={expandedMenus}
            onToggle={toggleMenu}
            onNavigate={() => setIsMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-gray-200 bg-white px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label={t("app.menu")}
                onClick={() => setIsMobileNavOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <h2 className="truncate text-base font-semibold text-gray-900 md:text-lg">{t("app.system")}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2 md:gap-3">
              <LanguageSwitcher />
              <div className="hidden items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 sm:flex">
                <User className="h-5 w-5 text-gray-600" />
                <span className="max-w-28 truncate text-sm text-gray-700">{auth.user?.display_name}</span>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {roleLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                {t("app.logout")}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="flex min-h-full flex-col">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
