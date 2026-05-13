import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, FileText, Package, RefreshCcw, TrendingUp } from "lucide-react";
import { apiClient, type WorkflowApplication } from "@/app/api/client";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";

function workflowTypeLabel(type: string) {
  const labels: Record<string, string> = {
    new_category: "新增物料类目",
    new_material_code: "新增物料编码",
    stop_purchase: "物料停采",
    stop_use: "物料停用",
  };
  return labels[type] ?? type;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    pending: "待审批",
    in_review: "审批中",
    approved: "已通过",
    rejected: "已驳回",
  };
  return labels[status] ?? status;
}

function statusClassName(status: string) {
  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (status === "pending" || status === "in_review") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function formatTime(value: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

export function Dashboard() {
  const applicationsQuery = useQuery({
    queryKey: ["dashboard", "workflow-applications"],
    queryFn: () => apiClient.workflowApplications(),
    retry: false,
  });

  const applications = applicationsQuery.data ?? [];
  const recentApplications = useMemo(
    () =>
      [...applications]
        .sort((left, right) => new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime())
        .slice(0, 5),
    [applications],
  );
  const pendingCount = applications.filter((item) => item.status !== "approved" && item.status !== "rejected").length;
  const monthlyCount = applications.filter((item) => {
    const createdAt = new Date(item.created_at);
    const now = new Date();
    return createdAt.getFullYear() === now.getFullYear() && createdAt.getMonth() === now.getMonth();
  }).length;

  const stats = [
    { title: "物料总数", value: "连接物料页", icon: Package, className: "bg-blue-500" },
    { title: "类目总数", value: "连接类目页", icon: Database, className: "bg-emerald-500" },
    { title: "待审批申请", value: String(pendingCount), icon: FileText, className: "bg-amber-500" },
    { title: "本月新增", value: String(monthlyCount), icon: TrendingUp, className: "bg-indigo-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-2xl text-gray-900">仪表盘</h1>
        <p className="text-gray-600">欢迎使用 AI 物料中台管理系统</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.title} className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="mb-1 text-sm text-gray-600">{stat.title}</p>
                <p className="text-2xl text-gray-900">{applicationsQuery.isLoading ? "..." : stat.value}</p>
              </div>
              <div className={`rounded-lg p-3 ${stat.className}`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg text-gray-900">最近申请</h2>
          {applicationsQuery.isError && (
            <Button type="button" variant="outline" size="sm" onClick={() => void applicationsQuery.refetch()}>
              <RefreshCcw className="h-4 w-4" />
              重试
            </Button>
          )}
        </div>

        {applicationsQuery.isLoading ? (
          <div className="space-y-3" aria-label="最近申请加载中">
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex items-center justify-between gap-4 border-b border-gray-100 py-3 last:border-0">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
        ) : applicationsQuery.isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            最近申请加载失败，请重试。
          </div>
        ) : recentApplications.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-600">
            暂无最近申请
          </div>
        ) : (
          <div className="space-y-1">
            {recentApplications.map((application: WorkflowApplication) => (
              <div key={application.id} className="flex items-center justify-between gap-4 border-b border-gray-100 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-900">
                    {application.application_no || `APP-${application.id}`} / {workflowTypeLabel(application.type)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    申请人：{application.applicant || "-"}；节点：{application.current_node || "-"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="text-xs text-gray-500">{formatTime(application.updated_at || application.created_at)}</span>
                  <Badge variant="outline" className={statusClassName(application.status)}>
                    {statusLabel(application.status)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
