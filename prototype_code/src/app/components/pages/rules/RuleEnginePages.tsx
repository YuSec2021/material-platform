import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eraser,
  ListChecks,
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  apiClient,
  type Rule,
  type RuleCategory,
  type RulePayload,
} from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { ApiState } from "@/app/components/common/ApiState";
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
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Textarea } from "@/app/components/ui/textarea";

type RuleFormState = {
  categoryId: string;
  name: string;
  description: string;
  pattern: string;
  value: string;
  options: string;
  priority: number;
  enabled: boolean;
};

type RuleFormErrors = Partial<Record<keyof RuleFormState, string>>;

const CATEGORY_ICONS = {
  unit_normalization: SlidersHorizontal,
  brand_alias: Tags,
  title_cleaning: Eraser,
  enum_validation: ListChecks,
  required_field_check: BadgeCheck,
  blackwhite_list: Ban,
};

const DEFAULT_PAGE_SIZE = 5;

const emptyForm: RuleFormState = {
  categoryId: "none",
  name: "",
  description: "",
  pattern: "",
  value: "",
  options: "",
  priority: 100,
  enabled: true,
};

function categoryName(category: RuleCategory, language: string) {
  return language === "en-US" ? category.display_name_en : category.display_name_zh;
}

function categoryDescription(category: RuleCategory, language: string) {
  return language === "en-US" ? category.description_en : category.description_zh;
}

function CategoryIcon({ slug }: { slug: string }) {
  const Icon = CATEGORY_ICONS[slug as keyof typeof CATEGORY_ICONS] ?? ShieldCheck;
  return <Icon className="h-5 w-5" aria-hidden="true" />;
}

function mutationMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operation failed";
}

function formatOptions(options: Rule["options"]) {
  try {
    return JSON.stringify(options, null, 2);
  } catch {
    return "{}";
  }
}

function ruleToForm(rule: Rule): RuleFormState {
  return {
    categoryId: String(rule.category_id),
    name: rule.name,
    description: rule.description,
    pattern: rule.pattern,
    value: rule.value,
    options: formatOptions(rule.options),
    priority: rule.priority,
    enabled: rule.enabled,
  };
}

function validateForm(form: RuleFormState, t: (key: string) => string): { errors: RuleFormErrors; payload: RulePayload | null } {
  const errors: RuleFormErrors = {};

  if (form.categoryId === "none") {
    errors.categoryId = t("rules.validationRequired");
  }
  if (!form.name.trim()) {
    errors.name = t("rules.validationRequired");
  }
  if (!form.description.trim()) {
    errors.description = t("rules.validationRequired");
  }
  if (!form.pattern.trim()) {
    errors.pattern = t("rules.validationRequired");
  }
  if (!form.value.trim()) {
    errors.value = t("rules.validationRequired");
  }
  if (!form.options.trim()) {
    errors.options = t("rules.validationRequired");
  }

  let parsedOptions: Record<string, unknown> | unknown[] = {};
  if (form.options.trim()) {
    try {
      const parsed = JSON.parse(form.options) as unknown;
      if (parsed && typeof parsed === "object") {
        parsedOptions = parsed as Record<string, unknown> | unknown[];
      } else {
        errors.options = t("rules.validationJson");
      }
    } catch {
      errors.options = t("rules.validationJson");
    }
  }

  if (!Number.isFinite(form.priority)) {
    errors.priority = t("rules.validationRequired");
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null };
  }

  return {
    errors,
    payload: {
      category_id: Number(form.categoryId),
      name: form.name.trim(),
      description: form.description.trim(),
      pattern: form.pattern.trim(),
      value: form.value.trim(),
      options: parsedOptions,
      priority: Number(form.priority),
      enabled: form.enabled,
    },
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <p className="text-xs font-medium text-red-600">{message}</p>;
}

function RuleStatus({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge variant={enabled ? "default" : "secondary"}>
      {enabled ? t("status.enabled") : t("status.disabled")}
    </Badge>
  );
}

