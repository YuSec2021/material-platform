import { createBrowserRouter } from "react-router";
import { MainLayout } from "./components/layouts/MainLayout";
import { Dashboard } from "./components/pages/Dashboard";
import { ComponentSmoke } from "./components/pages/dev/ComponentSmoke";
import { FrontendHealth } from "./components/pages/dev/FrontendHealth";

// 标准管理
import { CategoryLibraryList } from "./components/pages/standard/CategoryLibraryList";
import { CategoryList } from "./components/pages/standard/CategoryList";
import { ProductNameList } from "./components/pages/standard/ProductNameList";
import { AttributeList } from "./components/pages/standard/AttributeList";
import { BrandList } from "./components/pages/standard/BrandList";

// 物料管理
import { MaterialLibraryList } from "./components/pages/material/MaterialLibraryList";
import { MaterialList } from "./components/pages/material/MaterialList";

// 申请流程
import { ApplicationList } from "./components/pages/application/ApplicationList";
import { CategoryApplication } from "./components/pages/application/CategoryApplication";
import { MaterialCodeApplication } from "./components/pages/application/MaterialCodeApplication";
import { StopPurchaseApplication } from "./components/pages/application/StopPurchaseApplication";
import { StopUseApplication } from "./components/pages/application/StopUseApplication";

// 系统管理
import { UserList } from "./components/pages/system/UserList";
import { RoleList } from "./components/pages/system/RoleList";
import { PermissionConfig } from "./components/pages/system/PermissionConfig";
import { SystemInfo } from "./components/pages/system/SystemInfo";
import { ReasonOptions } from "./components/pages/system/ReasonOptions";
import { ApprovalMode } from "./components/pages/system/ApprovalMode";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: MainLayout,
    children: [
      { index: true, Component: Dashboard },

      // 标准管理
      { path: "standard/category-library", Component: CategoryLibraryList },
      { path: "standard/category", Component: CategoryList },
      { path: "standard/product-name", Component: ProductNameList },
      { path: "standard/attribute", Component: AttributeList },
      { path: "standard/brand", Component: BrandList },

      // 物料管理
      { path: "material/library", Component: MaterialLibraryList },
      { path: "material/list", Component: MaterialList },

      // 申请流程
      {
        path: "application/category",
        element: <ApplicationList type="category" title="新增物料类目申请" />
      },
      {
        path: "application/material-code",
        element: <ApplicationList type="material-code" title="新增物料编码申请" />
      },
      {
        path: "application/stop-purchase",
        element: <ApplicationList type="stop-purchase" title="物料停采申请" />
      },
      {
        path: "application/stop-use",
        element: <ApplicationList type="stop-use" title="物料停用申请" />
      },
      { path: "application/category/detail/:id", Component: CategoryApplication },
      { path: "application/material-code/detail/:id", Component: MaterialCodeApplication },
      { path: "application/stop-purchase/detail/:id", Component: StopPurchaseApplication },
      { path: "application/stop-use/detail/:id", Component: StopUseApplication },

      // 系统管理
      { path: "system/users", Component: UserList },
      { path: "system/roles", Component: RoleList },
      { path: "system/permissions", Component: PermissionConfig },
      { path: "system/info", Component: SystemInfo },
      { path: "system/reason-options", Component: ReasonOptions },
      { path: "system/approval-mode", Component: ApprovalMode },

      // Sprint 13 dev verification
      { path: "dev/frontend-health", Component: FrontendHealth },
      { path: "dev/component-smoke", Component: ComponentSmoke },
    ],
  },
]);
