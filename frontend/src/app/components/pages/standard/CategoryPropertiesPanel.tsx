import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Edit, GripVertical, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  apiClient,
  type Category,
  type CategoryAttribute,
  type CategoryAttributeImportConflictStrategy,
  type CategoryAttributeImportPreview,
  type CategoryAttributePayload,
  type CategoryAttributeType,
  type CategoryLibrary,
} from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { Modal } from "../../common/Modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Badge } from "@/app/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
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

type AttributeFormState = {
  name: string;
  display_name_zh: string;
  display_name_en: string;
  attr_type: CategoryAttributeType;
  definition: string;
  options: string[];
  optionDraft: string;
  required: boolean;
  allow_empty: boolean;
  default_value: string;
};

const emptyAttributeForm: AttributeFormState = {
  name: "",
  display_name_zh: "",
  display_name_en: "",
  attr_type: "string",
  definition: "",
  options: [],
  optionDraft: "",
  required: false,
  allow_empty: true,
  default_value: "",
};

const attributeTypes: CategoryAttributeType[] = ["string", "number", "enum"];
type ImportFilter = "all" | "errors" | "valid";

function attributeToForm(attribute: CategoryAttribute): AttributeFormState {
  return {
    name: attribute.name,
    display_name_zh: attribute.display_name_zh,
    display_name_en: attribute.display_name_en,
    attr_type: attribute.attr_type,
    definition: attribute.definition,
    options: attribute.options,
    optionDraft: "",
    required: attribute.required,
    allow_empty: attribute.required ? false : attribute.allow_empty,
    default_value: attribute.default_value ?? "",
  };
}

function formToPayload(form: AttributeFormState, sortOrder?: number): CategoryAttributePayload {
  return {
    name: form.name.trim(),
    attr_type: form.attr_type,
    display_name_zh: form.display_name_zh.trim(),
    display_name_en: form.display_name_en.trim(),
    definition: form.definition.trim(),
    options: form.attr_type === "enum" ? form.options : [],
    required: form.required,
    allow_empty: form.required ? false : form.allow_empty,
    default_value: form.default_value.trim() || null,
    sort_order: sortOrder ?? null,
  };
}

function attributeLabel(attribute: CategoryAttribute) {
  return attribute.display_name_zh || attribute.name;
}

function sortAttributes(attributes: CategoryAttribute[]) {
  return [...attributes].sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);
}

function reorderAttributes(attributes: CategoryAttribute[], draggedId: number, targetId: number) {
  const next = [...attributes];
  const from = next.findIndex((attribute) => attribute.id === draggedId);
  const to = next.findIndex((attribute) => attribute.id === targetId);
  if (from < 0 || to < 0 || from === to) {
    return next;
  }
  const [dragged] = next.splice(from, 1);
  if (!dragged) {
    return next;
  }
  next.splice(to, 0, dragged);
  return next;
}

