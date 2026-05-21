import { AlertTriangle, Inbox, RefreshCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "../ui/skeleton";

type ApiStateProps = {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  loadingLabel?: string;
  errorLabel?: string;
  emptyLabel?: string;
  onRetry?: () => void;
  children: React.ReactNode;
};

export function ApiState({
  isLoading,
  isError,
  isEmpty,
  loadingLabel,
  errorLabel,
  emptyLabel,
  onRetry,
  children,
}: ApiStateProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div
        className="rounded-lg border border-border bg-card p-5 shadow-sm"
        role="progressbar"
        aria-label={loadingLabel ?? t("app.loading")}
      >
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="space-y-3" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid grid-cols-12 gap-3 rounded-md border border-border p-3">
              <Skeleton className="col-span-3 h-4" />
              <Skeleton className="col-span-2 h-4" />
              <Skeleton className="col-span-4 h-4" />
              <Skeleton className="col-span-1 h-4" />
              <Skeleton className="col-span-2 h-4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6" role="alert">
        <div className="flex items-center gap-2 text-red-800">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-sm font-semibold">{errorLabel ?? t("app.error")}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-card px-3 py-2 text-sm text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          >
            <RefreshCcw className="h-4 w-4" />
            {t("app.retry")}
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <Inbox className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-foreground">{emptyLabel ?? t("app.empty")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
