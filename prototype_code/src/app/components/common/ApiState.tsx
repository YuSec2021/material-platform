import { RefreshCcw } from "lucide-react";

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
  loadingLabel = "正在加载后端数据...",
  errorLabel = "后端数据加载失败",
  emptyLabel = "后端暂无数据",
  onRetry,
  children,
}: ApiStateProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-sm text-gray-600">
        {loadingLabel}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="text-sm font-medium text-red-700">{errorLabel}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-100"
          >
            <RefreshCcw className="h-4 w-4" />
            重试
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          0
        </div>
        <p className="text-sm text-gray-600">{emptyLabel}</p>
      </div>
    );
  }

  return <>{children}</>;
}
