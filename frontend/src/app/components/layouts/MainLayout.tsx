import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Database,
  FileText,
  Info,
  LayoutDashboard,
  Menu,
  Moon,
  Package,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/app/auth/AuthContext";
import { apiClient } from "@/app/api/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet";
import { Button } from "@/app/components/ui/button";

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

function buildMenuItems(t: (key: string) => string, isSuperAdmin: boolean): MenuItem[] {
  const items: MenuItem[] = [
    {
      key: "standard",
      title: t("nav.standard"),
      icon: <Database className="h-5 w-5" />,
      children: [
        { key: "categoryLibrary", title: t("nav.categoryLibrary"), path: "/standard/category-library" },
        { key: "category", title: t("nav.category"), path: "/standard/category" },
        { key: "brand", title: t("nav.brand"), path: "/standard/brand" },
        { key: "measurementUnit", title: t("nav.measurementUnit"), path: "/standard/measurement-unit" },
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
        ...(isSuperAdmin
          ? [{ key: "versions", title: t("nav.versions"), path: "/system/versions" }]
          : []),
      ],
    },
  ];

  // AI 管理 与 规则引擎 入口已隐藏（路由仍可访问，便于后续恢复或直接访问）。
  return items;
}

function ThemeSwitcher({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={t("app.toggleTheme")}
      onClick={onToggle}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
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
          <Button
            type="button"
            variant="ghost"
            onClick={() => onToggle(item.key)}
            aria-expanded={expandedMenus.includes(item.key)}
            className="w-full justify-between px-3"
          >
            <span className="flex items-center gap-3">
              {item.icon}
              <span>{item.title}</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                expandedMenus.includes(item.key) ? "rotate-180" : ""
              }`}
            />
          </Button>

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
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
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
  ]);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const versionQuery = useQuery({
    queryKey: ["current-application-version"],
    queryFn: apiClient.currentApplicationVersion,
    enabled: isAboutOpen,
    staleTime: 60_000,
    retry: false,
  });
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");
  const menuItems = buildMenuItems(t, Boolean(auth.user?.is_super_admin));

  const toggleMenu = (key: string) => {
    setExpandedMenus((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const roleLabel = auth.user?.is_super_admin
    ? "super-admin"
    : auth.user?.roles?.[0]?.name || "user";

  const handleLogout = () => {
    auth.logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="border-b border-border p-6">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <LayoutDashboard className="h-8 w-8 text-primary" />
            <h1 className="text-xl font-bold text-foreground">{t("app.name")}</h1>
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
        <header className="border-b border-border bg-card px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t("app.menu")}
                onClick={() => setIsMobileNavOpen(true)}
                className="md:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <h2 className="truncate text-base font-semibold text-foreground md:text-lg">{t("app.system")}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2 md:gap-3">
              <ThemeSwitcher isDark={isDark} onToggle={toggleTheme} />
              <div className="hidden items-center gap-2 rounded-lg bg-muted px-3 py-2 sm:flex">
                <User className="h-5 w-5 text-muted-foreground" />
                <span className="max-w-28 truncate text-sm text-foreground">{auth.user?.display_name}</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {roleLabel}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAboutOpen(true)}
              >
                <Info className="h-4 w-4" />
                {t("app.about")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleLogout}
              >
                {t("app.logout")}
              </Button>
            </div>
          </div>
          <Dialog open={isAboutOpen} onOpenChange={setIsAboutOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("app.aboutTitle")}</DialogTitle>
                <DialogDescription>{t("app.aboutDescription")}</DialogDescription>
              </DialogHeader>
              <dl className="space-y-3 text-sm text-foreground">
                <div>{t("app.aboutName")}</div>
                <div>
                  {t("app.aboutVersionLabel")}{" "}
                  <strong>
                    {versionQuery.isLoading
                      ? t("app.aboutVersionLoading")
                      : `v${versionQuery.data?.version ?? "4.2.0"}`}
                  </strong>
                </div>
                {versionQuery.data?.title && (
                  <div>
                    {t("app.aboutReleaseTitle")} {versionQuery.data.title}
                  </div>
                )}
                {versionQuery.data?.release_notes && (
                  <div>
                    <div>{t("app.aboutReleaseNotes")}</div>
                    <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-muted-foreground">
                      {versionQuery.data.release_notes}
                    </p>
                  </div>
                )}
                {versionQuery.data?.released_at && (
                  <div>
                    {t("app.aboutReleasedAt")}{" "}
                    {new Intl.DateTimeFormat("zh-CN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(versionQuery.data.released_at))}
                  </div>
                )}
                <div>{t("app.aboutDescription")}</div>
              </dl>
            </DialogContent>
          </Dialog>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="flex h-full min-h-0 flex-col">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
