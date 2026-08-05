import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, ImageIcon, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient, type Brand, type BrandLogo, type BrandPayload } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";
import { SearchPanel } from "./standardPageUtils";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Switch } from "@/app/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/app/components/ui/alert";

type BrandFormState = {
  name: string;
  description: string;
  logo: BrandLogo;
};

const emptyLogo: BrandLogo = {
  filename: "",
  content_type: "",
  data_url: "",
};

const emptyForm: BrandFormState = {
  name: "",
  description: "",
  logo: emptyLogo,
};

function brandToForm(brand: Brand): BrandFormState {
  return {
    name: brand.name,
    description: brand.description,
    logo: brand.logo,
  };
}

function formToPayload(form: BrandFormState): BrandPayload {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    logo: form.logo,
  };
}

function LogoCell({ brand }: { brand: Brand }) {
  if (brand.logo?.data_url) {
    return (
      <img
        src={brand.logo.data_url}
        alt={`${brand.name} logo`}
        className="h-10 w-10 rounded-md border border-border object-cover"
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <ImageIcon className="h-4 w-4" />
      未上传
    </span>
  );
}

export function BrandList() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<BrandFormState>(emptyForm);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null);

  const query = useQuery({
    queryKey: ["brands"],
    queryFn: apiClient.brands,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: BrandPayload) =>
      editingBrand ? apiClient.updateBrand(editingBrand.id, payload) : apiClient.createBrand(payload),
    onSuccess: async () => {
      setBrandToDelete(null);
      setIsFormOpen(false);
      setEditingBrand(null);
      setForm(emptyForm);
      toast.success(t("toast.saveSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (error) => toast.error(`${t("toast.saveFailed")}: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteBrand(id),
    onSuccess: async () => {
      toast.success(t("toast.deleteSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (error) => toast.error(`${t("toast.deleteFailed")}: ${error.message}`),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiClient.updateBrandStatus(id, enabled),
    onSuccess: async (brand) => {
      toast.success(`品牌“${brand.name}”已${brand.enabled ? "启用" : "停用"}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["brands"] }),
        queryClient.invalidateQueries({ queryKey: ["attributes"] }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const data = useMemo(() => {
    const term = searchTerm.trim();
    const brands = query.data ?? [];
    if (!term) {
      return brands;
    }
    return brands.filter((item) =>
      [item.name, item.code, item.description].some((value) => value.includes(term)),
    );
  }, [query.data, searchTerm]);

  const openCreateForm = () => {
    setEditingBrand(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  };

  const openEditForm = (brand: Brand) => {
    setEditingBrand(brand);
    setForm(brandToForm(brand));
    setIsFormOpen(true);
  };

  const handleFile = (file: File | null) => {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({
        ...current,
        logo: {
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          data_url: String(reader.result ?? ""),
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    saveMutation.mutate(formToPayload(form));
  };

  const columns = [
    {
      header: "Logo",
      accessor: (row: Brand) => <LogoCell brand={row} />,
    },
    { header: "品牌名称", accessor: "name" as keyof Brand },
    { header: "品牌编码", accessor: "code" as keyof Brand },
    { header: "描述", accessor: "description" as keyof Brand },
    {
      header: "状态",
      accessor: (row: Brand) => (
        <Switch
          checked={row.enabled}
          aria-label={`${row.name}当前${row.enabled ? "启用" : "停用"}，点击${row.enabled ? "停用" : "启用"}`}
          disabled={statusMutation.isPending}
          onCheckedChange={(enabled) => statusMutation.mutate({ id: row.id, enabled })}
          className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-red-600"
        />
      ),
    },
    {
      header: "操作",
      accessor: (row: Brand) => (
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => openEditForm(row)}
            variant="outline"
            size="sm"
          >
            <Edit className="h-3.5 w-3.5" />
                  {t("action.edit")}
          </Button>
          <Button
            type="button"
            onClick={() => setBrandToDelete(row)}
            variant="destructive"
            size="sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("action.delete")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-foreground">{t("page.brands")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("page.brandsHelp")}</p>
        </div>
        <Button
          type="button"
          onClick={openCreateForm}
        >
          <Plus className="h-4 w-4" />
          {t("action.addBrand")}
        </Button>
      </div>

      <SearchPanel value={searchTerm} onChange={setSearchTerm} placeholder={t("field.searchBrands")} />

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && data.length === 0}
        emptyLabel={t("state.emptyBrands")}
        onRetry={() => void query.refetch()}
      >
        <DataTable data={data} columns={columns} />
      </ApiState>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingBrand ? t("action.edit") : t("action.addBrand")}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              onClick={() => setIsFormOpen(false)}
              variant="outline"
            >
              {t("action.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!form.name.trim() || saveMutation.isPending}
              aria-busy={saveMutation.isPending}
            >
              {saveMutation.isPending ? t("action.saving") : t("action.save")}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("field.name")}</span>
            <Input
              aria-label={t("field.name")}
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("field.code")}</span>
            <Input
              aria-label={t("field.code")}
              type="text"
              value={editingBrand?.code ?? "保存后自动生成"}
              readOnly
              className="bg-muted/40 text-muted-foreground"
            />
          </label>
          <label className="space-y-1 text-sm text-foreground md:col-span-2">
            <span>{t("field.description")}</span>
            <Textarea
              aria-label={t("field.description")}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>Logo 文件</span>
            <Input
              aria-label="Logo 文件"
              type="file"
              accept="image/*"
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>Logo data URL</span>
            <Input
              aria-label="Logo data URL"
              type="text"
              value={form.logo.data_url}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  logo: {
                    filename: current.logo.filename || "logo-data-url",
                    content_type: current.logo.content_type || "image/png",
                    data_url: event.target.value,
                  },
                }))
              }
              placeholder="data:image/png;base64,..."
            />
          </label>
          {form.logo.data_url && (
            <div className="md:col-span-2">
              <p className="mb-2 text-sm text-foreground">Logo 预览</p>
              <img src={form.logo.data_url} alt="Logo 预览" className="h-14 w-14 rounded-md border border-border object-cover" />
            </div>
          )}
          {saveMutation.isError && (
            <Alert variant="destructive" className="md:col-span-2">
              <AlertDescription>保存失败，请检查品牌名称是否重复或后端返回。</AlertDescription>
            </Alert>
          )}
        </div>
      </Modal>

      <AlertDialog open={Boolean(brandToDelete)} onOpenChange={(open) => !open && setBrandToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除品牌</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除品牌 {brandToDelete?.name} 吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => brandToDelete && deleteMutation.mutate(brandToDelete.id)}
              disabled={deleteMutation.isPending}
              aria-busy={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
