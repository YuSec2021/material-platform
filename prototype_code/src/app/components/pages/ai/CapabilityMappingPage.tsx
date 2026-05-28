import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BrainCircuit, Info, Pencil, RefreshCcw, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  apiClient,
  type AiCapability,
  type AiModel,
  type GatewayCapabilityMapping,
  type GatewayCapabilityMappingPayload,
} from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { ApiState } from "@/app/components/common/ApiState";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";

const STANDARD_CAPABILITIES: AiCapability[] = [
  "material_add",
  "category_recognition",
  "material_match",
  "attr_recommend",
  "material_governance",
  "material_analysis",
];

const NONE_VALUE = "none";

type MappingRow = {
  id: number | null;
  capability: AiCapability | string;
  primary_model_id: number | null;
  fallback_model_id: number | null;
  enabled: boolean;
};

type MappingForm = {
  primary_model_id: number | null;
  fallback_model_id: number | null;
  enabled: boolean;
};

function mutationMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operation failed";
}

function rowsFromMappings(mappings: GatewayCapabilityMapping[] | undefined): MappingRow[] {
  const byCapability = new Map((mappings ?? []).map((mapping) => [mapping.capability, mapping]));
  const capabilities = [
    ...STANDARD_CAPABILITIES,
    ...(mappings ?? [])
      .map((mapping) => mapping.capability)
      .filter((capability) => !STANDARD_CAPABILITIES.includes(capability as AiCapability)),
  ];

  return capabilities.map((capability) => {
    const mapping = byCapability.get(capability);
    return {
      id: mapping?.id ?? null,
      capability,
      primary_model_id: mapping?.primary_model_id ?? null,
      fallback_model_id: mapping?.fallback_model_id ?? null,
      enabled: mapping?.enabled ?? true,
    };
  });
}

function modelLabel(model: AiModel) {
  return `${model.display_name} (${model.model_name})`;
}

function ProviderBadge({ provider }: { provider: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className="shrink-0 text-xs">
      {t(`modelGateway.provider.${provider}`, { defaultValue: provider })}
    </Badge>
  );
}

function ModelCell({ model, emptyLabel, emptyTone }: { model: AiModel | undefined; emptyLabel: string; emptyTone: "danger" | "muted" }) {
  if (!model) {
    const className =
      emptyTone === "danger"
        ? "text-sm font-medium text-red-600 dark:text-red-300"
        : "text-sm text-muted-foreground";
    return <span className={className}>{emptyLabel}</span>;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="truncate font-medium text-foreground">{model.display_name}</span>
      <span className="truncate text-xs text-muted-foreground">{model.model_name}</span>
      <ProviderBadge provider={model.provider} />
    </div>
  );
}

function HealthIndicator({ row }: { row: MappingRow }) {
  const { t } = useTranslation();
  if (!row.primary_model_id) {
    return (
      <div className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-300">
        <AlertTriangle className="h-4 w-4" />
        <span>{t("capabilityMapping.healthMissingPrimary")}</span>
      </div>
    );
  }
  if (!row.fallback_model_id) {
    return (
      <div className="mt-2 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-300">
        <Info className="h-4 w-4" />
        <span>{t("capabilityMapping.healthMissingFallback")}</span>
      </div>
    );
  }
  return null;
}