function CategoryAttributeImportModal({
  selectedLibrary,
  isOpen,
  onOpenChange,
}: {
  selectedLibrary: CategoryLibrary | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStrategy, setImportStrategy] = useState<CategoryAttributeImportConflictStrategy>("skip");
  const [importPreview, setImportPreview] = useState<CategoryAttributeImportPreview | null>(null);
  const [importFilter, setImportFilter] = useState<ImportFilter>("all");
  const importPreviewItems = useMemo(() => {
    if (!importPreview) return [];
    return [...importPreview.items].sort((a, b) => {
      const aError = a.errors.length > 0 || a.action === "error" ? 0 : 1;
      const bError = b.errors.length > 0 || b.action === "error" ? 0 : 1;
      if (aError !== bError) return aError - bError;
      return a.row_number - b.row_number;
    });
  }, [importPreview]);
  const importPreviewErrorCount = useMemo(
    () => importPreview?.items.filter((item) => item.errors.length > 0 || item.action === "error").length ?? 0,
    [importPreview],
  );
  const importPreviewValidCount = useMemo(
    () => importPreview?.items.filter((item) => item.errors.length === 0 && item.action !== "error").length ?? 0,
    [importPreview],
  );
  const visiblePreviewItems = useMemo(() => {
    if (importFilter === "errors") {
      return importPreviewItems.filter((item) => item.errors.length > 0 || item.action === "error");
    }
    if (importFilter === "valid") {
      return importPreviewItems.filter((item) => item.errors.length === 0 && item.action !== "error");
    }
    return importPreviewItems;
  }, [importPreviewItems, importFilter]);

  useEffect(() => {
    if (isOpen) {
      setImportFile(null);
      setImportPreview(null);
      setImportStrategy("skip");
      setImportFilter("all");
    }
  }, [isOpen]);

  const importPreviewMutation = useMutation({
    mutationFn: () => {
      if (!selectedLibrary || !importFile) {
        throw new Error(t("categoryProperties.importFileRequired"));
      }
      return apiClient.previewCategoryAttributeImport(selectedLibrary.id, importFile, importStrategy);
    },
    onSuccess: (preview) => setImportPreview(preview),
    onError: (error) => toast.error(`${t("categoryProperties.importPreviewFailed")}: ${error.message}`),
  });

  const importConfirmMutation = useMutation({
    mutationFn: () => {
      if (!importPreview) {
        throw new Error(t("categoryProperties.importPreviewRequired"));
      }
      return apiClient.confirmCategoryAttributeImport(importPreview);
    },
    onSuccess: async (result) => {
      toast.success(
        t("categoryProperties.importComplete", {
          created: result.created_count,
          updated: result.updated_count,
        }),
      );
      onOpenChange(false);
      setImportFile(null);
      setImportPreview(null);
      await queryClient.invalidateQueries({ queryKey: ["category-properties"] });
    },
    onError: (error) => toast.error(`${t("categoryProperties.importFailed")}: ${error.message}`),
  });

  const downloadImportTemplate = async () => {
    try {
      const blob = await apiClient.downloadCategoryAttributeImportTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "category-attribute-import-template.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(`${t("categoryProperties.templateDownloadFailed")}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <Modal
      isOpen={isOpen && selectedLibrary !== null}
      onClose={() => onOpenChange(false)}
      title={t("categoryProperties.bulkImport")}
      size="xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => importPreviewMutation.mutate()}
            disabled={!importFile || importPreviewMutation.isPending}
          >
            {importPreviewMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("categoryProperties.previewImport")}
          </Button>
          <Button
            type="button"
            onClick={() => importConfirmMutation.mutate()}
            disabled={!importPreview?.valid_count || importConfirmMutation.isPending}
          >
            {importConfirmMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("categoryProperties.confirmImport")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
          {t("categoryProperties.importHint", { library: selectedLibrary?.name ?? "" })}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Button type="button" variant="outline" onClick={downloadImportTemplate}>
            <Download className="h-4 w-4" />
            {t("categoryProperties.downloadTemplate")}
          </Button>
          <label className="min-w-56 flex-1 space-y-1 text-sm text-foreground">
            <span>{t("categoryProperties.importFile")}</span>
            <Input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(event) => {
                setImportFile(event.target.files?.[0] ?? null);
                setImportPreview(null);
              }}
            />
          </label>
          <label className="w-48 space-y-1 text-sm text-foreground">
            <span>{t("categoryProperties.conflictStrategy")}</span>
            <Select
              value={importStrategy}
              onValueChange={(value) => {
                setImportStrategy(value as CategoryAttributeImportConflictStrategy);
                setImportPreview(null);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">{t("categoryProperties.conflictSkip")}</SelectItem>
                <SelectItem value="update">{t("categoryProperties.conflictUpdate")}</SelectItem>
                <SelectItem value="error">{t("categoryProperties.conflictError")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        {importPreview && (
          <div className="space-y-3" data-testid="category-attribute-import-preview">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              <ImportSummary label={t("categoryProperties.importTotal")} value={importPreview.total_count} />
              <ImportSummary label={t("categoryProperties.importCreate")} value={importPreview.create_count} />
              <ImportSummary label={t("categoryProperties.importUpdate")} value={importPreview.update_count} />
              <ImportSummary label={t("categoryProperties.importSkipped")} value={importPreview.skipped_count} />
              <ImportSummary label={t("categoryProperties.importErrors")} value={importPreview.error_count} />
            </div>
            <div
              className="inline-flex rounded-md border border-border bg-muted/30 p-0.5 text-xs"
              role="tablist"
              aria-label="import-preview-filter"
            >
              {([
                { value: "all" as const, label: t("categoryProperties.importFilterAll", { count: importPreview.items.length }) },
                { value: "errors" as const, label: t("categoryProperties.importFilterErrors", { count: importPreviewErrorCount }) },
                { value: "valid" as const, label: t("categoryProperties.importFilterValid", { count: importPreviewValidCount }) },
              ]).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={importFilter === option.value}
                  data-testid={`import-filter-${option.value}`}
                  onClick={() => setImportFilter(option.value)}
                  className={`rounded px-3 py-1 transition-colors ${
                    importFilter === option.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("categoryProperties.importFilterHint")}</p>
            <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                  <tr>
                    <th className="p-2">{t("categoryProperties.importRow")}</th>
                    <th className="p-2">{t("categoryProperties.importCategory")}</th>
                    <th className="p-2">{t("categoryProperties.name")}</th>
                    <th className="p-2">{t("categoryProperties.type")}</th>
                    <th className="p-2">{t("categoryProperties.importAction")}</th>
                    <th className="p-2">{t("categoryProperties.importMessage")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePreviewItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        {t("state.emptyImportItems")}
                      </td>
                    </tr>
                  ) : (
                    visiblePreviewItems.map((item) => {
                      const hasError = item.errors.length > 0 || item.action === "error";
                      return (
                        <tr
                          key={item.row_number}
                          data-testid={`import-row-${item.row_number}`}
                          data-has-error={hasError ? "true" : "false"}
                          className={`border-t border-border ${hasError ? "bg-red-50/60" : ""}`}
                        >
                          <td className="p-2 font-mono">{item.row_number}</td>
                          <td className="p-2">{item.category_path || item.category_code}</td>
                          <td className="p-2">{item.attribute?.name ?? "-"}</td>
                          <td className="p-2">{item.attribute?.attr_type ?? "-"}</td>
                          <td className="p-2">{t(`categoryProperties.importActions.${item.action}`)}</td>
                          <td className={`p-2 ${hasError ? "text-red-700" : "text-muted-foreground"}`}>
                            {item.errors.join("；") || "-"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function CategoryPropertiesPanel({
  selectedCategory,
  selectedLibrary,
  isSuperAdmin,
  isImportOpen,
  onImportOpenChange,
}: {
  selectedCategory: Category | null;
  selectedLibrary: CategoryLibrary | null;
  isSuperAdmin: boolean;
  isImportOpen: boolean;
  onImportOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<CategoryAttribute | null>(null);
  const [form, setForm] = useState<AttributeFormState>(emptyAttributeForm);
  const [draggedAttributeId, setDraggedAttributeId] = useState<number | null>(null);
  const [attributeToDelete, setAttributeToDelete] = useState<CategoryAttribute | null>(null);
  const canManageAttributes = Boolean(
    isSuperAdmin ||
      user?.is_super_admin ||
      user?.username === "super_admin" ||
      user?.roles?.some((role) => role.code === "super_admin" || role.name === "超级管理员" || role.name === "Super Admin"),
  );

  const categoryId = selectedCategory?.id ?? null;
  const propertiesQuery = useQuery({
    queryKey: ["category-properties", categoryId],
    queryFn: () => apiClient.categoryProperties(Number(categoryId)),
    enabled: categoryId !== null,
    retry: false,
  });

  const ownAttributes = useMemo(() => sortAttributes(propertiesQuery.data?.own ?? []), [propertiesQuery.data?.own]);
  const inheritedAttributes = useMemo(
    () => sortAttributes(propertiesQuery.data?.inherited ?? []),
    [propertiesQuery.data?.inherited],
  );
  const hasManyAttributes = ownAttributes.length + inheritedAttributes.length > 20;

  const saveMutation = useMutation({
    mutationFn: (payload: CategoryAttributePayload) => {
      if (!categoryId) {
        throw new Error(t("categoryProperties.selectCategoryFirst"));
      }
      return editingAttribute
        ? apiClient.updateCategoryAttribute(categoryId, editingAttribute.id, payload)
        : apiClient.createCategoryAttribute(categoryId, payload);
    },
    onSuccess: async () => {
      setIsFormOpen(false);
      setEditingAttribute(null);
      setForm(emptyAttributeForm);
      toast.success(t("toast.saveSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["category-properties", categoryId] });
    },
    onError: (error) => toast.error(`${t("toast.saveFailed")}: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (attributeId: number) => {
      if (!categoryId) {
        throw new Error(t("categoryProperties.selectCategoryFirst"));
      }
      return apiClient.deleteCategoryAttribute(categoryId, attributeId);
    },
    onSuccess: async () => {
      setAttributeToDelete(null);
      toast.success(t("toast.deleteSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["category-properties", categoryId] });
    },
    onError: (error) => toast.error(`${t("toast.deleteFailed")}: ${error.message}`),
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedAttributes: CategoryAttribute[]) => {
      if (!categoryId) {
        throw new Error(t("categoryProperties.selectCategoryFirst"));
      }
      await Promise.all(
        orderedAttributes.map((attribute, index) =>
          apiClient.updateCategoryAttribute(categoryId, attribute.id, { sort_order: (index + 1) * 10 }),
        ),
      );
    },
    onSuccess: async () => {
      toast.success(t("categoryProperties.reorderSaved"));
      await queryClient.invalidateQueries({ queryKey: ["category-properties", categoryId] });
    },
    onError: (error) => toast.error(`${t("categoryProperties.reorderFailed")}: ${error.message}`),
  });

  const openCreateForm = () => {
    setEditingAttribute(null);
    setForm(emptyAttributeForm);
    setIsFormOpen(true);
  };

  const openEditForm = (attribute: CategoryAttribute) => {
    setEditingAttribute(attribute);
    setForm(attributeToForm(attribute));
    setIsFormOpen(true);
  };

  const addOption = () => {
    const nextOption = form.optionDraft.trim();
    if (!nextOption || form.options.includes(nextOption)) {
      setForm((current) => ({ ...current, optionDraft: "" }));
      return;
    }
    setForm((current) => ({
      ...current,
      options: [...current.options, nextOption],
      optionDraft: "",
      default_value: current.default_value || nextOption,
    }));
  };

  const removeOption = (option: string) => {
    setForm((current) => ({
      ...current,
      options: current.options.filter((item) => item !== option),
      default_value: current.default_value === option ? "" : current.default_value,
    }));
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addOption();
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: number) => {
    event.preventDefault();
    if (!draggedAttributeId || draggedAttributeId === targetId || !canManageAttributes) {
      setDraggedAttributeId(null);
      return;
    }
    reorderMutation.mutate(reorderAttributes(ownAttributes, draggedAttributeId, targetId));
    setDraggedAttributeId(null);
  };

  const formIsValid = Boolean(form.name.trim()) && (form.attr_type !== "enum" || form.options.length > 0);

  if (!selectedCategory) {
    return (
      <>
        <section
          data-testid="category-attributes-panel"
          data-selected-category-id=""
          className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground"
        >
          <h3 className="mb-1 font-medium text-foreground">{t("categoryProperties.title")}</h3>
          {selectedLibrary
            ? t("categoryProperties.librarySelection", { library: selectedLibrary.name })
            : t("categoryProperties.emptySelection")}
        </section>
        <CategoryAttributeImportModal
          selectedLibrary={selectedLibrary}
          isOpen={isImportOpen}
          onOpenChange={onImportOpenChange}
        />
      </>
    );
  }

  return (
    <section
      data-testid="category-attributes-panel"
      data-selected-category-id={selectedCategory.id}
      className="rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">{t("categoryProperties.title")}</h3>
          <p data-testid="category-attributes-summary" className="mt-1 text-xs text-muted-foreground">
            {t("categoryProperties.summary", {
              own: ownAttributes.length,
              inherited: inheritedAttributes.length,
              category: selectedCategory.name,
            })}
          </p>
        </div>
        {canManageAttributes && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={openCreateForm}
              aria-label={t("categoryProperties.add")}
              size="sm"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("categoryProperties.add")}
            </Button>
          </div>
        )}
      </div>

      <div className={`${hasManyAttributes ? "max-h-96 overflow-y-auto pr-1" : "space-y-4"}`}>
        <AttributeSection
          title={t("categoryProperties.inherited")}
          emptyLabel={t("categoryProperties.emptyInherited")}
          attributes={inheritedAttributes}
          isInherited
        />
        <AttributeSection
          title={t("categoryProperties.own")}
          emptyLabel={t("categoryProperties.emptyOwn")}
          attributes={ownAttributes}
          isInherited={false}
          canEdit={canManageAttributes}
          isReordering={reorderMutation.isPending}
          onEdit={openEditForm}
          onDelete={setAttributeToDelete}
          onDragStart={setDraggedAttributeId}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        />
      </div>

      {!canManageAttributes && <p className="mt-3 text-xs text-muted-foreground">{t("categoryProperties.readOnlyHint")}</p>}
      {propertiesQuery.isLoading && <p className="mt-3 text-xs text-muted-foreground">{t("categoryProperties.loading")}</p>}
      {propertiesQuery.isError && <p className="mt-3 text-xs text-red-600">{t("categoryProperties.loadFailed")}</p>}

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingAttribute ? t("categoryProperties.edit") : t("categoryProperties.add")}
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
              onClick={() => saveMutation.mutate(formToPayload(form, editingAttribute?.sort_order))}
              disabled={!formIsValid || saveMutation.isPending}
              aria-busy={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {saveMutation.isPending ? t("action.saving") : t("action.save")}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("categoryProperties.name")}</span>
            <Input
              aria-label={t("categoryProperties.name")}
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder={t("categoryProperties.namePlaceholder")}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("categoryProperties.type")}</span>
            <Select
              value={form.attr_type}
              onValueChange={(value) => {
                const attrType = value as CategoryAttributeType;
                setForm((current) => ({
                  ...current,
                  attr_type: attrType,
                  options: attrType === "enum" ? current.options : [],
                  default_value: attrType === "enum" && current.options.length > 0 ? current.options[0] ?? "" : current.default_value,
                }));
              }}
            >
              <SelectTrigger aria-label={t("categoryProperties.type")}><SelectValue /></SelectTrigger>
              <SelectContent>
                {attributeTypes.map((type) => <SelectItem key={type} value={type}>{t(`categoryProperties.types.${type}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm text-foreground md:col-span-2">
            <span>{t("categoryProperties.definition")}</span>
            <Textarea
              aria-label={t("categoryProperties.definition")}
              value={form.definition}
              onChange={(event) => setForm((current) => ({ ...current, definition: event.target.value }))}
              placeholder={t("categoryProperties.definitionPlaceholder")}
              rows={2}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("categoryProperties.displayZh")}</span>
            <Input
              aria-label={t("categoryProperties.displayZh")}
              type="text"
              value={form.display_name_zh}
              onChange={(event) => setForm((current) => ({ ...current, display_name_zh: event.target.value }))}
              placeholder={t("categoryProperties.displayZhPlaceholder")}
            />
          </label>
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("categoryProperties.displayEn")}</span>
            <Input
              aria-label={t("categoryProperties.displayEn")}
              type="text"
              value={form.display_name_en}
              onChange={(event) => setForm((current) => ({ ...current, display_name_en: event.target.value }))}
              placeholder={t("categoryProperties.displayEnPlaceholder")}
            />
          </label>
          {form.attr_type === "enum" && (
            <div className="space-y-2 text-sm text-foreground md:col-span-2">
              <span>{t("categoryProperties.options")}</span>
              <div className="flex flex-wrap gap-2">
                {form.options.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    onClick={() => removeOption(option)}
                    variant="secondary"
                    size="sm"
                    className="rounded-full"
                  >
                    {option} ×
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  aria-label={t("categoryProperties.options")}
                  type="text"
                  value={form.optionDraft}
                  onChange={(event) => setForm((current) => ({ ...current, optionDraft: event.target.value }))}
                  onKeyDown={handleOptionKeyDown}
                  placeholder={t("categoryProperties.optionPlaceholder")}
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  onClick={addOption}
                  variant="outline"
                >
                  {t("categoryProperties.addOption")}
                </Button>
              </div>
            </div>
          )}
          <label className="space-y-1 text-sm text-foreground">
            <span>{t("categoryProperties.defaultValue")}</span>
            {form.attr_type === "enum" ? (
              <Select
                value={form.default_value || "__none__"}
                onValueChange={(value) => setForm((current) => ({ ...current, default_value: value === "__none__" ? "" : value }))}
              >
                <SelectTrigger aria-label={t("categoryProperties.defaultValue")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("categoryProperties.noDefault")}</SelectItem>
                  {form.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input
                aria-label={t("categoryProperties.defaultValue")}
                type={form.attr_type === "number" ? "number" : "text"}
                value={form.default_value}
                onChange={(event) => setForm((current) => ({ ...current, default_value: event.target.value }))}
                placeholder={t("categoryProperties.defaultPlaceholder")}
              />
            )}
          </label>
          <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-muted/20 p-3 text-sm text-foreground">
            <label className="inline-flex items-center gap-2">
              <Checkbox
                checked={form.required}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    required: checked === true,
                    allow_empty: checked === true ? false : current.allow_empty,
                  }))
                }
                aria-label={t("categoryProperties.required")}
              />
              {t("categoryProperties.required")}
            </label>
            <label className="inline-flex items-center gap-2">
              <Checkbox
                checked={form.allow_empty}
                disabled={form.required}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    required: checked === true ? false : current.required,
                    allow_empty: checked === true,
                  }))
                }
                aria-label={t("categoryProperties.allowEmpty")}
              />
              {t("categoryProperties.allowEmpty")}
            </label>
            <p className="w-full text-xs text-muted-foreground">
              {t("categoryProperties.requiredEmptyHint")}
            </p>
          </div>
          {form.attr_type === "enum" && form.options.length === 0 && (
            <p className="text-sm text-red-600 md:col-span-2">{t("categoryProperties.enumRequiresOptions")}</p>
          )}
        </div>
      </Modal>
      <CategoryAttributeImportModal
        selectedLibrary={selectedLibrary}
        isOpen={isImportOpen}
        onOpenChange={onImportOpenChange}
      />
      <AlertDialog open={Boolean(attributeToDelete)} onOpenChange={(open) => !open && setAttributeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("action.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {attributeToDelete
                ? t("categoryProperties.deleteConfirm", { name: attributeLabel(attributeToDelete) })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => attributeToDelete && deleteMutation.mutate(attributeToDelete.id)}
              disabled={deleteMutation.isPending}
              aria-busy={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? t("action.saving") : t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ImportSummary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function AttributeSection({
  title,
  emptyLabel,
  attributes,
  isInherited,
  canEdit = false,
  isReordering = false,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  title: string;
  emptyLabel: string;
  attributes: CategoryAttribute[];
  isInherited: boolean;
  canEdit?: boolean;
  isReordering?: boolean;
  onEdit?: (attribute: CategoryAttribute) => void;
  onDelete?: (attribute: CategoryAttribute) => void;
  onDragStart?: (id: number) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>, id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
        {isReordering && <span className="text-xs text-blue-700">{t("categoryProperties.reordering")}</span>}
      </div>
      {attributes.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {attributes.map((attribute) => (
            <div
              key={`${attribute.id}-${attribute.source_category_id}`}
              draggable={canEdit && !isInherited && attributes.length > 1}
              onDragStart={() => onDragStart?.(attribute.id)}
              onDragOver={onDragOver}
              onDrop={(event) => onDrop?.(event, attribute.id)}
              className={`rounded-md border p-3 text-sm ${
                isInherited
                  ? "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-300"
                  : "border-border bg-background text-foreground"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {canEdit && !isInherited && attributes.length > 1 && (
                      <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" aria-label={t("categoryProperties.dragHandle")} />
                    )}
                    {isInherited && <Lock className="h-4 w-4 text-muted-foreground" aria-label={t("categoryProperties.inherited")} />}
                    <span className="font-medium">{attributeLabel(attribute)}</span>
                    {(attribute.required || !attribute.allow_empty) && <span className="text-red-600">*</span>}
                    <Badge variant="outline">
                      {t(`categoryProperties.types.${attribute.attr_type}`)}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{attribute.name}</p>
                  {attribute.definition && (
                    <p className="mt-1 text-xs text-muted-foreground">{attribute.definition}</p>
                  )}
                  {isInherited && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("categoryProperties.inheritedFrom", { name: attribute.inherited_from_category_name ?? attribute.source_category_name })}
                    </p>
                  )}
                  {attribute.options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {attribute.options.map((option) => (
                        <Badge key={option} variant="secondary">
                          {option}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {attribute.default_value && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("categoryProperties.defaultValue")}: {attribute.default_value}
                    </p>
                  )}
                </div>
                {canEdit && !isInherited && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      onClick={() => onEdit?.(attribute)}
                      variant="outline"
                      size="icon"
                      aria-label={t("action.edit")}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      onClick={() => onDelete?.(attribute)}
                      variant="destructive"
                      size="icon"
                      aria-label={t("action.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
