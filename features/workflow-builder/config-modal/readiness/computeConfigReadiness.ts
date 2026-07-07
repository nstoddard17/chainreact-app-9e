import type { FieldMeta } from "@/contracts/actionMeta";
import { isRequiredValueMissing } from "@/core/workflows/requiredFields";
import { getReadinessAdapter } from "./adapters";
import type { ConfigConnectionInput } from "./connectionInput";

/**
 * Pure per-node config readiness (SPREADSHEET-CONFIG-REDESIGN-1) — the
 * single decision point behind the readiness banner every node config
 * panel shows at the top of its Setup tab.
 *
 * Derivation only — no new validation rules live here:
 *   - "What's still missing" comes from the metadata's `required` flags
 *     via the SAME `isRequiredValueMissing` the builder validation
 *     collector and server execution-readiness use (a required field
 *     with a metadata `defaultValue` is never a gap — mirrors
 *     `missingRequiredFields`).
 *   - "What's invalid" comes from the draft's inline field errors plus
 *     the shell's existing structural Save blockers (json / router
 *     validators) — passed IN as counts, never recomputed here.
 *   - Action/trigger-specific checklists come from small adapters
 *     (`./adapters`) so domain rules (e.g. Excel's "at least one row
 *     value" either-or) live in one declared place instead of fragile
 *     UI-only logic.
 *
 * Copy contract: product language only. Checklist labels are field
 * LABELS (or adapter copy) — never schema keys, renderer names, or
 * serialization words. "Ready" is about the CONFIG being complete; the
 * footer's dirty/saved state is a separate concern and stays untouched.
 */

export interface ReadinessChecklistItem {
  readonly label: string;
  readonly done: boolean;
}

export type ConfigReadinessStatus = "ready" | "incomplete" | "invalid";

export interface ConfigReadiness {
  readonly status: ConfigReadinessStatus;
  /** Banner headline, e.g. "One thing left to fill in" / "Ready to run". */
  readonly headline: string;
  readonly items: readonly ReadinessChecklistItem[];
  /**
   * CONNECTION-AWARE-READINESS-1 — optional call-to-action for a missing /
   * unusable app connection. The Apps page is the canonical connect and
   * reconnect surface (the OAuth callback lands back there too).
   */
  readonly cta?: { readonly label: string; readonly href: string };
}

export interface ComputeConfigReadinessInput {
  /** `provider:type` key — used to look up a checklist adapter. */
  readonly metaKey: string;
  readonly nodeKind: "action" | "trigger";
  readonly fields: readonly FieldMeta[];
  readonly values: Readonly<Record<string, unknown>>;
  /** Draft inline errors keyed by field name (undefined entries ignored). */
  readonly errors?: Readonly<Record<string, string | undefined>>;
  /**
   * Number of fields currently blocked by the shell's structural Save
   * validators (advanced JSON shape, router routes). The shell already
   * computes these to gate Save; the banner reuses the outcome.
   */
  readonly blockedFieldCount?: number;
  /**
   * CONNECTION-AWARE-READINESS-1 — the node's app-connection state, mapped
   * from the SERVER-resolved signal by `connectionInputForProvider`.
   * Omitted or `not-required` (native/logic nodes) keeps field-only
   * readiness. Any other non-`connected` value blocks "Ready to run":
   * priority is blocking errors > connection > missing fields > ready.
   * Saving a draft is NOT gated here — the footer/Save flow is untouched.
   */
  readonly connection?: ConfigConnectionInput;
}

export function computeConfigReadiness(
  input: ComputeConfigReadinessInput,
): ConfigReadiness {
  const { metaKey, nodeKind, fields, values, errors, blockedFieldCount, connection } =
    input;

  const conn =
    connection !== undefined && connection.status !== "not-required"
      ? connection
      : null;

  const fieldItems = (() => {
    const adapter = getReadinessAdapter(metaKey);
    return adapter ? adapter({ fields, values }) : genericChecklist(fields, values);
  })();
  const items = [...connectionChecklist(conn), ...fieldItems];

  const inlineErrorCount = Object.values(errors ?? {}).filter(
    (message) => typeof message === "string" && message.length > 0,
  ).length;
  const invalidCount = inlineErrorCount + (blockedFieldCount ?? 0);

  if (invalidCount > 0) {
    return {
      status: "invalid",
      headline:
        invalidCount === 1
          ? "Fix one field before saving"
          : `Fix ${invalidCount} fields before saving`,
      items,
    };
  }

  // Connection outranks missing fields: a node is never "Ready to run"
  // while its app connection is missing, unusable, or not yet verified.
  if (conn && conn.status !== "connected") {
    return {
      status: "incomplete",
      headline: connectionHeadline(conn, nodeKind),
      items,
      ...connectionCta(conn),
    };
  }

  const missingCount = items.filter((item) => !item.done).length;
  if (missingCount > 0) {
    return {
      status: "incomplete",
      headline:
        missingCount === 1
          ? "One thing left to fill in"
          : `${missingCount} things left to fill in`,
      items,
    };
  }

  return {
    status: "ready",
    headline: nodeKind === "trigger" ? "Ready to activate" : "Ready to run",
    items,
  };
}

/**
 * Connection checklist row. Only definitive states get a row — while the
 * check is still running (or failed) the headline carries the honesty and
 * a guessed "Connect X" row would overstate what we know.
 */
function connectionChecklist(
  conn: ConfigConnectionInput | null,
): ReadinessChecklistItem[] {
  if (!conn) return [];
  const name = conn.providerDisplayName;
  switch (conn.status) {
    case "connected":
      return [{ label: `${name} is connected`, done: true }];
    case "missing":
      return [{ label: `Connect ${name}`, done: false }];
    case "reconnect-required":
    case "attention":
      return [{ label: `Reconnect ${name}`, done: false }];
    default:
      return [];
  }
}

function connectionHeadline(
  conn: ConfigConnectionInput,
  nodeKind: "action" | "trigger",
): string {
  const name = conn.providerDisplayName;
  const goal = nodeKind === "trigger" ? "to activate this trigger" : "to run this step";
  switch (conn.status) {
    case "missing":
      return `Connect ${name} ${goal}`;
    case "reconnect-required":
      return `Reconnect ${name} ${goal}`;
    case "attention":
      return "Connection needs attention";
    case "checking":
      return "Checking connection…";
    default:
      return "Couldn't check the app connection";
  }
}

function connectionCta(
  conn: ConfigConnectionInput,
): { cta: NonNullable<ConfigReadiness["cta"]> } | Record<string, never> {
  const name = conn.providerDisplayName;
  if (conn.status === "missing") {
    return { cta: { label: `Connect ${name}`, href: "/apps" } };
  }
  if (conn.status === "reconnect-required" || conn.status === "attention") {
    return { cta: { label: `Reconnect ${name}`, href: "/apps" } };
  }
  return {};
}

/**
 * Generic checklist: one row per required metadata field (labels only —
 * never field names). Required fields with a metadata `defaultValue` are
 * always satisfiable and never listed (mirrors `missingRequiredFields`).
 */
function genericChecklist(
  fields: readonly FieldMeta[],
  values: Readonly<Record<string, unknown>>,
): ReadinessChecklistItem[] {
  return fields
    .filter((f) => f.required && f.defaultValue === undefined)
    .map((f) => ({
      label: `Fill in ${f.label}`,
      done: !isRequiredValueMissing(values[f.name]),
    }));
}
