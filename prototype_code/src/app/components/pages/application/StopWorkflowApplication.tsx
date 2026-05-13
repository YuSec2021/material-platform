import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { apiClient, type Material, type WorkflowApplication } from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { ApiState } from "../../common/ApiState";
import { ApprovalTimeline } from "../../common/ApprovalTimeline";
import { Modal } from "../../common/Modal";
import { StatusBadge } from "../../common/StatusBadge";
import {
  formatDate,
  materialSpec,
  materialStock,
  workflowStatusLabel,
  workflowStatusTone,
  workflowTimeline,
} from "./workflowPageUtils";

type StopWorkflowMode = "stop-purchase" | "stop-use";

type SelectedMaterial = {
  material: Material;
  rowReason: string;
};

const modeConfig = {
  "stop-purchase": {
    title: "物料停采申请详情",
    listPath: "/application/stop-purchase",
    materialStatus: "normal" as const,
    modalTitle: "选择正常状态物料",
    mainReasonLabel: "停采原因说明",
    rowReasonPlaceholder: "请输入停采原因",
    submitLabel: "提交停采申请",
    emptyModalLabel: "暂无正常状态物料可选",
    preconditionLabel: "",
  },
  "stop-use": {
    title: "物料停用申请详情",
    listPath: "/application/stop-use",
    materialStatus: "stop_purchase" as const,
    modalTitle: "选择已停采物料",
    mainReasonLabel: "停用原因说明",
    rowReasonPlaceholder: "请输入停用原因",
    submitLabel: "提交停用申请",
    emptyModalLabel: "暂无已停采物料可选",
    preconditionLabel: "停用申请仅允许选择已停采物料；如无可选物料，请先完成停采。",
  },
};

