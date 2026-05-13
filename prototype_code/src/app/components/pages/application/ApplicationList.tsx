import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Plus, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { apiClient, type WorkflowApplication } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { StatusBadge } from "../../common/StatusBadge";
import {
  applicationDepartment,
  formatDate,
  type FrontendWorkflowType,
  WorkflowTypeNav,
  workflowStatusLabel,
  workflowStatusOptions,
  workflowStatusTone,
  workflowTypeLabels,
  workflowTypeMap,
} from "./workflowPageUtils";

type ApplicationListProps = {
  type: FrontendWorkflowType;
  title: string;
};

type ApplicationRow = {
  id: number;
  applicationNo: string;
  typeLabel: string;
  applicant: string;
  department: string;
  createdDate: string;
  status: string;
  raw: WorkflowApplication;
};

export function ApplicationList({ type, title }: ApplicationListProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const apiType = workflowTypeMap[type];
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const query = useQuery({
    queryKey: ["workflow-applications", apiType, statusFilter],
    queryFn: () => apiClient.workflowApplications({ type: apiType, status: statusFilter }),
    retry: false,
  });

  const rows = useMemo<ApplicationRow[]>(() => {
    const term = searchTerm.trim().toLowerCase();
    return (query.data ?? [])
      .map((application) => ({
        id: application.id,
        applicationNo: application.application_no,
        typeLabel: workflowTypeLabels[application.type as keyof typeof workflowTypeLabels] ?? application.type,
        applicant: application.applicant,
        department: applicationDepartment(application),
        createdDate: formatDate(application.created_at),
        status: application.status,
        raw: application,
      }))
      .filter((row) => {
        if (!term) {
          return true;
        }
        return [row.applicationNo, row.applicant, row.department, row.typeLabel]
          .join(" ")
          .toLowerCase()
          .includes(term);
      });
  }, [query.data, searchTerm]);

  const columns = [
    { header: "申请单号", accessor: "applicationNo" as keyof ApplicationRow, width: "190px" },
    { header: "申请类型", accessor: "typeLabel" as keyof ApplicationRow },
    { header: "申请人", accessor: "applicant" as keyof ApplicationRow },
    { header: "所属部门", accessor: "department" as keyof ApplicationRow },
    { header: "申请日期", accessor: "createdDate" as keyof ApplicationRow },
    {
      header: "状态",
      accessor: (row: ApplicationRow) => (
        <StatusBadge status={workflowStatusTone(row.status)}>
          {workflowStatusLabel(row.status)}
        </StatusBadge>
      ),
      width: "120px",
    },
    {
      header: "操作",
      accessor: (row: ApplicationRow) => (
        <button
          type="button"
          onClick={() => navigate(`/application/${type}/detail/${row.id}`)}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
        >
          <Eye className="h-4 w-4" />
          查看
        </button>
      ),
      width: "110px",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-900">
            {type === "category"
              ? t("nav.categoryApplication")
              : type === "material-code"
                ? t("nav.materialCodeApplication")
                : type === "stop-purchase"
                  ? t("nav.stopPurchaseApplication")
                  : type === "stop-use"
                    ? t("nav.stopUseApplication")
                    : title}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("page.applicationsHelp", { type: apiType })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/application/${type}/detail/new`)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          {t("action.addMaterial")}
        </button>
      </div>

      <WorkflowTypeNav />

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-64 flex-1 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <Search className="h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索申请单号、申请人或部门"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="min-w-0 flex-1 text-sm outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {workflowStatusOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={rows.length === 0}
        loadingLabel={t("state.loadingApplications")}
        errorLabel={t("state.errorApplications")}
        emptyLabel={t("state.emptyApplications")}
        onRetry={() => void query.refetch()}
      >
        <DataTable data={rows} columns={columns} emptyMessage="后端暂无该类型申请" />
      </ApiState>
    </div>
  );
}
