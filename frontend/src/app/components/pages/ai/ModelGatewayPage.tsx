import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Cpu, Eye, EyeOff, Pencil, Plus, RefreshCcw, Save, Search, Server, TestTube2, Trash2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  apiClient,
  type AiModel,
  type AiModelPayload,
  type GatewayCapabilityMapping,
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
import { Slider } from "@/app/components/ui/slider";
import { Switch } from "@/app/components/ui/switch";

const PROVIDER_PRESETS = {
  dashscope: {
    labelKey: "modelGateway.providerDashScope",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
  },
  azure: {
    labelKey: "modelGateway.providerAzure",
    baseUrl: "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT",
    models: ["gpt-4o", "gpt-4o-mini"],
  },
  deepseek: {
    labelKey: "modelGateway.providerDeepSeek",
    baseUrl: "https://api.deepseek.com",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  moonshot: {
    labelKey: "modelGateway.providerMoonshot",
    baseUrl: "https://api.moonshot.cn/v1",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  },
  openai: {
    labelKey: "modelGateway.providerOpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o"],
  },
  vllm: {
    labelKey: "modelGateway.providerVllm",
    baseUrl: "http://localhost:8001/v1",
    models: ["local-model"],
  },
  ollama: {
    labelKey: "modelGateway.providerOllama",
    baseUrl: "http://localhost:11434/v1",
    models: ["llama3.1", "qwen2.5"],
  },
  custom: {
    labelKey: "modelGateway.providerCustom",
    baseUrl: "",
    models: ["custom"],
  },
} as const;

type ProviderPreset = keyof typeof PROVIDER_PRESETS;

type ModelFormState = {
  id: number | null;
  display_name: string;
  provider: ProviderPreset;
  model_name: string;
  custom_model_name: string;
  base_url: string;
  api_key: string;
  original_api_key_masked: string;
  timeout: number;
  temperature: number;
  max_tokens: number;
  enabled: boolean;
};

const API_KEY_PLACEHOLDER = "********";

const emptyModelForm: ModelFormState = {
  id: null,
  display_name: "",
  provider: "deepseek",
  model_name: "deepseek-chat",
  custom_model_name: "",
  base_url: PROVIDER_PRESETS.deepseek.baseUrl,
  api_key: "",
  original_api_key_masked: "",
  timeout: 30,
  temperature: 0.7,
  max_tokens: 2048,
  enabled: true,
};

function mutationMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operation failed";
}

function providerFromModel(provider: string): ProviderPreset {
  return Object.keys(PROVIDER_PRESETS).includes(provider) ? (provider as ProviderPreset) : "custom";
}

function modelToForm(model: AiModel): ModelFormState {
  const provider = providerFromModel(model.provider);
  const preset = PROVIDER_PRESETS[provider];
  const isPresetModel = (preset.models as readonly string[]).includes(model.model_name);

  return {
    id: model.id,
    display_name: model.display_name,
    provider,
    model_name: isPresetModel ? model.model_name : "custom",
    custom_model_name: isPresetModel ? "" : model.model_name,
    base_url: model.base_url,
    api_key: API_KEY_PLACEHOLDER,
    original_api_key_masked: API_KEY_PLACEHOLDER,
    timeout: model.timeout,
    temperature: model.temperature ?? 0.7,
    max_tokens: model.max_tokens ?? 2048,
    enabled: model.enabled,
  };
}

function selectedModelName(form: ModelFormState) {
  return form.model_name === "custom" ? form.custom_model_name.trim() : form.model_name.trim();
}

function formToPayload(form: ModelFormState): AiModelPayload {
  const payload: AiModelPayload = {
    display_name: form.display_name.trim(),
    provider: form.provider,
    model_name: selectedModelName(form),
    base_url: form.base_url.trim(),
    timeout: Number(form.timeout) || 30,
    temperature: Number(form.temperature),
    max_tokens: Number(form.max_tokens) || 2048,
    enabled: form.enabled,
  };

  if (form.id === null || form.api_key !== form.original_api_key_masked) {
    payload.api_key = form.api_key.trim();
  }

  return payload;
}

function validateModelForm(form: ModelFormState, t: (key: string) => string) {
  if (!form.display_name.trim() || !form.provider || !selectedModelName(form) || !form.base_url.trim()) {
    return t("modelGateway.validationRequired");
  }
  if (form.id === null && !form.api_key.trim()) {
    return t("modelGateway.validationApiKey");
  }
  if (!/^https?:\/\/|^local:\/\//.test(form.base_url.trim())) {
    return t("modelGateway.validationBaseUrl");
  }
  if (form.temperature < 0 || form.temperature > 2) {
    return t("modelGateway.validationTemperature");
  }
  if (form.max_tokens < 1 || form.max_tokens > 32000) {
    return t("modelGateway.validationMaxTokens");
  }
  if (form.timeout < 1 || form.timeout > 120) {
    return t("modelGateway.validationTimeout");
  }
  return "";
}