function MappingDialog({
  open,
  row,
  form,
  enabledModels,
  feedback,
  isSaving,
  onOpenChange,
  onFormChange,
  onSave,
}: {
  open: boolean;
  row: MappingRow | null;
  form: MappingForm;
  enabledModels: AiModel[];
  feedback: string;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: MappingForm) => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const primaryValue = form.primary_model_id ? String(form.primary_model_id) : NONE_VALUE;
  const fallbackValue = form.fallback_model_id ? String(form.fallback_model_id) : NONE_VALUE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("capabilityMapping.editTitle")}</DialogTitle>
          <DialogDescription>
            {row ? t("capabilityMapping.dialogHelp", { capability: t(`capabilityMapping.capabilities.${row.capability}`) }) : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="primary-model">{t("capabilityMapping.primaryModel")}</Label>
            <Select
              value={primaryValue}
              onValueChange={(value) =>
                onFormChange({
                  ...form,
                  primary_model_id: value === NONE_VALUE ? null : Number(value),
                  fallback_model_id: form.fallback_model_id === Number(value) ? null : form.fallback_model_id,
                })
              }
            >
              <SelectTrigger id="primary-model">
                <SelectValue placeholder={t("capabilityMapping.selectPrimary")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE_VALUE}>{t("capabilityMapping.unconfigured")}</SelectItem>
                  {enabledModels.map((model) => (
                    <SelectItem key={model.id} value={String(model.id)}>
                      {modelLabel(model)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fallback-model">{t("capabilityMapping.fallbackModel")}</Label>
            <Select
              value={fallbackValue}
              onValueChange={(value) =>
                onFormChange({
                  ...form,
                  fallback_model_id: value === NONE_VALUE ? null : Number(value),
                })
              }
            >
              <SelectTrigger id="fallback-model">
                <SelectValue placeholder={t("capabilityMapping.selectFallback")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE_VALUE}>{t("capabilityMapping.noFallback")}</SelectItem>
                  {enabledModels.map((model) => (
                    <SelectItem key={model.id} value={String(model.id)} disabled={model.id === form.primary_model_id}>
                      {modelLabel(model)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <Label htmlFor="mapping-enabled">{t("capabilityMapping.enabled")}</Label>
            <Switch
              id="mapping-enabled"
              checked={form.enabled}
              onCheckedChange={(enabled) => onFormChange({ ...form, enabled })}
            />
          </div>

          {feedback && <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">{feedback}</div>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button type="button" onClick={onSave} disabled={isSaving}>
            <Save data-icon="inline-start" />
            {isSaving ? t("action.saving") : t("capabilityMapping.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CapabilityMappingPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = Boolean(auth.user?.is_super_admin);
  const [editingRow, setEditingRow] = useState<MappingRow | null>(null);
  const [form, setForm] = useState<MappingForm>({ primary_model_id: null, fallback_model_id: null, enabled: true });
  const [feedback, setFeedback] = useState("");

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

  const modelsById = useMemo(() => new Map((modelsQuery.data ?? []).map((model) => [model.id, model])), [modelsQuery.data]);
  const enabledModels = useMemo(() => (modelsQuery.data ?? []).filter((model) => model.enabled), [modelsQuery.data]);
  const rows = useMemo(() => rowsFromMappings(mappingsQuery.data), [mappingsQuery.data]);
  const noModels = (modelsQuery.data ?? []).length === 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editingRow) {
        throw new Error(t("capabilityMapping.validationNoSelection"));
      }
      if (form.primary_model_id && form.primary_model_id === form.fallback_model_id) {
        throw new Error(t("capabilityMapping.validationDuplicate"));
      }
      const payload: GatewayCapabilityMappingPayload = {
        primary_model_id: form.primary_model_id,
        fallback_model_id: form.fallback_model_id,
        enabled: form.enabled,
      };
      if (editingRow.id === null) {
        return apiClient.createGatewayCapabilityMapping({ ...payload, capability: editingRow.capability });
      }
      return apiClient.updateGatewayCapabilityMapping(editingRow.id, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gateway-capability-mappings"] });
      await queryClient.invalidateQueries({ queryKey: ["ai-models"] });
      const message = t("capabilityMapping.saved");
      setFeedback(message);
      toast.success(message);
      setEditingRow(null);
    },
    onError: (error) => {
      const message = mutationMessage(error);
      setFeedback(message);
      toast.error(message);
    },
  });

  const openEdit = (row: MappingRow) => {
    if (!isSuperAdmin) {
      const message = t("capabilityMapping.permissionDenied");
      setFeedback(message);
      toast.error(message);
      return;
    }
    setEditingRow(row);
    setForm({
      primary_model_id: row.primary_model_id,
      fallback_model_id: row.fallback_model_id,
      enabled: row.enabled,
    });
    setFeedback("");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("capabilityMapping.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSuperAdmin ? t("capabilityMapping.help") : t("capabilityMapping.readOnlyHelp")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void modelsQuery.refetch();
            void mappingsQuery.refetch();
          }}
        >
          <RefreshCcw data-icon="inline-start" />
          {t("app.reload")}
        </Button>
      </div>

      {feedback && <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">{feedback}</div>}

      {noModels && (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <div className="font-medium">{t("capabilityMapping.emptyModelsTitle")}</div>
              <div className="mt-1">{t("capabilityMapping.emptyModelsDescription")}</div>
            </div>
          </div>
        </div>
      )}

      <ApiState
        isLoading={modelsQuery.isLoading || mappingsQuery.isLoading}
        isError={modelsQuery.isError || mappingsQuery.isError}
        isEmpty={false}
        errorLabel={t("app.error")}
        onRetry={() => {
          void modelsQuery.refetch();
          void mappingsQuery.refetch();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              {t("capabilityMapping.tableTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("capabilityMapping.capabilityName")}</TableHead>
                    <TableHead>{t("capabilityMapping.primaryModel")}</TableHead>
                    <TableHead>{t("capabilityMapping.fallbackModel")}</TableHead>
                    <TableHead>{t("capabilityMapping.status")}</TableHead>
                    <TableHead className="text-right">{t("capabilityMapping.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const primaryModel = row.primary_model_id ? modelsById.get(row.primary_model_id) : undefined;
                    const fallbackModel = row.fallback_model_id ? modelsById.get(row.fallback_model_id) : undefined;
                    return (
                      <TableRow key={row.capability}>
                        <TableCell className="min-w-64 align-top">
                          <div className="font-medium text-foreground">
                            {t(`capabilityMapping.capabilities.${row.capability}`, { defaultValue: row.capability })}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">{row.capability}</div>
                          <HealthIndicator row={row} />
                        </TableCell>
                        <TableCell className="min-w-60 align-top">
                          <ModelCell
                            model={primaryModel}
                            emptyLabel={t("capabilityMapping.unconfigured")}
                            emptyTone="danger"
                          />
                        </TableCell>
                        <TableCell className="min-w-60 align-top">
                          <ModelCell
                            model={fallbackModel}
                            emptyLabel={t("capabilityMapping.unconfigured")}
                            emptyTone="muted"
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant={row.enabled ? "default" : "secondary"}>
                            {row.enabled ? t("status.enabled") : t("status.disabled")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          {isSuperAdmin ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => openEdit(row)}>
                              <Pencil data-icon="inline-start" />
                              {t("action.edit")}
                            </Button>
                          ) : (
                            <span className="text-sm text-muted-foreground">{t("capabilityMapping.readOnly")}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </ApiState>

      <MappingDialog
        open={editingRow !== null}
        row={editingRow}
        form={form}
        enabledModels={enabledModels}
        feedback={feedback}
        isSaving={saveMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRow(null);
          }
        }}
        onFormChange={(nextForm) => {
          setForm(nextForm);
          setFeedback("");
        }}
        onSave={() => saveMutation.mutate()}
      />
    </div>
  );
}
