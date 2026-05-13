import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Upload } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import {
  apiClient,
  type ReferenceImagePayload,
  type WorkflowApplication,
} from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { ApiState } from "../../common/ApiState";
import { ApprovalTimeline } from "../../common/ApprovalTimeline";
import { StatusBadge } from "../../common/StatusBadge";
import {
  fileToReferenceImage,
  formatDate,
  workflowStatusLabel,
  workflowStatusTone,
  workflowTimeline,
} from "./workflowPageUtils";

type MaterialCodeForm = {
  categoryId: string;
  productNameId: string;
  brandId: string;
  referenceLink: string;
  description: string;
};

const initialForm: MaterialCodeForm = {
  categoryId: "",
  productNameId: "",
  brandId: "",
  referenceLink: "https://example.com/material-reference",
  description: "",
};

export function MaterialCodeApplication() {
  const navigate = useNavigate();
  const params = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isNew = params.id === "new";
  const [form, setForm] = useState<MaterialCodeForm>(initialForm);
  const [images, setImages] = useState<ReferenceImagePayload[]>([]);
  const [feedback, setFeedback] = useState("");
  const [submittedApplication, setSubmittedApplication] = useState<WorkflowApplication | null>(null);

  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: apiClient.categories, retry: false });
  const productNamesQuery = useQuery({ queryKey: ["product-names"], queryFn: apiClient.productNames, retry: false });
  const attributesQuery = useQuery({ queryKey: ["attributes", form.productNameId], queryFn: () => apiClient.attributes(Number(form.productNameId) || null), retry: false });
  const brandsQuery = useQuery({ queryKey: ["brands"], queryFn: apiClient.brands, retry: false });
  const librariesQuery = useQuery({ queryKey: ["material-libraries"], queryFn: apiClient.materialLibraries, retry: false });
  const applicationQuery = useQuery({
    queryKey: ["workflow-application", params.id],
    queryFn: () => apiClient.workflowApplication(Number(params.id)),
    retry: false,
    enabled: !isNew && Boolean(params.id),
  });

  const selectedProduct = productNamesQuery.data?.find((item) => String(item.id) === form.productNameId);
  const selectedCategory = categoriesQuery.data?.find((item) => String(item.id) === form.categoryId);
  const selectedBrand = brandsQuery.data?.find((item) => String(item.id) === form.brandId);
  const generatedMaterialName = useMemo(() => {
    const parts = [selectedProduct?.name, selectedBrand?.name].filter(Boolean);
    return parts.length ? parts.join("-") : "选择品名后自动生成";
  }, [selectedBrand?.name, selectedProduct?.name]);
  const materialLibraryId = librariesQuery.data?.[0]?.id ?? null;
  const activeApplication = submittedApplication ?? applicationQuery.data;
  const applicationStatus = activeApplication?.status ?? "draft";

  const submitMutation = useMutation({
    mutationFn: () =>
      apiClient.submitNewMaterialCodeApplication({
        applicant: user?.username ?? "super_admin",
        business_reason: form.description || "新增物料编码申请",
        material_library_id: materialLibraryId,
        category_id: Number(form.categoryId) || null,
        product_name_id: Number(form.productNameId) || null,
        material_name: generatedMaterialName,
        unit: selectedProduct?.unit ?? "",
        brand_id: Number(form.brandId) || null,
        attributes: Object.fromEntries((attributesQuery.data ?? []).map((attribute) => [attribute.name, attribute.default_value || ""])),
        description: form.description,
        reference_mall_link: form.referenceLink,
        reference_images: images,
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

  const handleImageChange = async (slot: number, file: File | undefined) => {
    if (!file) {
      return;
    }
    const payload = await fileToReferenceImage(file);
    setImages((current) => {
      const next = [...current];
      next[slot] = payload;
      return next.filter(Boolean);
    });
    setFeedback("");
  };

  const handleSubmit = () => {
    if (images.length < 3) {
      setFeedback("请上传 3 张必填图片后再提交。");
      return;
    }
    submitMutation.mutate();
  };

  const hasLookupError =
    categoriesQuery.isError ||
    productNamesQuery.isError ||
    attributesQuery.isError ||
    brandsQuery.isError ||
    librariesQuery.isError;
  const hasLookupLoading =
    categoriesQuery.isLoading ||
    productNamesQuery.isLoading ||
    attributesQuery.isLoading ||
    brandsQuery.isLoading ||
    librariesQuery.isLoading;
  const submitDisabled =
    submitMutation.isPending ||
    !materialLibraryId ||
    !form.categoryId ||
    !form.productNameId ||
    !form.referenceLink ||
    generatedMaterialName === "选择品名后自动生成";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate("/application/material-code")}
          className="rounded-lg p-2 transition-colors hover:bg-gray-100"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex flex-1 items-center justify-between">
          <h1 className="text-2xl text-gray-900">新增物料编码申请详情</h1>
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

      <ApiState
        isLoading={hasLookupLoading}
        isError={hasLookupError}
        isEmpty={(categoriesQuery.data ?? []).length === 0 || (productNamesQuery.data ?? []).length === 0}
        loadingLabel="正在加载类目、品名、属性和品牌..."
        errorLabel="编码申请选择器数据加载失败"
        emptyLabel="缺少后端类目或品名数据，无法提交编码申请"
        onRetry={() => {
          void categoriesQuery.refetch();
          void productNamesQuery.refetch();
          void attributesQuery.refetch();
          void brandsQuery.refetch();
          void librariesQuery.refetch();
        }}
      >
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg text-gray-900">物料信息</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-gray-700">类目</span>
              <select
                value={form.categoryId}
                onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">请选择类目</option>
                {(categoriesQuery.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-gray-700">品名</span>
              <select
                value={form.productNameId}
                onChange={(event) => setForm((current) => ({ ...current, productNameId: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">请选择品名</option>
                {(productNamesQuery.data ?? []).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-gray-700">品牌</span>
              <select
                value={form.brandId}
                onChange={(event) => setForm((current) => ({ ...current, brandId: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">不指定品牌</option>
                {(brandsQuery.data ?? []).map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="mb-1 block text-sm text-gray-700">自动生成物料名称</span>
              <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">{generatedMaterialName}</div>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            类目路径: {selectedCategory?.name ?? "未选择"} / 单位: {selectedProduct?.unit ?? "未选择品名"} / 属性模板:
            {(attributesQuery.data ?? []).length ? ` ${(attributesQuery.data ?? []).map((attribute) => attribute.name).join(", ")}` : " 暂无"}
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm text-gray-700">参考商城链接</span>
            <input
              type="url"
              value={form.referenceLink}
              onChange={(event) => setForm((current) => ({ ...current, referenceLink: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com/item"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm text-gray-700">申请说明</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入新增编码原因"
            />
          </label>

          <div className="mt-4">
            <span className="mb-2 block text-sm text-gray-700">参考图片</span>
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((slot) => (
                <label
                  key={slot}
                  className="block cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-4 text-center transition-colors hover:border-blue-500"
                >
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => void handleImageChange(slot, event.target.files?.[0])} />
                  <Upload className="mx-auto mb-1 h-6 w-6 text-gray-400" />
                  <span className="text-xs text-gray-600">
                    图片 {slot + 1} <span className="text-red-500">*</span>
                    {images[slot] ? ` ${images[slot].filename}` : ""}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </ApiState>

      <ApprovalTimeline steps={workflowTimeline(activeApplication)} />

      {feedback && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{feedback}</div>}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => navigate("/application/material-code")}
          className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
        >
          返回列表
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitDisabled}
          className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitMutation.isPending ? "提交中" : "提交审批"}
        </button>
      </div>
    </div>
  );
}
