import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCcw, Save, Search, TestTube2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  apiClient,
  type AiCapability,
  type AiCapabilityMapping,
  type AiProviderConfig,
  type AiProviderPayload,
  type TraceDetail,
  type TraceSpan,
  type TraceSummary,
} from "@/app/api/client";
import { ApiState } from "@/app/components/common/ApiState";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";

const AI_CAPABILITIES: AiCapability[] = [
  "material_add",
  "material_match",
  "category_match",
  "material_analysis",
  "attr_recommend",
  "material_governance",
];

const PROVIDER_OPTIONS = ["mock", "dashscope", "azure_openai", "vllm", "ollama"];

type ProviderFormState = {
  id: number | null;
  display_name: string;
  provider: string;
  model_name: string;
  base_url: string;
  api_key: string;
  timeout_seconds: number;
  enabled: boolean;
  capabilities: AiCapability[];
  original_api_key_masked: string;
};

type MappingDraft = {
  primary_model_id: number | null;
  fallback_model_id: number | null;
  enabled: boolean;
};

const emptyProviderForm: ProviderFormState = {
  id: null,
  display_name: "",
  provider: "mock",
  model_name: "mock-material-governance-v1",
  base_url: "local://mock",
  api_key: "",
  timeout_seconds: 10,
  enabled: true,
  capabilities: [...AI_CAPABILITIES],
  original_api_key_masked: "",
};

function mutationMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operation failed";
}

function connectionStatusLabel(status: string, t: (key: string) => string) {
  if (status === "ok") {
    return t("ai.ok");
  }
  if (status === "error") {
    return t("ai.error");
  }
  return t("ai.untested");
}

function ConnectionBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const normalized = status === "ok" || status === "error" ? status : "untested";
  const className =
    normalized === "ok"
      ? "border-green-200 bg-green-50 text-green-700"
      : normalized === "error"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <Badge variant="outline" className={className}>
      {connectionStatusLabel(normalized, t)}
    </Badge>
  );
}

function providerToForm(provider: AiProviderConfig): ProviderFormState {
  return {
    id: provider.id,
    display_name: provider.display_name,
    provider: provider.provider,
    model_name: provider.model_name,
    base_url: provider.base_url || provider.endpoint,
    api_key: provider.api_key_masked,
    timeout_seconds: provider.timeout_seconds,
    enabled: provider.enabled,
    capabilities: provider.capabilities.length > 0 ? provider.capabilities : [...AI_CAPABILITIES],
    original_api_key_masked: provider.api_key_masked,
  };
}

function formToPayload(form: ProviderFormState): AiProviderPayload {
  const apiKey =
    form.id !== null && form.api_key === form.original_api_key_masked
      ? "**unchanged**"
      : form.api_key.trim();

  return {
    display_name: form.display_name.trim(),
    provider: form.provider,
    model_name: form.model_name.trim(),
    base_url: form.base_url.trim(),
    api_key: apiKey,
    timeout_seconds: Number(form.timeout_seconds) || 10,
    enabled: form.enabled,
    capabilities: form.capabilities,
  };
}

function canSaveProvider(form: ProviderFormState) {
  return Boolean(form.display_name.trim() && form.provider.trim() && form.model_name.trim());
}

function CapabilityChecklist({
  selected,
  onChange,
}: {
  selected: AiCapability[];
  onChange: (capabilities: AiCapability[]) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {AI_CAPABILITIES.map((capability) => (
        <label key={capability} className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
          <Checkbox
            checked={selected.includes(capability)}
            onCheckedChange={(checked) => {
              onChange(
                checked
                  ? Array.from(new Set([...selected, capability]))
                  : selected.filter((item) => item !== capability),
              );
            }}
          />
          <span className="font-mono text-xs">{capability}</span>
        </label>
      ))}
    </div>
  );
}

