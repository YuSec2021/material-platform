import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, ChevronRight, GitBranch, RefreshCcw, Search, X } from "lucide-react";
import { apiClient, ApiError, type TraceSpan, type TraceSummary } from "@/app/api/client";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/app/components/ui/utils";

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

function traceStartValue(trace: TraceSummary): string {
  const value = trace.start_time ?? trace.started_at ?? trace.created_at;
  return typeof value === "string" ? value : "";
}

function traceStartMs(trace: TraceSummary): number {
  const value = traceStartValue(trace);
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function traceDateValue(trace: TraceSummary): string {
  return traceStartValue(trace).slice(0, 10);
}

function formatTraceStart(trace: TraceSummary): string {
  const value = traceStartValue(trace);
  if (!value) {
    return "Unknown start time";
  }
  const date = value.slice(0, 10);
  const time = value.includes("T") ? value.split("T")[1]?.slice(0, 8) : "";
  return time ? `${date} ${time}` : date;
}

function filterByDateRange(trace: TraceSummary, startDate: string, endDate: string): boolean {
  const date = traceDateValue(trace);
  if (!date) {
    return !startDate && !endDate;
  }
  if (startDate && date < startDate) {
    return false;
  }
  if (endDate && date > endDate) {
    return false;
  }
  return true;
}

function TraceNodeView({ node, depth = 0 }: { node: TraceNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const indentClass = depth === 0 ? "" : depth === 1 ? "ml-5" : depth === 2 ? "ml-10" : "ml-14";
  const statusClass =
    node.status === "error"
      ? "border-destructive/40 bg-destructive/10 text-foreground"
      : "border-emerald-500/40 bg-emerald-500/10 text-foreground";

  return (
    <div className={indentClass}>
      <div className="mb-2 rounded-md border border-border bg-card p-3 text-card-foreground shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {hasChildren ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={`${expanded ? "Collapse" : "Expand"} span ${node.name}`}
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
            </button>
          ) : (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
              <GitBranch className="h-4 w-4" />
            </span>
          )}
          <span className="font-mono text-xs text-muted-foreground">{node.id}</span>
          <span className="text-sm font-medium text-foreground">{node.name}</span>
          <Badge variant="outline">{node.type}</Badge>
          <Badge variant="outline" className={statusClass}>
            {node.status}
          </Badge>
          <span className="text-xs text-muted-foreground">{node.durationMs} ms</span>
          {hasChildren && (
            <span className="ml-2 text-xs text-muted-foreground">
              {node.children.length} child{node.children.length > 1 ? "ren" : ""}
            </span>
          )}
        </div>
      </div>
      {expanded && hasChildren && (
        <div className="mt-1">
          {node.children.map((child) => (
            <TraceNodeView key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TraceDebugPage() {
  const [selectedTraceId, setSelectedTraceId] = useState("");
  const [startDateDraft, setStartDateDraft] = useState("");
  const [endDateDraft, setEndDateDraft] = useState("");
  const [dateFilter, setDateFilter] = useState({ start: "", end: "" });

  const traceQuery = useQuery({
    queryKey: ["debug-trace"],
    queryFn: apiClient.debugTrace,
    retry: false,
  });

  const sortedTraces = useMemo(
    () =>
      [...(traceQuery.data ?? [])].sort((a, b) => {
        const startDiff = traceStartMs(b) - traceStartMs(a);
        return startDiff || b.trace_id.localeCompare(a.trace_id);
      }),
    [traceQuery.data],
  );

  const filteredTraces = useMemo(
    () => sortedTraces.filter((trace) => filterByDateRange(trace, dateFilter.start, dateFilter.end)),
    [dateFilter.end, dateFilter.start, sortedTraces],
  );

  const selectedTraceSummary =
    filteredTraces.find((trace) => trace.trace_id === selectedTraceId) ?? filteredTraces[0] ?? null;

  const detailQuery = useQuery({
    queryKey: ["debug-trace-detail", selectedTraceSummary?.trace_id ?? ""],
    queryFn: () => apiClient.debugTraceDetail(selectedTraceSummary?.trace_id ?? ""),
    enabled: Boolean(selectedTraceSummary?.trace_id),
    retry: false,
  });

  const blocked = traceQuery.error instanceof ApiError && traceQuery.error.status === 403;
  const selectedTrace = useMemo(() => {
    if (!selectedTraceSummary) {
      return null;
    }
    if (detailQuery.data?.trace_id !== selectedTraceSummary.trace_id) {
      return selectedTraceSummary;
    }
    return {
      ...selectedTraceSummary,
      spans: detailQuery.data.spans,
      storage_table: detailQuery.data.storage_table,
    };
  }, [detailQuery.data, selectedTraceSummary]);

  const selectedRoots = useMemo(() => (selectedTrace ? traceRoots(selectedTrace) : []), [selectedTrace]);
  const hasActiveDateFilter = Boolean(dateFilter.start || dateFilter.end);

  function applyDateFilter() {
    setDateFilter({ start: startDateDraft, end: endDateDraft });
  }

  function clearDateFilter() {
    setStartDateDraft("");
    setEndDateDraft("");
    setDateFilter({ start: "", end: "" });
  }

  function refreshTraces() {
    void traceQuery.refetch();
    if (selectedTraceSummary?.trace_id) {
      void detailQuery.refetch();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl font-semibold text-foreground">AI 链路追踪</h1>
          <p className="text-sm text-muted-foreground">调试模式下展示 trace id、span 类型、状态和耗时。</p>
        </div>
        <Button type="button" variant="outline" onClick={refreshTraces}>
          <RefreshCcw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      {traceQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]" aria-label="AI trace loading">
          <div className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="mb-4 h-9 w-full" />
            <Skeleton className="mb-3 h-20 w-full" />
            <Skeleton className="mb-3 h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="mb-4 h-8 w-2/3" />
            <Skeleton className="mb-3 h-16 w-full" />
            <Skeleton className="h-16 w-11/12" />
          </div>
        </div>
      ) : blocked ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-foreground">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
            Debug trace is disabled
          </div>
          <p>当前环境未启用 AI_DEBUG，span 数据不会暴露。</p>
        </div>
      ) : traceQuery.isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6">
          <p className="mb-4 text-sm font-medium text-foreground">AI trace 加载失败。</p>
          <Button type="button" variant="outline" onClick={refreshTraces}>
            <RefreshCcw className="h-4 w-4" />
            重试
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
          <section
            aria-label="Trace list panel"
            className="min-h-[540px] rounded-lg border border-border bg-card text-card-foreground shadow-sm"
          >
            <div className="border-b border-border p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Trace 列表</h2>
                  <p className="text-xs text-muted-foreground">按开始时间倒序显示</p>
                </div>
                <Badge variant="outline">{filteredTraces.length} traces</Badge>
              </div>

              <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  日期范围
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>开始日期 / Start date</span>
                    <input
                      type="date"
                      value={startDateDraft}
                      onChange={(event) => setStartDateDraft(event.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>结束日期 / End date</span>
                    <input
                      type="date"
                      value={endDateDraft}
                      onChange={(event) => setEndDateDraft(event.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={applyDateFilter}>
                    <Search className="h-4 w-4" />
                    应用
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={clearDateFilter}>
                    <X className="h-4 w-4" />
                    清除
                  </Button>
                </div>
                {hasActiveDateFilter && (
                  <p className="text-xs text-muted-foreground">
                    当前筛选：{dateFilter.start || "最早"} 至 {dateFilter.end || "最新"}
                  </p>
                )}
              </div>
            </div>

            {filteredTraces.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">暂无 trace span</div>
            ) : (
              <div className="max-h-[620px] space-y-2 overflow-y-auto p-3">
                {filteredTraces.map((trace) => {
                  const selected = selectedTraceSummary?.trace_id === trace.trace_id;
                  return (
                    <button
                      key={trace.trace_id}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Select trace ${trace.trace_id}`}
                      onClick={() => setSelectedTraceId(trace.trace_id)}
                      className={cn(
                        "w-full rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        selected
                          ? "border-primary/60 bg-primary/10 text-foreground"
                          : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <span className="break-all font-mono text-xs text-foreground">{trace.trace_id}</span>
                        <Badge variant="outline">{trace.capability ?? "trace"}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatTraceStart(trace)}</span>
                        <span>{trace.span_count ?? 0} spans</span>
                        <span>{Number(trace.duration_ms ?? 0)} ms</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section
            aria-label="Span detail panel"
            className="min-h-[540px] rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm"
          >
            {selectedTrace ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h2 className="mb-2 text-base font-semibold text-foreground">Span 详情</h2>
                    <p className="break-all font-mono text-sm text-foreground">{selectedTrace.trace_id}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatTraceStart(selectedTrace)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{selectedTrace.capability ?? "trace"}</Badge>
                    <Badge variant="outline">{selectedTrace.span_count ?? selectedRoots.length} spans</Badge>
                    <Badge variant="outline">{selectedTrace.status ?? "ok"}</Badge>
                  </div>
                </div>

                {detailQuery.isLoading ? (
                  <div className="space-y-3" aria-label="Trace detail loading">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-11/12" />
                  </div>
                ) : selectedRoots.length === 0 ? (
                  <div className="rounded-md border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                    该 trace 暂无 span 明细
                  </div>
                ) : (
                  <div className="space-y-2" role="tree" aria-label={`Span tree for ${selectedTrace.trace_id}`}>
                    {selectedRoots.map((root) => (
                      <TraceNodeView key={root.id} node={root} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-[500px] items-center justify-center rounded-md border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                请选择左侧 trace 查看 span 树
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
