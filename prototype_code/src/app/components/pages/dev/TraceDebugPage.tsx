import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, GitBranch, RefreshCcw } from "lucide-react";
import { apiClient, ApiError, type TraceSpan, type TraceSummary } from "@/app/api/client";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";

type TraceNode = {
  id: string;
  parentId: string | null;
  name: string;
  type: string;
  status: string;
  durationMs: number;
  children: TraceNode[];
};

function spanId(span: TraceSpan, index: number) {
  return String(span.span_id ?? span.id ?? `span-${index}`);
}

function normalizeSpan(span: TraceSpan, index: number): TraceNode {
  const children = Array.isArray(span.children) ? span.children.map(normalizeSpan) : [];
  return {
    id: spanId(span, index),
    parentId: span.parent_span_id === undefined ? (span.parent_id === undefined ? null : String(span.parent_id)) : String(span.parent_span_id ?? ""),
    name: String(span.operation_name ?? span.name ?? "unnamed span"),
    type: String(span.span_type ?? span.type ?? "span"),
    status: String(span.status ?? "ok"),
    durationMs: Number(span.duration_ms ?? 0),
    children,
  };
}

function buildSpanTree(spans: TraceSpan[]): TraceNode[] {
  const nodes = spans.map(normalizeSpan);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots: TraceNode[] = [];

  nodes.forEach((node) => {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots.length > 0 ? roots : nodes;
}

function traceRoots(trace: TraceSummary): TraceNode[] {
  if (Array.isArray(trace.spans) && trace.spans.length > 0) {
    return buildSpanTree(trace.spans);
  }
  if (Array.isArray(trace.children) && trace.children.length > 0) {
    return trace.children.map(normalizeSpan);
  }
  return [
    {
      id: trace.trace_id,
      parentId: null,
      name: String(trace.operation_name ?? trace.name ?? "trace root"),
      type: String(trace.capability ?? "chain"),
      status: String(trace.status ?? "ok"),
      durationMs: Number(trace.duration_ms ?? 0),
      children: [],
    },
  ];
}

function TraceNodeView({ node, depth = 0 }: { node: TraceNode; depth?: number }) {
  const indentClass = depth === 0 ? "" : depth === 1 ? "ml-6" : depth === 2 ? "ml-12" : "ml-16";
  const statusClass = node.status === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className={indentClass}>
      <div className="mb-2 rounded-md border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <GitBranch className="h-4 w-4 text-gray-500" />
          <span className="font-mono text-xs text-gray-500">{node.id}</span>
          <span className="text-sm font-medium text-gray-900">{node.name}</span>
          <Badge variant="outline">{node.type}</Badge>
          <Badge variant="outline" className={statusClass}>
            {node.status}
          </Badge>
          <span className="text-xs text-gray-500">{node.durationMs} ms</span>
        </div>
      </div>
      {node.children.map((child) => (
        <TraceNodeView key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function TraceDebugPage() {
  const traceQuery = useQuery({
    queryKey: ["debug-trace"],
    queryFn: apiClient.debugTrace,
    retry: false,
  });

  const traces = traceQuery.data ?? [];
  const blocked = traceQuery.error instanceof ApiError && traceQuery.error.status === 403;
  const trees = useMemo(() => traces.map((trace) => ({ trace, roots: traceRoots(trace) })), [traces]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl text-gray-900">AI 链路追踪</h1>
          <p className="text-sm text-gray-600">调试模式下展示 trace id、span 类型、状态和耗时。</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void traceQuery.refetch()}>
          <RefreshCcw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      {traceQuery.isLoading ? (
        <div className="space-y-3" aria-label="AI trace loading">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-11/12" />
          <Skeleton className="h-20 w-10/12" />
        </div>
      ) : blocked ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Debug trace is disabled
          </div>
          <p>当前环境未启用 AI_DEBUG，span 数据不会暴露。</p>
        </div>
      ) : traceQuery.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="mb-4 text-sm font-medium text-red-700">AI trace 加载失败。</p>
          <Button type="button" variant="outline" onClick={() => void traceQuery.refetch()}>
            <RefreshCcw className="h-4 w-4" />
            重试
          </Button>
        </div>
      ) : trees.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-600">
          暂无 trace span
        </div>
      ) : (
        <div className="space-y-4">
          {trees.map(({ trace, roots }) => (
            <section key={trace.trace_id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm text-gray-700">{trace.trace_id}</span>
                <Badge variant="outline">{trace.capability ?? "trace"}</Badge>
                <Badge variant="outline">{trace.span_count ?? roots.length} spans</Badge>
              </div>
              {roots.map((root) => (
                <TraceNodeView key={root.id} node={root} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
