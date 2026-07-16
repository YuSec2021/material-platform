import { RouterProvider } from "react-router";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { AppProviders } from "./providers/AppProviders";
import { router } from "./routes";

export default function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </ErrorBoundary>
  );
}
