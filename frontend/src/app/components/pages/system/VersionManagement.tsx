import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  apiClient,
  type ApplicationVersion,
  type ApplicationVersionPayload,
} from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";

type ManagedApplicationVersion = ApplicationVersion & { id: number };

const emptyForm: ApplicationVersionPayload = {
  version: "",
  title: "",
  release_notes: "",
};

const labels = {
  title: "版本管理",
  help: "维护产品版本和发布说明；发布后，“关于”窗口会立即显示当前版本。",
  add: "新增版本",
  edit: "编辑版本",
  version: "版本号",
  releaseTitle: "版本标题",
  releaseNotes: "发布说明",
  status: "状态",
  releasedAt: "发布时间",
  createdBy: "创建人",
  actions: "操作",
  draft: "草稿",
  published: "当前版本",
  archived: "已归档",
  publish: "发布",
  delete: "删除",
  save: "保存",
  saving: "保存中...",
  cancel: "取消",
  empty: "暂无版本记录",
  publishTitle: "发布产品版本",
  publishConfirm: (version: string) =>
    `确定发布 v${version} 吗？当前已发布版本将自动归档。`,
  deleteTitle: "删除版本",
  deleteConfirm: (version: string) =>
    `确定删除 v${version} 吗？此操作无法撤销。`,
  saved: "版本已保存",
  publishedMessage: "版本已发布，“关于”内容已更新",
  deleted: "版本已删除",
  failed: "操作失败",
};

function isManagedVersion(version: ApplicationVersion): version is ManagedApplicationVersion {
  return version.id !== null;
}

function toForm(version: ManagedApplicationVersion): ApplicationVersionPayload {
  return {
    version: version.version,
    title: version.title,
    release_notes: version.release_notes,
  };
}

export function VersionManagement() {
  const text = labels;
  const locale = "zh-CN";
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ApplicationVersionPayload>(emptyForm);
  const [editingVersion, setEditingVersion] = useState<ManagedApplicationVersion | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [versionToPublish, setVersionToPublish] = useState<ManagedApplicationVersion | null>(null);
  const [versionToDelete, setVersionToDelete] = useState<ManagedApplicationVersion | null>(null);

  const query = useQuery({
    queryKey: ["application-versions"],
    queryFn: apiClient.applicationVersions,
    retry: false,
  });

  const refreshVersions = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["application-versions"] }),
      queryClient.invalidateQueries({ queryKey: ["current-application-version"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: ApplicationVersionPayload) =>
      editingVersion
        ? apiClient.updateApplicationVersion(editingVersion.id, payload)
        : apiClient.createApplicationVersion(payload),
    onSuccess: async () => {
      toast.success(text.saved);
      setIsFormOpen(false);
      setEditingVersion(null);
      setForm(emptyForm);
      await refreshVersions();
    },
    onError: (error) => toast.error(`${text.failed}: ${error.message}`),
  });

  const publishMutation = useMutation({
    mutationFn: (id: number) => apiClient.publishApplicationVersion(id),
    onSuccess: async () => {
      toast.success(text.publishedMessage);
      setVersionToPublish(null);
      await refreshVersions();
    },
    onError: (error) => toast.error(`${text.failed}: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteApplicationVersion(id),
    onSuccess: async () => {
      toast.success(text.deleted);
      setVersionToDelete(null);
      await refreshVersions();
    },
    onError: (error) => toast.error(`${text.failed}: ${error.message}`),
  });

  const versions = (query.data ?? []).filter(isManagedVersion);
  const statusLabel = (status: ApplicationVersion["status"]) => {
    if (status === "published") return text.published;
    if (status === "archived") return text.archived;
    return text.draft;
  };

  const openCreate = () => {
    setEditingVersion(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  };

  const openEdit = (version: ManagedApplicationVersion) => {
    setEditingVersion(version);
    setForm(toForm(version));
    setIsFormOpen(true);
  };

  const columns = [
    {
      header: text.version,
      accessor: (version: ManagedApplicationVersion) => (
        <span className="font-semibold text-foreground">v{version.version}</span>
      ),
    },
    { header: text.releaseTitle, accessor: "title" as keyof ManagedApplicationVersion },
    {
      header: text.status,
      accessor: (version: ManagedApplicationVersion) => (
        <Badge variant={version.status === "published" ? "default" : "secondary"}>
          {statusLabel(version.status)}
        </Badge>
      ),
    },
    {
      header: text.releasedAt,
      accessor: (version: ManagedApplicationVersion) =>
        version.released_at
          ? new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(version.released_at))
          : "—",
    },
    { header: text.createdBy, accessor: "created_by" as keyof ManagedApplicationVersion },
    {
      header: text.actions,
      accessor: (version: ManagedApplicationVersion) => (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(version)}>
            <Edit className="h-3.5 w-3.5" />
            {text.edit}
          </Button>
          {version.status !== "published" && (
            <Button type="button" size="sm" onClick={() => setVersionToPublish(version)}>
              <Rocket className="h-3.5 w-3.5" />
              {text.publish}
            </Button>
          )}
          {version.status !== "published" && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setVersionToDelete(version)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {text.delete}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-foreground">{text.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{text.help}</p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {text.add}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ApiState
          isLoading={query.isLoading}
          isError={query.isError}
          isEmpty={!query.isLoading && !query.isError && versions.length === 0}
          emptyLabel={text.empty}
          onRetry={() => void query.refetch()}
        >
          <DataTable data={versions} columns={columns} />
        </ApiState>
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingVersion ? text.edit : text.add}
        size="lg"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              {text.cancel}
            </Button>
            <Button
              type="button"
              disabled={saveMutation.isPending || !form.version.trim()}
              onClick={() =>
                saveMutation.mutate({
                  version: form.version.trim(),
                  title: form.title.trim(),
                  release_notes: form.release_notes.trim(),
                })
              }
            >
              {saveMutation.isPending ? text.saving : text.save}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1 text-sm text-foreground">
            <span>{text.version}</span>
            <Input
              aria-label={text.version}
              value={form.version}
              onChange={(event) =>
                setForm((current) => ({ ...current, version: event.target.value }))
              }
              placeholder="5.0.0"
            />
          </label>
          <label className="block space-y-1 text-sm text-foreground">
            <span>{text.releaseTitle}</span>
            <Input
              aria-label={text.releaseTitle}
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder={locale === "zh-CN" ? "版本标题" : "Release title"}
            />
          </label>
          <label className="block space-y-1 text-sm text-foreground">
            <span>{text.releaseNotes}</span>
            <Textarea
              aria-label={text.releaseNotes}
              value={form.release_notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, release_notes: event.target.value }))
              }
              rows={7}
            />
          </label>
        </div>
      </Modal>

      <AlertDialog
        open={Boolean(versionToPublish)}
        onOpenChange={(open) => !open && setVersionToPublish(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text.publishTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {versionToPublish ? text.publishConfirm(versionToPublish.version) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                versionToPublish && publishMutation.mutate(versionToPublish.id)
              }
              disabled={publishMutation.isPending}
            >
              {text.publish}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(versionToDelete)}
        onOpenChange={(open) => !open && setVersionToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {versionToDelete ? text.deleteConfirm(versionToDelete.version) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                versionToDelete && deleteMutation.mutate(versionToDelete.id)
              }
              disabled={deleteMutation.isPending}
            >
              {text.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
