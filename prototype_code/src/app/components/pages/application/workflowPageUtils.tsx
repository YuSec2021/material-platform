import { NavLink } from "react-router";
import type {
  Material,
  ReferenceImagePayload,
  WorkflowApplication,
  WorkflowHistory,
  WorkflowType,
} from "@/app/api/client";

export type FrontendWorkflowType = "category" | "material-code" | "stop-purchase" | "stop-use";

export const workflowTypeMap: Record<FrontendWorkflowType, WorkflowType> = {
  category: "new_category",
  "material-code": "new_material_code",
  "stop-purchase": "stop_purchase",
  "stop-use": "stop_use",
};

export const workflowTypeLabels: Record<FrontendWorkflowType | WorkflowType, string> = {
  category: "新增物料类目",
  "material-code": "新增物料编码",
  "stop-purchase": "物料停采",
  "stop-use": "物料停用",
  new_category: "新增物料类目",
  new_material_code: "新增物料编码",
  stop_purchase: "物料停采",
  stop_use: "物料停用",
};

export const workflowStatusOptions = [
  { value: "", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "pending_approval", label: "审批中" },
  { value: "pending_department_head", label: "部门审批" },
  { value: "pending_asset_management", label: "资产审批" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已驳回" },
];

export function workflowStatusLabel(status: string): string {
  return workflowStatusOptions.find((item) => item.value === status)?.label ?? status;
}

export function workflowStatusTone(status: string): "draft" | "pending" | "approved" | "rejected" {
  if (status === "approved") {
    return "approved";
  }
  if (status === "rejected") {
    return "rejected";
  }
  if (status === "draft") {
    return "draft";
  }
  return "pending";
}

export function formatDate(value: string): string {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

export function formatDateTime(value: string): string {
  if (!value) {
    return "";
  }
  return value.replace("T", " ").slice(0, 16);
}

export function applicationDepartment(application: WorkflowApplication): string {
  const department = application.data.department;
  return typeof department === "string" && department ? department : "未填写";
}

export function workflowTimeline(application?: WorkflowApplication) {
  if (!application) {
    return [
      { title: "申请人提交", approver: "申请人", status: "current" as const },
      { title: "部门审批", approver: "待审批", status: "pending" as const },
      { title: "资产管理审批", approver: "待审批", status: "pending" as const },
      { title: "完结", status: "pending" as const },
    ];
  }

  const historySteps = application.approval_history.map((item: WorkflowHistory) => ({
    title: item.action === "submit" ? "申请提交" : item.action,
    approver: item.actor,
    time: formatDateTime(item.created_at),
    status: item.to_status === "rejected" ? ("rejected" as const) : ("completed" as const),
    rejectReason: item.to_status === "rejected" ? item.comment : undefined,
  }));

  if (application.status === "approved" || application.status === "rejected") {
    return [...historySteps, { title: "完结", status: "completed" as const }];
  }

  return [
    ...historySteps,
    {
      title: application.current_node === "asset_management" ? "资产管理审批" : "下一审批",
      approver: "待审批",
      status: "current" as const,
    },
    { title: "完结", status: "pending" as const },
  ];
}

export function materialSpec(material: Material): string {
  const model = material.attributes["型号"] ?? material.attributes.model ?? material.attributes.spec;
  return typeof model === "string" && model ? model : material.unit || "-";
}

export function materialStock(material: Material): string {
  const stock = material.attributes.stock ?? material.attributes["库存"] ?? material.attributes.quantity;
  if (typeof stock === "number") {
    return String(stock);
  }
  return typeof stock === "string" && stock ? stock : "0";
}

export function fileToReferenceImage(file: File): Promise<ReferenceImagePayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        filename: file.name,
        content_type: file.type || "image/png",
        data_url: String(reader.result || ""),
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

export function WorkflowTypeNav() {
  const items: { path: string; label: string }[] = [
    { path: "/application/category", label: "类目申请" },
    { path: "/application/material-code", label: "编码申请" },
    { path: "/application/stop-purchase", label: "停采申请" },
    { path: "/application/stop-use", label: "停用申请" },
  ];

  return (
    <nav className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-2" aria-label="申请类型导航">
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            [
              "rounded-md px-3 py-2 text-sm transition-colors",
              isActive ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100",
            ].join(" ")
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
