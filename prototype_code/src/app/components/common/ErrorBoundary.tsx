import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import i18n from "@/app/i18n";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled React error", error, info.componentStack);
  }

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <section className="w-full max-w-lg rounded-lg border border-red-200 bg-white p-8 shadow-sm">
          <div className="mb-4 flex items-center gap-3 text-red-700">
            <AlertTriangle className="h-6 w-6" />
            <h1 className="text-xl font-semibold">{i18n.t("app.error")}</h1>
          </div>
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {this.state.error.message || i18n.t("app.error")}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <RefreshCcw className="h-4 w-4" />
            {i18n.t("app.reload")}
          </button>
        </section>
      </main>
    );
  }
}
