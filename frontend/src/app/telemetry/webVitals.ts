import { onCLS, onFID, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

const WEB_VITALS_ENDPOINT = "/api/v1/telemetry/web-vitals";
const SUPPORTED_METRICS = new Set(["LCP", "CLS", "INP", "FID", "TTFB"]);

let registered = false;

function metricPayload(metric: Metric) {
  return {
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
    client_metric_id: metric.id,
    navigation_type: metric.navigationType ?? "",
    url: window.location.href,
    path: window.location.pathname,
    user_agent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  };
}

function postMetric(metric: Metric) {
  if (!SUPPORTED_METRICS.has(metric.name)) {
    return;
  }

  const body = JSON.stringify(metricPayload(metric));
  void fetch(WEB_VITALS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function registerWebVitalsTelemetry() {
  if (registered || typeof window === "undefined") {
    return;
  }

  registered = true;
  onLCP(postMetric);
  onCLS(postMetric);
  onINP(postMetric);
  onFID(postMetric);
  onTTFB(postMetric);
}