export function RuleCategoryListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const categoriesQuery = useQuery({
    queryKey: ["rule-categories"],
    queryFn: apiClient.ruleCategories,
    retry: false,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{t("rules.categoriesTitle")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("rules.categoriesHelp")}</p>
      </div>

      <ApiState
        isLoading={categoriesQuery.isLoading}
        isError={categoriesQuery.isError}
        isEmpty={(categoriesQuery.data ?? []).length === 0}
        emptyLabel={t("rules.emptyCategories")}
        onRetry={() => void categoriesQuery.refetch()}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(categoriesQuery.data ?? []).map((category) => (
            <button
              key={category.slug}
              type="button"
              onClick={() => navigate(`/rules?category_id=${category.id}`)}
              className="flex min-h-44 flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <CategoryIcon slug={category.slug} />
                  </span>
                  <div>
                    <h2 className="font-semibold text-gray-900">{categoryName(category, i18n.language)}</h2>
                    <p className="font-mono text-xs text-gray-500">{category.slug}</p>
                  </div>
                </div>
                <Badge variant="secondary">{category.rule_count}</Badge>
              </div>
              <p className="line-clamp-3 text-sm leading-6 text-gray-600">
                {categoryDescription(category, i18n.language)}
              </p>
            </button>
          ))}
        </div>
      </ApiState>
    </div>
  );
}

