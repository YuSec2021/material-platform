import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, KeyRound, Plus, Search, Trash2 } from "lucide-react";
import {
  apiClient,
  type PasswordResetResult,
  type User,
  type UserPayload,
  type UserUpdatePayload,
} from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";

type UserFormState = {
  username: string;
  display_name: string;
  unit: string;
  department: string;
  team: string;
  email: string;
  status: string;
};

const emptyForm: UserFormState = {
  username: "",
  display_name: "",
  unit: "",
  department: "",
  team: "",
  email: "",
  status: "active",
};

function isLocalUser(user: User) {
  return user.account_ownership.toLowerCase() === "local";
}

function userToForm(user: User): UserFormState {
  return {
    username: user.username,
    display_name: user.display_name,
    unit: user.unit,
    department: user.department,
    team: user.team,
    email: user.email,
    status: user.status,
  };
}

function formToCreatePayload(form: UserFormState): UserPayload {
  return {
    username: form.username.trim(),
    display_name: form.display_name.trim(),
    unit: form.unit.trim(),
    department: form.department.trim(),
    team: form.team.trim(),
    email: form.email.trim(),
    status: form.status,
  };
}

function formToUpdatePayload(form: UserFormState): UserUpdatePayload {
  return {
    display_name: form.display_name.trim(),
    unit: form.unit.trim(),
    department: form.department.trim(),
    team: form.team.trim(),
    email: form.email.trim(),
    status: form.status,
  };
}

function mutationError(error: unknown) {
  return error instanceof Error ? error.message : "后端操作失败";
}

export function UserList() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [resetResult, setResetResult] = useState<PasswordResetResult | null>(null);
  const [hcmMessage, setHcmMessage] = useState("");

  const query = useQuery({
    queryKey: ["users"],
    queryFn: apiClient.users,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: UserPayload | UserUpdatePayload) =>
      editingUser
        ? apiClient.updateUser(editingUser.id, payload as UserUpdatePayload)
        : apiClient.createUser(payload as UserPayload),
    onSuccess: async () => {
      setIsFormOpen(false);
      setEditingUser(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: (user: User) => apiClient.resetUserPassword(user.id),
    onSuccess: async (result) => {
      setResetResult(result);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (user: User) => apiClient.deleteUser(user.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const data = useMemo(() => {
    const term = searchTerm.trim();
    const users = query.data ?? [];
    if (!term) {
      return users;
    }
    return users.filter((item) =>
      [item.username, item.display_name, item.unit, item.department, item.team, item.account_ownership]
        .some((value) => value.toLowerCase().includes(term.toLowerCase())),
    );
  }, [query.data, searchTerm]);

  const openCreateForm = () => {
    setHcmMessage("");
    setEditingUser(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  };

  const openEditForm = (user: User) => {
    if (!isLocalUser(user)) {
      setHcmMessage("HCM 同步用户不可在本地编辑。");
      return;
    }
    setHcmMessage("");
    setEditingUser(user);
    setForm(userToForm(user));
    setIsFormOpen(true);
  };

  const handleResetPassword = (user: User) => {
    if (!isLocalUser(user)) {
      setHcmMessage("HCM 同步用户不可重置本地密码。");
      return;
    }
    setHcmMessage("");
    resetMutation.mutate(user);
  };

  const handleDelete = (user: User) => {
    if (!isLocalUser(user)) {
      setHcmMessage("HCM 同步用户不可在本地删除。");
      return;
    }
    if (window.confirm(`确定删除用户 ${user.username} 吗？`)) {
      setHcmMessage("");
      deleteMutation.mutate(user);
    }
  };

  const handleSubmit = () => {
    if (!form.display_name.trim() || (!editingUser && !form.username.trim())) {
      return;
    }
    saveMutation.mutate(editingUser ? formToUpdatePayload(form) : formToCreatePayload(form));
  };

  const columns = [
    { header: "编号", accessor: "id" as keyof User },
    { header: "用户名", accessor: "username" as keyof User },
    { header: "姓名", accessor: "display_name" as keyof User },
    { header: "单位", accessor: "unit" as keyof User },
    { header: "部门", accessor: "department" as keyof User },
    { header: "班组", accessor: "team" as keyof User },
    { header: "账号归属", accessor: "account_ownership" as keyof User },
    {
      header: "操作",
      accessor: (row: User) => {
        const local = isLocalUser(row);
        return (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openEditForm(row)}
              disabled={!local}
              title={local ? "编辑本地用户" : "HCM 用户不可编辑"}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
            >
              <Edit className="h-3.5 w-3.5" />
              编辑
            </button>
            <button
              type="button"
              onClick={() => handleResetPassword(row)}
              disabled={!local || resetMutation.isPending}
              title={local ? "重置本地密码" : "HCM 用户不可重置密码"}
              className="inline-flex items-center gap-1 rounded-md border border-orange-200 px-2.5 py-1.5 text-xs text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
            >
              <KeyRound className="h-3.5 w-3.5" />
              重置密码
            </button>
            <button
              type="button"
              onClick={() => handleDelete(row)}
              disabled={!local || deleteMutation.isPending}
              title={local ? "删除本地用户" : "HCM 用户不可删除"}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-900">用户管理</h1>
          <p className="mt-1 text-sm text-gray-500">HCM 用户只读，本地用户支持新增、编辑、重置密码和删除。</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          新增用户
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <label className="flex max-w-md items-center gap-2 text-sm text-gray-700">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="搜索用户名、姓名、单位、部门或班组..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="flex-1 outline-none"
          />
        </label>
      </div>

      {(hcmMessage || saveMutation.isError || resetMutation.isError || deleteMutation.isError) && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          {hcmMessage ||
            mutationError(saveMutation.error ?? resetMutation.error ?? deleteMutation.error)}
        </div>
      )}

      {resetResult && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <p>{resetResult.message}</p>
          <p className="mt-1 font-mono">临时密码：{resetResult.temporary_password}</p>
          <p className="font-mono">重置令牌：{resetResult.reset_token}</p>
        </div>
      )}

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && data.length === 0}
        emptyLabel="后端暂无用户数据"
        onRetry={() => void query.refetch()}
      >
        <DataTable data={data} columns={columns} />
      </ApiState>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingUser ? "编辑本地用户" : "新增本地用户"}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saveMutation.isPending || !form.display_name.trim() || (!editingUser && !form.username.trim())}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {saveMutation.isPending ? "保存中..." : "保存"}
            </button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>用户名</span>
            <input
              type="text"
              value={form.username}
              readOnly={Boolean(editingUser)}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 read-only:bg-gray-50 read-only:text-gray-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>姓名</span>
            <input
              type="text"
              value={form.display_name}
              onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>单位</span>
            <input
              type="text"
              value={form.unit}
              onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>部门</span>
            <input
              type="text"
              value={form.department}
              onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>班组</span>
            <input
              type="text"
              value={form.team}
              onChange={(event) => setForm((current) => ({ ...current, team: event.target.value }))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>邮箱</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>状态</span>
            <select
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
          {saveMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">
              {mutationError(saveMutation.error)}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
