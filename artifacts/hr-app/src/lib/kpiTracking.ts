/**
 * Phase 4A KPI tracking helper.
 * Safe no-op if VITE_KPI_ENDPOINT is not set.
 * Use VITE_ENABLE_KPI_DEBUG=true to emit console.debug output in dev.
 * Uses navigator.sendBeacon where available; falls back to keepalive fetch.
 */

type KpiProperties = Record<string, string | number | boolean | null | undefined>;

interface KpiEvent {
  name: string;
  properties?: KpiProperties;
}

const KPI_ENDPOINT = (import.meta.env as Record<string, string | undefined>).VITE_KPI_ENDPOINT?.trim() ?? "";
const DEBUG_ENABLED =
  (import.meta.env as Record<string, string | undefined>).DEV === "true" ||
  (import.meta.env as Record<string, string | undefined>).VITE_ENABLE_KPI_DEBUG === "true";

function sanitizeProperties(props?: KpiProperties): Record<string, string | number | boolean | null> {
  if (!props) return {};
  const result: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
}

function buildPayload(event: KpiEvent) {
  return {
    event: event.name,
    properties: sanitizeProperties(event.properties),
    path: typeof window !== "undefined" ? window.location.pathname : "",
    timestamp: new Date().toISOString(),
  };
}

function emitDebug(payload: ReturnType<typeof buildPayload>) {
  if (!DEBUG_ENABLED) return;
  console.debug("[kpi]", payload.event, payload);
}

function postToSink(payload: ReturnType<typeof buildPayload>) {
  if (!KPI_ENDPOINT) return;

  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(KPI_ENDPOINT, blob);
      return;
    }
  } catch {
    // fall through to fetch
  }

  void fetch(KPI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // KPI tracking must stay non-blocking
  });
}

export function trackKpiEvent(event: KpiEvent) {
  if (typeof window === "undefined") return;

  const payload = buildPayload(event);
  emitDebug(payload);
  postToSink(payload);
}
