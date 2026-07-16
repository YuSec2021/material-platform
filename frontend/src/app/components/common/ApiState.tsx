import { AlertTriangle, Inbox, RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

type ApiStateProps = {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  loadingLabel?: string;
  errorLabel?: string;
  emptyLabel?: string;
  onRetry?: () => void;
  children: ReactNode;
};

export function ApiState({ isLoading, isError, isEmpty, loadingLabel, errorLabel, emptyLabel, onRetry, children }: ApiStateProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card
        role="progressbar"
        aria-busy="true"
        aria-live="polite"
        aria-valuetext={loadingLabel ?? t("app.loading")}
        aria-label={loadingLabel ?? t("app.loading")}
      >
        <CardHeader className="flex-row items-center justify-between">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-8 w-24" />
        </CardHeader>
        <CardContent className="space-y-3" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid grid-cols-12 gap-3 rounded-md border p-3">
              <Skeleton className="col-span-3 h-4" />
              <Skeleton className="col-span-2 h-4" />
              <Skeleton className="col-span-4 h-4" />
              <Skeleton className="col-span-1 h-4" />
              <Skeleton className="col-span-2 h-4" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>{errorLabel ?? t("app.error")}</AlertTitle>
        <AlertDescription>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-3">
              <RefreshCcw />
              {t("app.retry")}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  if (isEmpty) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center py-10 text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-info/10 text-info">
            <Inbox className="size-6" />
          </span>
          <p className="text-sm font-medium">{emptyLabel ?? t("app.empty")}</p>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