export function StopWorkflowApplication({ mode }: { mode: StopWorkflowMode }) {
  const navigate = useNavigate();
  const params = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const config = modeConfig[mode];
  const isNew = params.id === "new";
  const [mainReason, setMainReason] = useState("");
  const [selected, setSelected] = useState<SelectedMaterial | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const [submittedApplication, setSubmittedApplication] = useState<WorkflowApplication | null>(null);

  const applicationQuery = useQuery({
    queryKey: ["workflow-application", params.id],
    queryFn: () => apiClient.workflowApplication(Number(params.id)),
    retry: false,
    enabled: !isNew && Boolean(params.id),
  });
  const materialsQuery = useQuery({
    queryKey: ["materials", config.materialStatus, materialSearch],
    queryFn: () => apiClient.materials({ status: config.materialStatus, search: materialSearch }),
    retry: false,
    enabled: isModalOpen,
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      const reason = selected?.rowReason.trim() || mainReason.trim();
      const payload = {
        applicant: user?.username ?? "super_admin",
        business_reason: mainReason,
        material_id: selected?.material.id ?? null,
        reason,
        reason_code: reason,
        acknowledge_terminal: mode === "stop-use",
      };
      return mode === "stop-use"
        ? apiClient.submitStopUseApplication(payload)
        : apiClient.submitStopPurchaseApplication(payload);
    },
    onSuccess: async (application) => {
      setSubmittedApplication(application);
      setFeedback(`提交成功: ${application.application_no}`);
      await queryClient.invalidateQueries({ queryKey: ["workflow-applications"] });
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "提交失败");
    },
  });

  const activeApplication = submittedApplication ?? applicationQuery.data;
  const applicationStatus = activeApplication?.status ?? "draft";
  const canSubmit = Boolean(selected && mainReason.trim() && (selected.rowReason.trim() || mainReason.trim()));

  const handleSelectMaterial = (material: Material) => {
    setSelected({ material, rowReason: "" });
    setIsModalOpen(false);
    setFeedback("");
  };

  const handleDraft = () => {
    setDraftSaved(true);
    setFeedback("草稿已保存，本页物料和原因字段已保留，尚未提交后端。");
  };

  const handleSubmit = () => {
    if (!canSubmit) {
      setFeedback("请选择物料并填写主原因和行原因后再提交。");
      return;
    }
    submitMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate(config.listPath)}
          className="rounded-lg p-2 transition-colors hover:bg-gray-100"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex flex-1 items-center justify-between">
          <h1 className="text-2xl text-gray-900">{config.title}</h1>
          <StatusBadge status={workflowStatusTone(applicationStatus)}>
            {workflowStatusLabel(applicationStatus)}
          </StatusBadge>
        </div>
      </div>

      <div className="rounded-lg bg-gray-50 p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <span className="mb-1 block text-sm text-gray-700">单据编码</span>
            <div className="rounded-lg bg-white px-3 py-2 text-sm text-gray-600">
              {activeApplication?.application_no ?? "提交后由后端生成"}
            </div>
          </div>
          <div>
            <span className="mb-1 block text-sm text-gray-700">申请人员</span>
            <div className="rounded-lg bg-white px-3 py-2 text-sm text-gray-900">{user?.username ?? "super_admin"}</div>
          </div>
          <div>
            <span className="mb-1 block text-sm text-gray-700">申请日期</span>
            <div className="rounded-lg bg-white px-3 py-2 text-sm text-gray-600">{formatDate(new Date().toISOString())}</div>
          </div>
        </div>
      </div>

      {config.preconditionLabel && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {config.preconditionLabel}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg text-gray-900">{mode === "stop-use" ? "停用信息" : "停采信息"}</h2>
        <label className="block">
          <span className="mb-1 block text-sm text-gray-700">
            {config.mainReasonLabel} <span className="text-red-500">*</span>
          </span>
          <textarea
            rows={4}
            value={mainReason}
            onChange={(event) => setMainReason(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={config.mainReasonLabel}
          />
        </label>

        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-gray-700">
              物料明细 <span className="text-red-500">*</span>
            </span>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              添加物料
            </button>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">物料编码</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">物料名称</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">规格型号</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">总库存</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">行原因</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {selected ? (
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">{selected.material.code}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{selected.material.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{materialSpec(selected.material)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{materialStock(selected.material)}</td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={selected.rowReason}
                        onChange={(event) =>
                          setSelected((current) => current && { ...current, rowReason: event.target.value })
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={config.rowReasonPlaceholder}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelected(null)}
                        className="text-red-600 hover:text-red-700"
                        aria-label="移除物料"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                      尚未选择物料
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ApprovalTimeline steps={workflowTimeline(activeApplication)} />

      {feedback && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{feedback}</div>}
      {draftSaved && selected && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
          草稿物料: {selected.material.code} / {selected.material.name}；主原因: {mainReason || "未填写"}；行原因:
          {selected.rowReason || "未填写"}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={handleDraft}
          className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
        >
          保存草稿
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitMutation.isPending || !canSubmit}
          className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitMutation.isPending ? "提交中" : config.submitLabel}
        </button>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={config.modalTitle} size="xl">
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <Search className="h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={materialSearch}
              onChange={(event) => setMaterialSearch(event.target.value)}
              className="min-w-0 flex-1 text-sm outline-none"
              placeholder="搜索物料编码、名称或规格"
            />
          </div>

          <ApiState
            isLoading={materialsQuery.isLoading}
            isError={materialsQuery.isError}
            isEmpty={(materialsQuery.data ?? []).length === 0}
            loadingLabel="正在加载可选物料..."
            errorLabel="可选物料加载失败"
            emptyLabel={mode === "stop-use" ? config.preconditionLabel : config.emptyModalLabel}
            onRetry={() => void materialsQuery.refetch()}
          >
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs text-gray-500">物料编码</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-500">物料名称</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-500">规格型号</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-500">库存</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(materialsQuery.data ?? []).map((material) => (
                    <tr key={material.id}>
                      <td className="px-4 py-3 text-sm text-gray-900">{material.code}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{material.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{materialSpec(material)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{materialStock(material)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleSelectMaterial(material)}
                          className="rounded-lg border border-blue-200 px-3 py-1 text-sm text-blue-700 hover:bg-blue-50"
                        >
                          选择
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ApiState>
        </div>
      </Modal>
    </div>
  );
}