function formatDateTime(value: string | null, locale: string, fallback: string) {
  if (!value) {
    return fallback;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function connectionStatusLabel(status: string, t: (key: string) => string) {
  if (status === "ok") {
    return t("modelGateway.statusOk");
  }
  if (status === "error") {
    return t("modelGateway.statusError");
  }
  return t("modelGateway.statusUntested");
}

function ConnectionBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const normalized = status === "ok" || status === "error" ? status : "untested";
  const className =
    normalized === "ok"
      ? "border-success/30 bg-success/10 text-success"
      : normalized === "error"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border bg-muted text-muted-foreground";
  const Icon = normalized === "ok" ? CheckCircle2 : normalized === "error" ? XCircle : Server;

  return (
    <Badge variant="outline" className={className}>
      <Icon className="mr-1 h-3.5 w-3.5" />
      {connectionStatusLabel(normalized, t)}
    </Badge>
  );
}

function ModelDialog({
  open,
  form,
  feedback,
  isSaving,
  readOnly,
  onOpenChange,
  onFormChange,
  onSave,
}: {
  open: boolean;
  form: ModelFormState;
  feedback: string;
  isSaving: boolean;
  readOnly: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: ModelFormState) => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const [showApiKey, setShowApiKey] = useState(false);
  const preset = PROVIDER_PRESETS[form.provider];
  const modelOptions = [...preset.models, "custom"];

  const selectProvider = (provider: ProviderPreset) => {
    const nextPreset = PROVIDER_PRESETS[provider];
    onFormChange({
      ...form,
      provider,
      base_url: nextPreset.baseUrl || form.base_url,
      model_name: nextPreset.models[0],
      custom_model_name: "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" aria-busy={isSaving}>
        <DialogHeader>
          <DialogTitle>{form.id === null ? t("modelGateway.createTitle") : t("modelGateway.editTitle")}</DialogTitle>
          <DialogDescription>{readOnly ? t("modelGateway.readOnlyHelp") : t("modelGateway.dialogHelp")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">
            <span>{t("modelGateway.displayName")}</span>
            <Input
              value={form.display_name}
              disabled={readOnly}
              placeholder={t("modelGateway.displayNamePlaceholder")}
              onChange={(event) => onFormChange({ ...form, display_name: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span>{t("modelGateway.providerPreset")}</span>
            <Select value={form.provider} disabled={readOnly} onValueChange={(provider) => selectProvider(provider as ProviderPreset)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(Object.keys(PROVIDER_PRESETS) as ProviderPreset[]).map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {t(PROVIDER_PRESETS[provider].labelKey)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span>{t("modelGateway.modelName")}</span>
            <Select
              value={form.model_name}
              disabled={readOnly}
              onValueChange={(model_name) => onFormChange({ ...form, model_name })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {modelOptions.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model === "custom" ? t("modelGateway.customModel") : model}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span>{t("modelGateway.manualModel")}</span>
            <Input
              value={form.custom_model_name}
              disabled={readOnly || form.model_name !== "custom"}
              placeholder={t("modelGateway.manualModelPlaceholder")}
              onChange={(event) => onFormChange({ ...form, custom_model_name: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm sm:col-span-2">
            <span>{t("modelGateway.baseUrl")}</span>
            <Input
              value={form.base_url}
              disabled={readOnly}
              placeholder={t("modelGateway.baseUrlPlaceholder")}
              onChange={(event) => onFormChange({ ...form, base_url: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm sm:col-span-2">
            <span>{t("modelGateway.apiKey")}</span>
            <div className="flex gap-2">
              <Input
                type={showApiKey ? "text" : "password"}
                value={form.api_key}
                disabled={readOnly}
                placeholder={form.id === null ? t("modelGateway.apiKeyPlaceholder") : API_KEY_PLACEHOLDER}
                onChange={(event) => onFormChange({ ...form, api_key: event.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={showApiKey ? t("modelGateway.hideApiKey") : t("modelGateway.showApiKey")}
                onClick={() => setShowApiKey((visible) => !visible)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span>{t("modelGateway.timeout")}</span>
            <Input
              type="number"
              min={1}
              max={120}
              value={form.timeout}
              disabled={readOnly}
              onChange={(event) => onFormChange({ ...form, timeout: Number(event.target.value) })}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span>{t("modelGateway.maxTokens")}</span>
            <Input
              type="number"
              min={1}
              max={32000}
              value={form.max_tokens}
              disabled={readOnly}
              onChange={(event) => onFormChange({ ...form, max_tokens: Number(event.target.value) })}
            />
          </label>

          <div className="flex flex-col gap-3 rounded-md border border-border p-3 sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">{t("modelGateway.temperature")}</span>
              <span className="font-mono text-sm">{form.temperature.toFixed(1)}</span>
            </div>
            <Slider
              min={0}
              max={2}
              step={0.1}
              value={[form.temperature]}
              disabled={readOnly}
              onValueChange={([temperature]) => onFormChange({ ...form, temperature: temperature ?? form.temperature })}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 sm:col-span-2">
            <Label htmlFor="model-gateway-enabled">{t("modelGateway.enabled")}</Label>
            <Switch
              id="model-gateway-enabled"
              checked={form.enabled}
              disabled={readOnly}
              onCheckedChange={(enabled) => onFormChange({ ...form, enabled })}
            />
          </div>
        </div>

        {feedback && <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">{feedback}</div>}

        {!readOnly && (
          <DialogFooter>
            <Button type="button" onClick={onSave} disabled={isSaving}>
              <Save data-icon="inline-start" />
              {t("modelGateway.save")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModelCard({
  model,
  usageCount,
  isSuperAdmin,
  isTesting,
  isToggling,
  onEdit,
  onTest,
  onToggle,
  onDelete,
}: {
  model: AiModel;
  usageCount: number;
  isSuperAdmin: boolean;
  isTesting: boolean;
  isToggling: boolean;
  onEdit: (model: AiModel) => void;
  onTest: (model: AiModel) => void;
  onToggle: (model: AiModel) => void;
  onDelete: (model: AiModel) => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-lg">{model.model_name}</CardTitle>
            <CardDescription className="mt-1 truncate">{model.display_name}</CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0 gap-1">
            <Cpu className="h-3.5 w-3.5" />
            {t(`modelGateway.provider.${model.provider}`, { defaultValue: model.provider })}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={model.enabled ? "default" : "secondary"}>
            {model.enabled ? t("status.enabled") : t("status.disabled")}
          </Badge>
          <ConnectionBadge status={model.connection_status} />
          {usageCount > 0 && (
            <Badge variant="outline" className="border-info/30 bg-info/10 text-info">
              {t("modelGateway.usedByCapabilities", { count: usageCount })}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm">
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("modelGateway.baseUrl")}</dt>
            <dd className="truncate font-mono text-xs">{model.base_url}</dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-muted-foreground">{t("modelGateway.timeoutShort")}</dt>
              <dd>{t("modelGateway.seconds", { count: model.timeout })}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("modelGateway.lastTested")}</dt>
              <dd>{formatDateTime(model.last_tested_at, i18n.language, t("modelGateway.neverTested"))}</dd>
            </div>
          </div>
        </dl>

        {isSuperAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onEdit(model)}>
              <Pencil data-icon="inline-start" />
              {t("action.edit")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onTest(model)} disabled={isTesting}>
              <TestTube2 data-icon="inline-start" />
              {isTesting ? t("modelGateway.testing") : t("modelGateway.testConnection")}
            </Button>
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
              <Switch
                aria-label={t("modelGateway.toggleEnabled", { name: model.display_name })}
                checked={model.enabled}
                disabled={isToggling}
                onCheckedChange={() => onToggle(model)}
              />
              <span className="text-sm">{model.enabled ? t("status.enabled") : t("status.disabled")}</span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onDelete(model)}>
              <Trash2 data-icon="inline-start" />
              {t("action.delete")}
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {t("modelGateway.readOnlyHelp")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AiModelGatewayPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = Boolean(auth.user?.is_super_admin);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ModelFormState>(emptyModelForm);
  const [feedback, setFeedback] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AiModel | null>(null);

  const modelsQuery = useQuery({
    queryKey: ["ai-models"],
    queryFn: apiClient.aiModels,
    retry: false,
  });
  const mappingsQuery = useQuery({
    queryKey: ["gateway-capability-mappings"],
    queryFn: apiClient.gatewayCapabilityMappings,
    retry: false,
  });

  const usageCounts = useMemo(() => {
    const counts = new Map<number, number>();
    (mappingsQuery.data ?? []).forEach((mapping: GatewayCapabilityMapping) => {
      const referencedIds = new Set([mapping.primary_model_id, mapping.fallback_model_id].filter((id): id is number => id !== null));
      referencedIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    });
    return counts;
  }, [mappingsQuery.data]);

  const filteredModels = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return modelsQuery.data ?? [];
    }
    return (modelsQuery.data ?? []).filter((model) =>
      [model.display_name, model.provider, model.model_name, model.base_url, model.connection_status]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [modelsQuery.data, search]);

  const saveMutation = useMutation({
    mutationFn: (payload: AiModelPayload) =>
      form.id === null ? apiClient.createAiModel(payload) : apiClient.updateAiModel(form.id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-models"] });
      await queryClient.invalidateQueries({ queryKey: ["ai-capability-mappings"] });
      await queryClient.invalidateQueries({ queryKey: ["gateway-capability-mappings"] });
      const message = t("modelGateway.saved");
      setFeedback(message);
      toast.success(message);
      setDialogOpen(false);
    },
    onError: (error) => {
      const message = mutationMessage(error);
      setFeedback(message);
      toast.error(message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: apiClient.toggleAiModel,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-models"] });
      const message = t("modelGateway.toggled");
      setFeedback(message);
      toast.success(message);
    },
    onError: (error) => {
      const message = mutationMessage(error);
      setFeedback(message);
      toast.error(message);
    },
  });

  const testMutation = useMutation({
    mutationFn: apiClient.testAiModel,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["ai-models"] });
      const message = result.ok
        ? t("modelGateway.testSuccess", { latency: result.latency_ms })
        : t("modelGateway.testError", { message: result.message });
      setFeedback(message);
      (result.ok ? toast.success : toast.error)(message);
    },
    onError: (error) => {
      const message = mutationMessage(error);
      setFeedback(message);
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: apiClient.deleteAiModel,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-models"] });
      const message = t("modelGateway.deleted");
      setFeedback(message);
      toast.success(message);
      setDeleteTarget(null);
    },
    onError: (error) => {
      const message = mutationMessage(error);
      setFeedback(message);
      toast.error(`${t("modelGateway.deleteBlocked")}: ${message}`);
      setDeleteTarget(null);
    },
  });

  const openCreate = () => {
    setForm(emptyModelForm);
    setFeedback("");
    setDialogOpen(true);
  };

  const openEdit = (model: AiModel) => {
    setForm(modelToForm(model));
    setFeedback("");
    setDialogOpen(true);
  };

  const handleSave = () => {
    const validation = validateModelForm(form, t);
    if (validation) {
      setFeedback(validation);
      toast.error(validation);
      return;
    }
    saveMutation.mutate(formToPayload(form));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("modelGateway.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSuperAdmin ? t("modelGateway.help") : t("modelGateway.readOnlyHelp")}
          </p>
        </div>
        {isSuperAdmin && (
          <Button type="button" onClick={openCreate}>
            <Plus data-icon="inline-start" />
            {t("modelGateway.createTitle")}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("modelGateway.search")} />
        </label>
        <Button type="button" variant="outline" onClick={() => void modelsQuery.refetch()}>
          <RefreshCcw data-icon="inline-start" />
          {t("app.reload")}
        </Button>
      </div>

      {feedback && <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">{feedback}</div>}

      <ApiState
        isLoading={modelsQuery.isLoading}
        isError={modelsQuery.isError}
        isEmpty={false}
        errorLabel={t("app.error")}
        onRetry={() => void modelsQuery.refetch()}
      >
        {filteredModels.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <h2 className="text-lg font-semibold text-foreground">{t("modelGateway.emptyTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("modelGateway.emptyDescription")}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                usageCount={usageCounts.get(model.id) ?? 0}
                isSuperAdmin={isSuperAdmin}
                isTesting={testMutation.isPending}
                isToggling={toggleMutation.isPending}
                onEdit={openEdit}
                onTest={(nextModel) => testMutation.mutate(nextModel.id)}
                onToggle={(nextModel) => toggleMutation.mutate(nextModel.id)}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </ApiState>

      <ModelDialog
        open={dialogOpen}
        form={form}
        feedback={feedback}
        isSaving={saveMutation.isPending}
        readOnly={!isSuperAdmin}
        onOpenChange={setDialogOpen}
        onFormChange={setForm}
        onSave={handleSave}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("modelGateway.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? t("modelGateway.deleteDescription", { name: deleteTarget.display_name, model: deleteTarget.model_name }) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
