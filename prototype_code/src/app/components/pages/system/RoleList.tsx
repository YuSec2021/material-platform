import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Link2, Plus, Search, Trash2 } from "lucide-react";
import { apiClient, type Role, type RolePayload, type User, type UserSummary } from "@/app/api/client";
import { ApiState } from "../../common/ApiState";
import { DataTable } from "../../common/DataTable";
import { Modal } from "../../common/Modal";

type RoleFormState = {
  name: string;
  code: string;
  description: string;
  enabled: boolean;
};

const emptyForm: RoleFormState = {
  name: "",
  code: "",
  description: "",
  enabled: true,
};

function roleToForm(role: Role): RoleFormState {
  return {
    name: role.name,
    code: role.code,
    description: role.description,
    enabled: role.enabled,
  };
}

function formToPayload(form: RoleFormState): RolePayload {
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    description: form.description.trim(),
    enabled: form.enabled,
  };
}

function mutationError(error: unknown) {
  return error instanceof Error ? error.message : "后端操作失败";
}

export function RoleList() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<RoleFormState>(emptyForm);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [bindingRole, setBindingRole] = useState<Role | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  const query = useQuery({
    queryKey: ["roles"],
    queryFn: apiClient.roles,
    retry: false,
  });

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: apiClient.users,
    enabled: Boolean(bindingRole),
    retry: false,
  });

  const roleUsersQuery = useQuery({
    queryKey: ["roles", bindingRole?.id, "users"],
    queryFn: () => apiClient.roleUsers(bindingRole?.id ?? 0),
    enabled: Boolean(bindingRole),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: RolePayload) =>
      editingRole ? apiClient.updateRole(editingRole.id, payload) : apiClient.createRole(payload),
    onSuccess: async () => {
      setIsFormOpen(false);
      setEditingRole(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (role: Role) => (role.enabled ? apiClient.disableRole(role.id) : apiClient.enableRole(role.id)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (role: Role) => apiClient.deleteRole(role.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  const addUserMutation = useMutation({
    mutationFn: ({ roleId, userId }: { roleId: number; userId: number }) => apiClient.addRoleUser(roleId, userId),
    onSuccess: async () => {
      setSelectedUserId("");
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await queryClient.invalidateQueries({ queryKey: ["roles", bindingRole?.id, "users"] });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: ({ roleId, userId }: { roleId: number; userId: number }) => apiClient.removeRoleUser(roleId, userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await queryClient.invalidateQueries({ queryKey: ["roles", bindingRole?.id, "users"] });
    },
  });

  const data = useMemo(() => {
    const term = searchTerm.trim();
    const roles = query.data ?? [];
    if (!term) {
      return roles;
    }
    return roles.filter((item) =>
      [item.name, item.code, item.description].some((value) => value.toLowerCase().includes(term.toLowerCase())),
    );
  }, [query.data, searchTerm]);

  const boundUsers = roleUsersQuery.data ?? bindingRole?.users ?? [];
  const boundUserIds = useMemo(() => new Set(boundUsers.map((user) => user.id)), [boundUsers]);
  const availableUsers = useMemo(
    () => (usersQuery.data ?? []).filter((user) => !boundUserIds.has(user.id)),
    [boundUserIds, usersQuery.data],
  );

  const openCreateForm = () => {
    setEditingRole(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  };

  const openEditForm = (role: Role) => {
    setEditingRole(role);
    setForm(roleToForm(role));
    setIsFormOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.code.trim()) {
      return;
    }
    saveMutation.mutate(formToPayload(form));
  };

  const handleDelete = (role: Role) => {
    if (window.confirm(`确定删除角色 ${role.name} 吗？`)) {
      deleteMutation.mutate(role);
    }
  };

  const openBindingModal = (role: Role) => {
    setBindingRole(role);
    setSelectedUserId("");
  };

  const addSelectedUser = () => {
    const roleId = bindingRole?.id;
    const userId = Number(selectedUserId);
    if (!roleId || !userId) {
      return;
    }
    addUserMutation.mutate({ roleId, userId });
  };

  const removeBoundUser = (user: UserSummary) => {
    const roleId = bindingRole?.id;
    if (!roleId) {
      return;
    }
    removeUserMutation.mutate({ roleId, userId: user.id });
  };

  const columns = [
    { header: "角色名称", accessor: "name" as keyof Role },
    { header: "角色代码", accessor: "code" as keyof Role },
    { header: "描述", accessor: "description" as keyof Role },
    {
      header: "启用状态",
      accessor: (row: Role) => (
        <span className={`rounded px-2 py-1 text-xs ${row.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
          {row.enabled ? "已启用" : "已停用"}
        </span>
      ),
    },
    {
      header: "用户数",
      accessor: (row: Role) => row.user_count,
    },
    {
      header: "权限数",
      accessor: (row: Role) => `${row.permissions.length} 项`,
    },
    {
      header: "操作",
      accessor: (row: Role) => (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openEditForm(row)}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
          >
            <Edit className="h-3.5 w-3.5" />
            编辑
          </button>
          <button
            type="button"
            onClick={() => openBindingModal(row)}
            className="inline-flex items-center gap-1 rounded-md border border-purple-200 px-2.5 py-1.5 text-xs text-purple-700 hover:bg-purple-50"
          >
            <Link2 className="h-3.5 w-3.5" />
            绑定用户
          </button>
          <button
            type="button"
            onClick={() => toggleMutation.mutate(row)}
            disabled={toggleMutation.isPending}
            className="rounded-md border border-orange-200 px-2.5 py-1.5 text-xs text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {row.enabled ? "停用" : "启用"}
          </button>
          <button
            type="button"
            onClick={() => handleDelete(row)}
            disabled={deleteMutation.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-900">角色管理</h1>
          <p className="mt-1 text-sm text-gray-500">角色数据来自后端 API，支持 CRUD、启停和用户绑定。</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          新增角色
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <label className="flex max-w-md items-center gap-2 text-sm text-gray-700">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="搜索角色名称、代码或描述..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="flex-1 outline-none"
          />
        </label>
      </div>

      {(saveMutation.isError || toggleMutation.isError || deleteMutation.isError) && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {mutationError(saveMutation.error ?? toggleMutation.error ?? deleteMutation.error)}
        </div>
      )}

      <ApiState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && data.length === 0}
        emptyLabel="后端暂无角色数据"
        onRetry={() => void query.refetch()}
      >
        <DataTable data={data} columns={columns} />
      </ApiState>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingRole ? "编辑角色" : "新增角色"}
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
              disabled={saveMutation.isPending || !form.name.trim() || !form.code.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {saveMutation.isPending ? "保存中..." : "保存"}
            </button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>角色名称</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>角色代码</span>
            <input
              type="text"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700 md:col-span-2">
            <span>描述</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300"
            />
            启用角色
          </label>
          {saveMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">
              {mutationError(saveMutation.error)}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(bindingRole)}
        onClose={() => setBindingRole(null)}
        title={`绑定用户${bindingRole ? ` - ${bindingRole.name}` : ""}`}
        size="lg"
      >
        <div className="flex flex-col gap-5">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            当前角色用户数会在添加或移除后同步刷新。
          </div>
          <ApiState
            isLoading={usersQuery.isLoading || roleUsersQuery.isLoading}
            isError={usersQuery.isError || roleUsersQuery.isError}
            isEmpty={false}
            onRetry={() => {
              void usersQuery.refetch();
              void roleUsersQuery.refetch();
            }}
          >
            <div className="flex gap-2">
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">选择可绑定用户</option>
                {availableUsers.map((user: User) => (
                  <option key={user.id} value={user.id}>
                    {user.display_name}（{user.username}）
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addSelectedUser}
                disabled={!selectedUserId || addUserMutation.isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                添加
              </button>
            </div>

            <div className="rounded-lg border border-gray-200">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                已绑定用户
              </div>
              <div className="divide-y divide-gray-200">
                {boundUsers.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-500">暂无已绑定用户</p>
                ) : (
                  boundUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium text-gray-900">{user.display_name}</p>
                        <p className="text-gray-500">{user.username} / {user.department || "未设置部门"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeBoundUser(user)}
                        disabled={removeUserMutation.isPending}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-400"
                      >
                        移除
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            {(addUserMutation.isError || removeUserMutation.isError) && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {mutationError(addUserMutation.error ?? removeUserMutation.error)}
              </p>
            )}
          </ApiState>
        </div>
      </Modal>
    </div>
  );
}
