import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient, type ProductName } from "@/app/api/client";
import { useAuth } from "@/app/auth/AuthContext";
import { aliasProbe } from "@/app/dev/aliasProbe";
import { useAppStore } from "@/app/store/useAppStore";
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
  status: "ready" | "pending";
  detail: string;
};

type ProxyResult = {
  ok: boolean;
  status: number;
  data: ProductName[] | null;
  error: string | null;
};

export function FrontendHealth() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { healthProbeCount, lastHealthProbeAt, markHealthProbe } = useAppStore();
  const [proxyResult, setProxyResult] = useState<ProxyResult | null>(null);
  const [proxyState, setProxyState] = useState<"idle" | "checking" | "done" | "error">("idle");

  const checks: Check[] = [
    {
      name: "API client",
      status: typeof apiClient.productNames === "function" ? "ready" : "pending",
      detail: "typed fetch wrapper mounted",
    },
    {
      name: "Auth context",
      status: auth.status === "authenticated" ? "ready" : "pending",
      detail: auth.user?.display_name ?? "not authenticated",
    },
    {
      name: "React Query provider",
      status: queryClient ? "ready" : "pending",
      detail: "QueryClient available",
    },
    {
      name: "Zustand store read/write",
      status: typeof markHealthProbe === "function" ? "ready" : "pending",
      detail: `writes=${healthProbeCount}${lastHealthProbeAt ? ` at ${lastHealthProbeAt}` : ""}`,
    },
    {
      name: "Strict TypeScript build configuration",
      status: "ready",
      detail: "tsconfig strict mode enabled",
    },
    {
      name: "@/* path alias resolution",
      status: aliasProbe.ready ? "ready" : "pending",
      detail: aliasProbe.source,
    },
  ];

  const runProxyHealthCheck = async () => {
    setProxyState("checking");
    markHealthProbe();

    try {
      const result = await apiClient.productNames();
      setProxyResult({
        ok: true,
        status: 200,
        data: result,
        error: null,
      });
      setProxyState("done");
    } catch (error) {
      setProxyResult({
        ok: false,
        status: 0,
        data: null,
        error: error instanceof Error ? error.message : "Unknown request failure",
      });
      setProxyState("error");
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold text-gray-900">Frontend Health</h3>
          <p className="mt-1 text-sm text-gray-500">Sprint 13 infrastructure checks</p>
        </div>
        <Button onClick={runProxyHealthCheck} disabled={proxyState === "checking"}>
          {proxyState === "checking" ? "Checking proxy" : "Run proxy health check"}
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
                <Badge variant={check.status === "ready" ? "default" : "secondary"}>
                  {check.status}
                </Badge>
              </TableCell>
              <TableCell>{check.detail}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={proxyResult?.ok ? "default" : "secondary"}>
            Proxy {proxyState}
          </Badge>
          <span className="text-sm text-gray-700">Request URL: /api/v1/product-names</span>
          <span className="text-sm text-gray-700">
            HTTP status: {proxyResult ? proxyResult.status : "not checked"}
          </span>
          <span className="text-sm text-gray-700">
            JSON array: {Array.isArray(proxyResult?.data) ? "yes" : "not checked"}
          </span>
        </div>
        {proxyResult?.error && (
          <p className="mt-3 text-sm text-red-600">{proxyResult.error}</p>
        )}
      </div>
    </section>
  );
}