function ProviderDialog({
  open,
  form,
  feedback,
  isSaving,
  isTesting,
  onOpenChange,
  onFormChange,
  onSave,
  onTest,
}: {
  open: boolean;
  form: ProviderFormState;
  feedback: string;
  isSaving: boolean;
  isTesting: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: ProviderFormState) => void;
  onSave: () => void;
  onTest: () => void;
}) {
  const { t } = useTranslation();
  const title = form.id === null ? t("ai.createProvider") : t("ai.editProvider");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("ai.providersHelp")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">
            <span>{t("ai.displayName")}</span>
            <Input
              value={form.display_name}
              onChange={(event) => onFormChange({ ...form, display_name: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span>{t("ai.provider")}</span>
            <Select value={form.provider} onValueChange={(provider) => onFormChange({ ...form, provider })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PROVIDER_OPTIONS.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span>{t("ai.modelName")}</span>
            <Input
              value={form.model_name}
              onChange={(event) => onFormChange({ ...form, model_name: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span>{t("ai.timeout")}</span>
            <Input
              type="number"
              min={1}
              max={120}
              value={form.timeout_seconds}
              onChange={(event) => onFormChange({ ...form, timeout_seconds: Number(event.target.value) })}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm sm:col-span-2">
            <span>{t("ai.baseUrl")}</span>
            <Input
              value={form.base_url}
              onChange={(event) => onFormChange({ ...form, base_url: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm sm:col-span-2">
            <span>{t("ai.apiKey")}</span>
            <Input
              type="password"
              value={form.api_key}
              onChange={(event) => onFormChange({ ...form, api_key: event.target.value })}
            />
          </label>

          <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 sm:col-span-2">
            <Label htmlFor="ai-provider-enabled">{t("ai.enabled")}</Label>
            <Switch
              id="ai-provider-enabled"
              checked={form.enabled}
              onCheckedChange={(enabled) => onFormChange({ ...form, enabled })}
            />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-sm">{t("ai.capabilities")}</span>
            <CapabilityChecklist
              selected={form.capabilities}
              onChange={(capabilities) => onFormChange({ ...form, capabilities })}
            />
          </div>
        </div>

        {feedback && <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{feedback}</div>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onTest} disabled={isTesting || !canSaveProvider(form)}>
            <TestTube2 data-icon="inline-start" />
            {t("ai.testConnection")}
          </Button>
          <Button type="button" onClick={onSave} disabled={isSaving || !canSaveProvider(form)}>
            <Save data-icon="inline-start" />
            {t("ai.saveProvider")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AiProvidersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ProviderFormState>(emptyProviderForm);
  const [feedback, setFeedback] = useState("");

  const providersQuery = useQuery({
    queryKey: ["ai-providers"],
    queryFn: apiClient.aiProviders,
    retry: false,
  });

  const filteredProviders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return providersQuery.data ?? [];
    }
    return (providersQuery.data ?? []).filter((provider) =>
      [provider.display_name, provider.provider, provider.model_name, provider.base_url, provider.connection_status]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [providersQuery.data, search]);

  const saveMutation = useMutation({
    mutationFn: (payload: AiProviderPayload) =>
      form.id === null ? apiClient.createAiProvider(payload) : apiClient.updateAiProvider(form.id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
      await queryClient.invalidateQueries({ queryKey: ["ai-capability-mappings"] });
      setFeedback(t("ai.saved"));
      setDialogOpen(false);
    },
    onError: (error) => setFeedback(mutationMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: apiClient.deleteAiProvider,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
      setFeedback(t("ai.deleted"));
    },
    onError: (error) => setFeedback(mutationMessage(error)),
  });

  const testSavedMutation = useMutation({
    mutationFn: apiClient.testAiProvider,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
      setFeedback(`${t("ai.providerTested")}: ${result.message}`);
    },
    onError: (error) => setFeedback(mutationMessage(error)),
  });

  const testDraftMutation = useMutation({
    mutationFn: apiClient.testAiProviderDraft,
    onSuccess: (result) => setFeedback(`${t("ai.providerTested")}: ${result.message}`),
    onError: (error) => setFeedback(mutationMessage(error)),
  });

  const openCreate = () => {
    setForm({ ...emptyProviderForm, capabilities: [...AI_CAPABILITIES] });
    setFeedback("");
    setDialogOpen(true);
  };

  const openEdit = (provider: AiProviderConfig) => {
    setForm(providerToForm(provider));
    setFeedback("");
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!canSaveProvider(form)) {
      setFeedback(t("ai.required"));
      return;
    }
    saveMutation.mutate(formToPayload(form));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t("ai.providersTitle")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("ai.providersHelp")}</p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus data-icon="inline-start" />
          {t("ai.createProvider")}
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-gray-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("ai.providerSearch")} />
        </label>
        <Button type="button" variant="outline" onClick={() => void providersQuery.refetch()}>
          <RefreshCcw data-icon="inline-start" />
          {t("app.reload")}
        </Button>
      </div>

      {feedback && <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{feedback}</div>}

      <ApiState
        isLoading={providersQuery.isLoading}
        isError={providersQuery.isError}
        isEmpty={false}
        errorLabel={t("app.error")}
        onRetry={() => void providersQuery.refetch()}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t("ai.providerTable")}</CardTitle>
            <CardDescription>{filteredProviders.length} records</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ai.displayName")}</TableHead>
                  <TableHead>{t("ai.provider")}</TableHead>
                  <TableHead>{t("ai.modelName")}</TableHead>
                  <TableHead>{t("ai.connectionStatus")}</TableHead>
                  <TableHead>{t("ai.enabled")}</TableHead>
                  <TableHead>{t("action.operations")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProviders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-gray-500">
                      {t("app.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProviders.map((provider) => (
                    <TableRow key={provider.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{provider.display_name}</span>
                          <span className="max-w-sm truncate text-xs text-gray-500">{provider.base_url || provider.endpoint}</span>
                        </div>
                      </TableCell>
                      <TableCell>{provider.provider}</TableCell>
                      <TableCell>{provider.model_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <ConnectionBadge status={provider.connection_status} />
                          {provider.last_test_message && (
                            <span className="max-w-xs truncate text-xs text-gray-500">{provider.last_test_message}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={provider.enabled ? "default" : "secondary"}>
                          {provider.enabled ? t("status.enabled") : t("status.disabled")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(provider)}>
                            {t("action.edit")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => testSavedMutation.mutate(provider.id)}
                            disabled={testSavedMutation.isPending}
                          >
                            <TestTube2 data-icon="inline-start" />
                            {t("ai.testConnection")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => deleteMutation.mutate(provider.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 data-icon="inline-start" />
                            {t("action.delete")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </ApiState>

      <ProviderDialog
        open={dialogOpen}
        form={form}
        feedback={feedback}
        isSaving={saveMutation.isPending}
        isTesting={testDraftMutation.isPending}
        onOpenChange={setDialogOpen}
        onFormChange={setForm}
        onSave={handleSave}
        onTest={() => testDraftMutation.mutate(formToPayload(form))}
      />
    </div>
  );
}

function mappingDraftsFromData(mappings: AiCapabilityMapping[] | undefined, providers: AiProviderConfig[] | undefined) {
  const firstEnabledProvider = providers?.find((provider) => provider.enabled);
  return AI_CAPABILITIES.reduce<Record<AiCapability, MappingDraft>>((drafts, capability) => {
    const mapping = mappings?.find((item) => item.capability === capability);
    drafts[capability] = {
      primary_model_id: mapping?.primary_model_id ?? firstEnabledProvider?.id ?? null,
      fallback_model_id: mapping?.fallback_model_id ?? null,
      enabled: mapping?.enabled ?? true,
    };
    return drafts;
  }, {} as Record<AiCapability, MappingDraft>);
}

export function AiCapabilityMappingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<AiCapability, MappingDraft>>(() => mappingDraftsFromData(undefined, undefined));
  const [feedback, setFeedback] = useState("");

  const providersQuery = useQuery({
    queryKey: ["ai-providers"],
    queryFn: apiClient.aiProviders,
    retry: false,
  });
  const mappingsQuery = useQuery({
    queryKey: ["ai-capability-mappings"],
    queryFn: apiClient.aiCapabilityMappings,
    retry: false,
  });

  const enabledProviders = useMemo(() => (providersQuery.data ?? []).filter((provider) => provider.enabled), [providersQuery.data]);

  useEffect(() => {
    if (providersQuery.data || mappingsQuery.data) {
      setDrafts(mappingDraftsFromData(mappingsQuery.data, providersQuery.data));
    }
  }, [mappingsQuery.data, providersQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (capability: AiCapability) => {
      const draft = drafts[capability] ?? { primary_model_id: null, fallback_model_id: null, enabled: true };
      if (!draft.primary_model_id) {
        throw new Error(t("ai.required"));
      }
      return apiClient.updateAiCapabilityMapping(capability, {
        capability,
        primary_model_id: draft.primary_model_id,
        fallback_model_id: draft.fallback_model_id,
        enabled: draft.enabled,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-capability-mappings"] });
      setFeedback(t("ai.saved"));
    },
    onError: (error) => setFeedback(mutationMessage(error)),
  });

  const updateDraft = (capability: AiCapability, patch: Partial<MappingDraft>) => {
    setDrafts((current) => ({
      ...current,
      [capability]: {
        ...(current[capability] ?? { primary_model_id: null, fallback_model_id: null, enabled: true }),
        ...patch,
      },
    }));
    setFeedback("");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{t("ai.capabilityMappingsTitle")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("ai.capabilityMappingsHelp")}</p>
      </div>

      {feedback && <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{feedback}</div>}

      <ApiState
        isLoading={providersQuery.isLoading || mappingsQuery.isLoading}
        isError={providersQuery.isError || mappingsQuery.isError}
        isEmpty={false}
        onRetry={() => {
          void providersQuery.refetch();
          void mappingsQuery.refetch();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t("ai.capabilityMappingsTitle")}</CardTitle>
            <CardDescription>{AI_CAPABILITIES.length} capabilities</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ai.capabilities")}</TableHead>
                  <TableHead>{t("ai.primaryModel")}</TableHead>
                  <TableHead>{t("ai.fallbackModel")}</TableHead>
                  <TableHead>{t("ai.enabled")}</TableHead>
                  <TableHead>{t("action.operations")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {AI_CAPABILITIES.map((capability) => {
                  const draft = drafts[capability] ?? { primary_model_id: null, fallback_model_id: null, enabled: true };
                  return (
                    <TableRow key={capability}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {capability}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={draft.primary_model_id ? String(draft.primary_model_id) : "none"}
                          onValueChange={(value) => updateDraft(capability, { primary_model_id: Number(value) || null })}
                        >
                          <SelectTrigger className="min-w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="none" disabled>
                                {t("ai.required")}
                              </SelectItem>
                              {enabledProviders.map((provider) => (
                                <SelectItem key={provider.id} value={String(provider.id)}>
                                  {provider.display_name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={draft.fallback_model_id ? String(draft.fallback_model_id) : "none"}
                          onValueChange={(value) => updateDraft(capability, { fallback_model_id: value === "none" ? null : Number(value) })}
                        >
                          <SelectTrigger className="min-w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="none">{t("ai.noFallback")}</SelectItem>
                              {enabledProviders.map((provider) => (
                                <SelectItem key={provider.id} value={String(provider.id)}>
                                  {provider.display_name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={draft.enabled}
                          onCheckedChange={(enabled) => updateDraft(capability, { enabled })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => saveMutation.mutate(capability)}
                          disabled={saveMutation.isPending || !draft.primary_model_id}
                        >
                          <Save data-icon="inline-start" />
                          {t("ai.saveMapping")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </ApiState>
    </div>
  );
}

function walkTraceModels(span: TraceSpan, models: Map<string, number>) {
  const model = typeof span.model === "string" && span.model ? span.model : "";
  if (model) {
    models.set(model, (models.get(model) ?? 0) + 1);
  }
  if (Array.isArray(span.children)) {
    span.children.forEach((child) => walkTraceModels(child, models));
  }
}

function sortedEntries(source: Map<string, number>) {
  return Array.from(source.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

async function loadTraceUsage() {
  const traces = await apiClient.debugTrace();
  const details = await Promise.all(
    traces.slice(0, 30).map(async (trace) => {
      try {
        return await apiClient.debugTraceDetail(trace.trace_id);
      } catch {
        return null;
      }
    }),
  );
  return { traces, details: details.filter((detail): detail is TraceDetail => detail !== null) };
}

function UsageDistribution({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: [string, number][];
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{rows.reduce((total, row) => total + row[1], 0)} records</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{emptyLabel}</div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2">
                <span className="min-w-0 truncate font-mono text-xs">{name}</span>
                <Badge variant="secondary">{count}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AiTokenUsagePage() {
  const { t } = useTranslation();
  const usageQuery = useQuery({
    queryKey: ["ai-token-usage"],
    queryFn: loadTraceUsage,
    retry: false,
  });

  const usage = useMemo(() => {
    const traces: TraceSummary[] = usageQuery.data?.traces ?? [];
    const capabilityCounts = new Map<string, number>();
    const modelCounts = new Map<string, number>();

    traces.forEach((trace) => {
      const capability = trace.capability || t("ai.unknownCapability");
      capabilityCounts.set(capability, (capabilityCounts.get(capability) ?? 0) + 1);
    });

    usageQuery.data?.details.forEach((detail) => {
      detail.spans.forEach((span) => walkTraceModels(span, modelCounts));
    });

    return {
      callCount: traces.length,
      capabilityRows: sortedEntries(capabilityCounts),
      modelRows: sortedEntries(modelCounts),
    };
  }, [t, usageQuery.data]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t("ai.tokenUsageTitle")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("ai.tokenUsageHelp")}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void usageQuery.refetch()}>
          <RefreshCcw data-icon="inline-start" />
          {t("app.reload")}
        </Button>
      </div>

      <ApiState
        isLoading={usageQuery.isLoading}
        isError={usageQuery.isError}
        isEmpty={false}
        onRetry={() => void usageQuery.refetch()}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>{t("ai.recentCalls")}</CardTitle>
              <CardDescription>{t("ai.tokenUsageHelp")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold text-gray-900">{usage.callCount}</div>
            </CardContent>
          </Card>
          <UsageDistribution title={t("ai.capabilityDistribution")} rows={usage.capabilityRows} emptyLabel={t("ai.emptyTrace")} />
          <UsageDistribution title={t("ai.modelDistribution")} rows={usage.modelRows} emptyLabel={t("ai.emptyTrace")} />
        </div>
      </ApiState>
    </div>
  );
}
