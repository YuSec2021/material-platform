import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient, apiClientHealth, type AuthUser } from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";

type Check = {
  name: string;
  ready: boolean;
  detail: string;
};

export function ApiClientHealth() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const currentUserQuery = useQuery({
    queryKey: ["dev", "api-client-health", "current-user"],
    queryFn: apiClient.auth.me,
    enabled,
    retry: false,
  });
  const health = apiClientHealth();
  const currentUser = currentUserQuery.data as AuthUser | undefined;

  const checks: Check[] = [
    {
      name: "axios API client",
      ready: health.axiosClientReady,
      detail: "axios-style typed client mounted at proxy base URL",
    },
    {
      name: "typed endpoint methods",
      ready: health.typedEndpointMethodsReady,
      detail: "auth, product names, brands, attributes, materials, users, roles, permissions",
    },
    {
      name: "request interceptor",
      ready: health.requestInterceptorReady,
      detail: "adds auth identity headers from storage",
    },
    {
      name: "response/error interceptor",
      ready: health.responseInterceptorReady,
      detail: "normalizes non-2xx backend responses into typed errors",
    },
    {
      name: "auth storage",
      ready: health.authStorageReady && auth.status === "authenticated",
      detail: auth.user?.username ?? "not authenticated",
    },
    {
      name: "React Query integration",
      ready: Boolean(queryClient),
      detail: "current-user check is executed through useQuery",
    },
    {
      name: "proxy base URL",
      ready: health.baseUrl === "/api/v1",
      detail: health.baseUrl,
    },
  ];

  const runCurrentUserCheck = () => {
    setEnabled(true);
    void currentUserQuery.refetch();
  };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold text-gray-900">API Client Health</h3>
          <p className="mt-1 text-sm text-gray-500">Sprint 14 auth and typed client checks</p>
        </div>
        <Button onClick={runCurrentUserCheck} disabled={currentUserQuery.isFetching}>
          {currentUserQuery.isFetching ? "Checking current user" : "Run current-user check"}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Check</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {checks.map((check) => (
            <TableRow key={check.name}>
              <TableCell className="font-medium">{check.name}</TableCell>
              <TableCell>
                <Badge variant={check.ready ? "default" : "secondary"}>
                  {check.ready ? "ready" : "pending"}
                </Badge>
              </TableCell>
              <TableCell>{check.detail}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={currentUserQuery.isSuccess ? "default" : "secondary"}>
            Current user {currentUserQuery.fetchStatus}
          </Badge>
          <span className="text-sm text-gray-700">Request URL: /api/v1/auth/me</span>
          <span className="text-sm text-gray-700">
            Last client URL: {health.lastRequestUrl ?? "not checked"}
          </span>
          <span className="text-sm text-gray-700">
            HTTP status: {health.lastResponseStatus ?? "not checked"}
          </span>
          <span className="text-sm text-gray-700">
            Username: {currentUser?.username ?? "not checked"}
          </span>
        </div>
        {currentUserQuery.isError && (
          <p className="mt-3 text-sm text-red-600">
            {currentUserQuery.error instanceof Error ? currentUserQuery.error.message : "Current-user check failed"}
          </p>
        )}
      </div>
    </section>
  );
}
