"use client";

/**
 * 5.DUAL-BUILDER-1 CS-7 — Document Builder product telemetry SEAM.
 *
 * ChainReactV2 has no client-side product-analytics vendor/client (the only
 * "analytics" is the Google-Analytics PROVIDER + workflow analytics dashboards).
 * Per the CS-7 contract we do NOT invent one: no vendor SDK, no new API route, no
 * new DB table, no dependency, no network. This module is a thin, dependency-free
 * EMIT SEAM with a no-op default sink. At exposure time the owner registers a
 * sink (`setDocumentBuilderTelemetrySink`) that forwards to whatever product-
 * analytics infrastructure is chosen; until then every emit is a safe no-op.
 *
 * Hard safety guarantees (enforced here + locked by tests):
 *  - Events fire ONLY while the Document Builder flag is enabled
 *    (`setDocumentBuilderTelemetryEnabled`). Flag OFF ⇒ zero events.
 *  - Properties are bounded CATEGORICAL / COUNT data only. The sanitizer keeps a
 *    fixed allow-list of keys, and only short lowercase tokens / small integer
 *    buckets / booleans pass. Workflow names, prompts, field values, route
 *    labels, section titles, node ids, provider payloads — anything with spaces,
 *    mixed case, punctuation, or length — are DROPPED, not sent.
 *  - Emitting NEVER throws into the UI: the sink is called inside try/catch, so
 *    an analytics failure can never block editing.
 */

/** The bounded set of Document Builder events for the exposure decision. */
export type DocumentBuilderEventName =
  | "document_builder_view_opened"
  | "builder_view_switched"
  | "document_empty_react_started"
  | "document_manual_start"
  | "document_guided_stop_completed"
  | "document_finish_setup_started"
  | "document_finish_setup_completed"
  | "document_map_opened"
  | "document_insert_used"
  | "document_agent_preview_applied"
  | "document_agent_preview_rejected"
  | "document_visual_handoff"
  | "document_complex_region_seen";

/** Allowed property keys — categorical/count only. No id/name/text/value keys. */
const ALLOWED_PROP_KEYS = new Set([
  "source", // view source: "toggle" | "pref" | "empty" | "bar" | "insert"
  "to", // switched-to view: "visual" | "document"
  "kind", // insert kind: "step" | "branch" | "section" | "ask_react"
  "tier", // complex-region tier: "b" | "c"
  "reason", // bounded refusal/handoff code
  "supported", // supported tier token
  "node_bucket", // node-count bucket (small integer)
  "depth_bucket", // branch-depth bucket (small integer)
  "count", // small bounded count
]);

/** A short lowercase categorical token — deliberately excludes spaces/case/punct. */
const CATEGORICAL_TOKEN = /^[a-z0-9_-]{1,32}$/;

export type DocumentBuilderEventProps = Readonly<Record<string, string | number | boolean>>;

/**
 * Keep only allow-listed keys whose values are safe categorical/count data.
 * Pure + exported so tests can prove no content-bearing property survives.
 */
export function sanitizeTelemetryProps(
  props: Readonly<Record<string, unknown>> | undefined,
): DocumentBuilderEventProps {
  if (!props) return {};
  const out: Record<string, string | number | boolean> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(props)) {
    if (kept >= 8) break; // hard cap on cardinality
    if (!ALLOWED_PROP_KEYS.has(key)) continue;
    if (typeof value === "boolean") {
      out[key] = value;
      kept++;
    } else if (typeof value === "number") {
      // Only finite, non-negative, bounded integer buckets/counts.
      if (Number.isInteger(value) && value >= 0 && value <= 10_000) {
        out[key] = value;
        kept++;
      }
    } else if (typeof value === "string") {
      if (CATEGORICAL_TOKEN.test(value)) {
        out[key] = value;
        kept++;
      }
    }
    // Everything else (objects, arrays, long/mixed strings) is dropped.
  }
  return out;
}

/** The sink signature. Owner-provided at exposure time; default is a no-op. */
export type DocumentBuilderTelemetrySink = (
  name: DocumentBuilderEventName,
  props: DocumentBuilderEventProps,
) => void;

let sink: DocumentBuilderTelemetrySink | null = null;
let enabled = false;

/**
 * Gate emission on the Document Builder flag. WorkflowBuilder calls this with the
 * server-resolved `documentBuilderEnabled` so flag OFF emits nothing — even if a
 * component tried to emit.
 */
export function setDocumentBuilderTelemetryEnabled(value: boolean): void {
  enabled = value;
}

/** Register (or clear) the product-analytics sink. No sink ⇒ every emit no-ops. */
export function setDocumentBuilderTelemetrySink(
  next: DocumentBuilderTelemetrySink | null,
): void {
  sink = next;
}

/**
 * Emit a Document Builder event. No-op unless the flag is enabled AND a sink is
 * registered. Sanitizes props to bounded categorical/count data and never throws
 * into the caller.
 */
export function emitDocumentBuilderEvent(
  name: DocumentBuilderEventName,
  props?: Readonly<Record<string, unknown>>,
): void {
  if (!enabled || sink === null) return;
  const safe = sanitizeTelemetryProps(props);
  try {
    sink(name, safe);
  } catch {
    // Analytics failure must never block editing.
  }
}

/** Bucket a node count into a coarse categorical bucket (never the raw count). */
export function nodeCountBucket(count: number): number {
  if (count <= 0) return 0;
  if (count <= 5) return 5;
  if (count <= 10) return 10;
  if (count <= 30) return 30;
  if (count <= 100) return 100;
  return 101;
}
