import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Upload } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { apiClient, type WorkflowApplication } from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { ApiState } from "../../common/ApiState";
import { ApprovalTimeline } from "../../common/ApprovalTimeline";
import { StatusBadge } from "../../common/StatusBadge";
import {
  formatDate,
  workflowStatusLabel,
  workflowStatusTone,
  workflowTimeline,
} from "./workflowPageUtils";

type CategoryFormState = {
  department: string;
  level1Id: string;
  level2Id: string;
  level3Id: string;
  proposedCategoryName: string;
  materialDefinition: string;
};

const initialForm: CategoryFormState = {
  department: "技术部",
  level1Id: "",
  level2Id: "",
  level3Id: "",
  proposedCategoryName: "",
  materialDefinition: "",
};

export function CategoryApplication() {
  const navigate = useNavigate();
  const params = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isNew = params.id === "new";
  const [form, setForm] = useState<CategoryFormState>(initialForm);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [feedback, setFeedback] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const [submittedApplication, setSubmittedApplication] = useState<WorkflowApplication | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: apiClient.categories,
    retry: false,
  });
  const librariesQuery = useQuery({
    queryKey: ["material-libraries"],
    queryFn: apiClient.materialLibraries,
    retry: false,
  });
  const applicationQuery = useQuery({
    queryKey: ["workflow-application", params.id],
    queryFn: () => apiClient.workflowApplication(Number(params.id)),
    retry: false,
    enabled: !isNew && Boolean(params.id),
  });

  const selectedParentId = Number(form.level3Id || form.level2Id || form.level1Id || 0) || null;
  const level1Options = categoriesQuery.data ?? [];
  const level2Options = useMemo(
    () => level1Options.filter((category) => String(category.id) !== form.level1Id),
    [form.level1Id, level1Options],
  );
  const level3Options = useMemo(
    () => level2Options.filter((category) => String(category.id) !== form.level2Id),
    [form.level2Id, level2Options],
  );
  const activeApplication = submittedApplication ?? applicationQuery.data;
  const applicationCode = activeApplication?.application_no ?? "提交后由后端生成";
  const applicationStatus = activeApplication?.status ?? "draft";
  const materialLibraryId = librariesQuery.data?.[0]?.id ?? null;

  const submitMutation = useMutation({
    mutationFn: () =>
      apiClient.submitNewCategoryApplication({
        applicant: user?.username ?? "super_admin",
        business_reason: form.materialDefinition,
        material_library_id: materialLibraryId,
        parent_category_id: selectedParentId,
        proposed_category_name: form.proposedCategoryName,
        description: form.materialDefinition,
      }),
    onSuccess: async (application) => {
      setSubmittedApplication(application);
      setFeedback(`提交成功: ${application.application_no}`);
      await queryClient.invalidateQueries({ queryKey: ["workflow-applications"] });
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "提交失败");
    },
  });

  const handleImageFiles = (files: FileList | null) => {
    if (!files?.length) {
      return;
    }
    const incoming = Array.from(files);
    if (imageFiles.length + incoming.length > 3) {
      setFeedback("物料图片最多上传 3 张，第四张已被阻止。");
      return;
    }
    setImageFiles((current) => [...current, ...incoming]);
    setFeedback("");
  };

  const handleDraft = () => {
    setDraftSaved(true);
    setFeedback("草稿已保存，本页字段和上传文件标签已保留，尚未提交后端。");
  };

  const submitDisabled =
    submitMutation.isPending ||
    !materialLibraryId ||
    !form.proposedCategoryName.trim() ||
    !form.materialDefinition.trim();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate("/application/category")}
          className="rounded-lg p-2 transition-colors hover:bg-gray-100"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex flex-1 items-center justify-between">
          <h1 className="text-2xl text-gray-900">新增物料类目申请详情</h1>
          <StatusBadge status={workflowStatusTone(applicationStatus)}>
            {workflowStatusLabel(applicationStatus)}
          </StatusBadge>
        </div>
      </div>

      <div className="rounded-lg bg-gray-50 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-gray-700">单据编码</span>
            <input
              type="text"
              value={applicationCode}
              readOnly
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-gray-700">申请人员</span>
            <input
              type="text"
              value={user?.username ?? "super_admin"}
              readOnly
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-gray-700">所属部门</span>
            <input
              type="text"
              value={form.department}
              onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-gray-700">申请日期</span>
            <input
              type="text"
              value={formatDate(new Date().toISOString())}
              readOnly
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-500"
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg text-gray-900">申请内容</h2>
        <ApiState
          isLoading={categoriesQuery.isLoading || librariesQuery.isLoading}
          isError={categoriesQuery.isError || librariesQuery.isError}
          isEmpty={(categoriesQuery.data ?? []).length === 0 || (librariesQuery.data ?? []).length === 0}
          loadingLabel="正在加载类目和物料库..."
          errorLabel="类目或物料库加载失败"
          emptyLabel="缺少后端类目或物料库数据，无法提交类目申请"
          onRetry={() => {
            void categoriesQuery.refetch();
            void librariesQuery.refetch();
          }}
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm text-gray-700">一级类目</span>
                <select
                  value={form.level1Id}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, level1Id: event.target.value, level2Id: "", level3Id: "" }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">请选择</option>
                  {level1Options.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-gray-700">二级类目</span>
                <select
                  value={form.level2Id}
                  onChange={(event) => setForm((current) => ({ ...current, level2Id: event.target.value, level3Id: "" }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!form.level1Id}
                >
                  <option value="">请选择</option>
                  {level2Options.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-gray-700">三级类目</span>
                <select
                  value={form.level3Id}
                  onChange={(event) => setForm((current) => ({ ...current, level3Id: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!form.level2Id}
                >
                  <option value="">请选择</option>
                  {level3Options.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm text-gray-700">
                拟新增类目名称 <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={form.proposedCategoryName}
                onChange={(event) => setForm((current) => ({ ...current, proposedCategoryName: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="请输入新类目名称"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-gray-700">
                物料定义 <span className="text-red-500">*</span>
              </span>
              <textarea
                rows={4}
                value={form.materialDefinition}
                onChange={(event) => setForm((current) => ({ ...current, materialDefinition: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="请输入物料定义"
              />
            </label>

            <div>
              <span className="mb-2 block text-sm text-gray-700">参考文件</span>
              <label className="block cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-6 text-center transition-colors hover:border-blue-500">
                <input
                  type="file"
                  className="hidden"
                  onChange={(event) => setReferenceFile(event.target.files?.[0] ?? null)}
                />
                <FileText className="mx-auto mb-2 h-7 w-7 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {referenceFile ? referenceFile.name : "点击上传 PDF、Word 或 Excel 文件"}
                </span>
              </label>
            </div>

            <div>
              <span className="mb-2 block text-sm text-gray-700">物料图片</span>
              <div className="grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map((index) => (
                  <label
                    key={index}
                    className="block cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-4 text-center transition-colors hover:border-blue-500"
                  >
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageFiles(event.target.files)} />
                    <Upload className="mx-auto mb-1 h-6 w-6 text-gray-400" />
                    <span className="text-xs text-gray-600">{imageFiles[index]?.name ?? `上传图片 ${index + 1}`}</span>
                  </label>
                ))}
              </div>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageFiles(event.target.files)} />
                继续添加图片
              </label>
            </div>
          </div>
        </ApiState>
      </div>

      <ApprovalTimeline steps={workflowTimeline(activeApplication)} />

      {feedback && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{feedback}</div>}
      {draftSaved && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
          草稿字段: {form.department} / {form.proposedCategoryName || "未填写类目"} / {form.materialDefinition || "未填写定义"}
          {referenceFile ? ` / ${referenceFile.name}` : ""}
          {imageFiles.length ? ` / 图片 ${imageFiles.map((file) => file.name).join(", ")}` : ""}
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
          onClick={() => submitMutation.mutate()}
          disabled={submitDisabled}
          className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitMutation.isPending ? "提交中" : "提交审批"}
        </button>
      </div>
    </div>
  );
}