export function RuleListPage() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);

  const categoryId = Number(searchParams.get("category_id") || "") || null;
  const search = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.max(1, Number(searchParams.get("page_size") || String(DEFAULT_PAGE_SIZE)));
  const isSuperAdmin = Boolean(auth.user?.is_super_admin);

  const updateParams = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null || value === "") {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    });
    setSearchParams(next);
  };

  const categoriesQuery = useQuery({
    queryKey: ["rule-categories"],
    queryFn: apiClient.ruleCategories,
    retry: false,
  });
  const rulesQuery = useQuery({
    queryKey: ["rules", categoryId, search, page, pageSize],
    queryFn: () => apiClient.rules({ category_id: categoryId, search, page, page_size: pageSize }),
    retry: false,
  });

  const toggleMutation = useMutation({
    mutationFn: (rule: Rule) => apiClient.toggleRule(rule.id, !rule.enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rules"] });
      await queryClient.invalidateQueries({ queryKey: ["rule-categories"] });
      toast.success(t("rules.toggleSuccess"));
    },
    onError: (error) => toast.error(`${t("rules.toggleFailed")}: ${mutationMessage(error)}`),
  });

  const deleteMutation = useMutation({
    mutationFn: apiClient.deleteRule,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rules"] });
      await queryClient.invalidateQueries({ queryKey: ["rule-categories"] });
      setDeleteTarget(null);
      toast.success(t("rules.deleteSuccess"));
    },
    onError: (error) => toast.error(`${t("rules.deleteFailed")}: ${mutationMessage(error)}`),
  });

  const categoriesById = useMemo(() => {
    return new Map((categoriesQuery.data ?? []).map((category) => [category.id, category]));
  }, [categoriesQuery.data]);

  const rules = rulesQuery.data?.items ?? [];
  const pageCount = Math.max(1, rulesQuery.data?.pages ?? 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t("rules.listTitle")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("rules.listHelp")}</p>
        </div>
        {isSuperAdmin && (
          <Button asChild>
            <Link to="/rules/new">
              <Plus data-icon="inline-start" />
              {t("rules.createRule")}
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 lg:flex-row lg:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input
            value={search}
            onChange={(event) => updateParams({ search: event.target.value, page: 1 })}
            placeholder={t("rules.searchPlaceholder")}
          />
        </label>
        <Select
          value={categoryId ? String(categoryId) : "all"}
          onValueChange={(value) => updateParams({ category_id: value === "all" ? null : value, page: 1 })}
        >
          <SelectTrigger className="lg:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">{t("rules.allCategories")}</SelectItem>
              {(categoriesQuery.data ?? []).map((category) => (
                <SelectItem key={category.id} value={String(category.id)}>
                  {categoryName(category, i18n.language)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => updateParams({ page_size: value, page: 1 })}
        >
          <SelectTrigger className="lg:w-36" aria-label={t("rules.pageSize")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {[5, 10, 20, 50].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {t("rules.pageSizeValue", { count: size })}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={() => void rulesQuery.refetch()}>
          <RefreshCcw data-icon="inline-start" />
          {t("app.reload")}
        </Button>
      </div>

      <ApiState
        isLoading={rulesQuery.isLoading || categoriesQuery.isLoading}
        isError={rulesQuery.isError || categoriesQuery.isError}
        isEmpty={false}
        onRetry={() => {
          void rulesQuery.refetch();
          void categoriesQuery.refetch();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t("rules.tableTitle")}</CardTitle>
            <CardDescription>{t("rules.recordCount", { count: rulesQuery.data?.total ?? 0 })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("rules.name")}</TableHead>
                    <TableHead>{t("rules.category")}</TableHead>
                    <TableHead>{t("rules.patternValuePreview")}</TableHead>
                    <TableHead>{t("rules.priority")}</TableHead>
                    <TableHead>{t("rules.enabledState")}</TableHead>
                    {isSuperAdmin && <TableHead>{t("action.operations")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isSuperAdmin ? 6 : 5} className="py-10 text-center text-gray-500">
                        {t("rules.emptyRules")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rules.map((rule) => {
                      const category = categoriesById.get(rule.category_id) ?? rule.category;
                      return (
                        <TableRow key={rule.id}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="font-medium text-gray-900">{rule.name}</span>
                              {rule.description && <span className="max-w-xs truncate text-xs text-gray-500">{rule.description}</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <CategoryIcon slug={rule.category_slug} />
                              <span>{categoryName(category, i18n.language)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex max-w-sm flex-col gap-1 font-mono text-xs">
                              <span className="truncate">{rule.pattern || "-"}</span>
                              <span className="truncate text-gray-500">{rule.value || "-"}</span>
                            </div>
                          </TableCell>
                          <TableCell>{rule.priority}</TableCell>
                          <TableCell>
                            {isSuperAdmin ? (
                              <div className="flex items-center gap-2">
                                <Switch
                                  aria-label={t("rules.toggleRule", { name: rule.name })}
                                  checked={rule.enabled}
                                  disabled={toggleMutation.isPending}
                                  onCheckedChange={() => toggleMutation.mutate(rule)}
                                />
                                <span className="text-sm text-gray-600">
                                  {rule.enabled ? t("status.enabled") : t("status.disabled")}
                                </span>
                              </div>
                            ) : (
                              <RuleStatus enabled={rule.enabled} />
                            )}
                          </TableCell>
                          {isSuperAdmin && (
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                <Button asChild variant="outline" size="sm">
                                  <Link to={`/rules/${rule.id}/edit`}>{t("action.edit")}</Link>
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => setDeleteTarget(rule)}>
                                  <Trash2 data-icon="inline-start" />
                                  {t("action.delete")}
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">
                {t("rules.pageSummary", { page, pages: pageCount })}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => updateParams({ page: Math.max(1, page - 1) })}
                >
                  <ChevronLeft data-icon="inline-start" />
                  {t("rules.previousPage")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() => updateParams({ page: Math.min(pageCount, page + 1) })}
                >
                  {t("rules.nextPage")}
                  <ChevronRight data-icon="inline-end" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </ApiState>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rules.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("rules.deleteDescription", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {t("action.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function RuleFormPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const auth = useAuth();
  const ruleId = Number(id || "");
  const isEdit = Number.isFinite(ruleId) && ruleId > 0;
  const [form, setForm] = useState<RuleFormState>(emptyForm);
  const [errors, setErrors] = useState<RuleFormErrors>({});
  const [loadedRuleId, setLoadedRuleId] = useState<number | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["rule-categories"],
    queryFn: apiClient.ruleCategories,
    retry: false,
  });
  const ruleQuery = useQuery({
    queryKey: ["rule", ruleId],
    queryFn: () => apiClient.rule(ruleId),
    enabled: isEdit,
    retry: false,
  });

  useEffect(() => {
    if (isEdit && ruleQuery.data && loadedRuleId !== ruleQuery.data.id) {
      setForm(ruleToForm(ruleQuery.data));
      setLoadedRuleId(ruleQuery.data.id);
      setErrors({});
    }
  }, [isEdit, loadedRuleId, ruleQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: RulePayload) => (isEdit ? apiClient.updateRule(ruleId, payload) : apiClient.createRule(payload)),
    onSuccess: async (savedRule) => {
      await queryClient.invalidateQueries({ queryKey: ["rules"] });
      await queryClient.invalidateQueries({ queryKey: ["rule-categories"] });
      await queryClient.invalidateQueries({ queryKey: ["rule", savedRule.id] });
      toast.success(isEdit ? t("rules.updateSuccess") : t("rules.createSuccess"));
      navigate(`/rules?search=${encodeURIComponent(savedRule.name)}`);
    },
    onError: (error) => toast.error(`${t("rules.saveFailed")}: ${mutationMessage(error)}`),
  });

  const updateForm = (patch: Partial<RuleFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      Object.keys(patch).forEach((key) => delete next[key as keyof RuleFormState]);
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateForm(form, t);
    setErrors(result.errors);
    if (!result.payload) {
      return;
    }
    saveMutation.mutate(result.payload);
  };

  if (!auth.user?.is_super_admin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {isEdit ? t("rules.editTitle") : t("rules.newTitle")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t("rules.formHelp")}</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/rules">{t("rules.backToList")}</Link>
        </Button>
      </div>

      <ApiState
        isLoading={categoriesQuery.isLoading || (isEdit && ruleQuery.isLoading)}
        isError={categoriesQuery.isError || (isEdit && ruleQuery.isError)}
        isEmpty={false}
        onRetry={() => {
          void categoriesQuery.refetch();
          if (isEdit) {
            void ruleQuery.refetch();
          }
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>{isEdit ? t("rules.editTitle") : t("rules.newTitle")}</CardTitle>
            <CardDescription>{t("rules.requiredHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-5 lg:grid-cols-2" onSubmit={handleSubmit} noValidate>
              <label className="flex flex-col gap-2 text-sm">
                <span>{t("rules.category")}</span>
                <Select value={form.categoryId} onValueChange={(categoryId) => updateForm({ categoryId })}>
                  <SelectTrigger aria-invalid={Boolean(errors.categoryId)}>
                    <SelectValue placeholder={t("rules.selectCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none" disabled>
                        {t("rules.selectCategory")}
                      </SelectItem>
                      {(categoriesQuery.data ?? []).map((category) => (
                        <SelectItem key={category.id} value={String(category.id)}>
                          {categoryName(category, i18n.language)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldError message={errors.categoryId} />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                <span>{t("rules.name")}</span>
                <Input
                  value={form.name}
                  aria-invalid={Boolean(errors.name)}
                  onChange={(event) => updateForm({ name: event.target.value })}
                />
                <FieldError message={errors.name} />
              </label>

              <label className="flex flex-col gap-2 text-sm lg:col-span-2">
                <span>{t("rules.description")}</span>
                <Textarea
                  value={form.description}
                  aria-invalid={Boolean(errors.description)}
                  onChange={(event) => updateForm({ description: event.target.value })}
                />
                <FieldError message={errors.description} />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                <span>{t("rules.pattern")}</span>
                <Input
                  value={form.pattern}
                  aria-invalid={Boolean(errors.pattern)}
                  onChange={(event) => updateForm({ pattern: event.target.value })}
                />
                <FieldError message={errors.pattern} />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                <span>{t("rules.value")}</span>
                <Input
                  value={form.value}
                  aria-invalid={Boolean(errors.value)}
                  onChange={(event) => updateForm({ value: event.target.value })}
                />
                <FieldError message={errors.value} />
              </label>

              <label className="flex flex-col gap-2 text-sm lg:col-span-2">
                <span>{t("rules.options")}</span>
                <Textarea
                  value={form.options}
                  className="min-h-32 font-mono"
                  aria-invalid={Boolean(errors.options)}
                  placeholder='{"examples":["kg","公斤"]}'
                  onChange={(event) => updateForm({ options: event.target.value })}
                />
                <FieldError message={errors.options} />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                <span>{t("rules.priority")}</span>
                <Input
                  type="number"
                  value={form.priority}
                  aria-invalid={Boolean(errors.priority)}
                  onChange={(event) => updateForm({ priority: Number(event.target.value) })}
                />
                <FieldError message={errors.priority} />
              </label>

              <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
                <Label htmlFor="rule-enabled">{t("rules.enabled")}</Label>
                <Switch
                  id="rule-enabled"
                  checked={form.enabled}
                  onCheckedChange={(enabled) => updateForm({ enabled })}
                />
              </div>

              <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-5 lg:col-span-2">
                <Button type="button" variant="outline" onClick={() => navigate("/rules")}>
                  {t("action.cancel")}
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <CheckCircle2 data-icon="inline-start" />
                  ) : (
                    <Save data-icon="inline-start" />
                  )}
                  {saveMutation.isPending ? t("action.saving") : t("action.save")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </ApiState>
    </div>
  );
}
