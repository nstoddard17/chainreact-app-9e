import { createHash } from "node:crypto";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { executeQueries } from "../../api/datasets/executeQueries";
import { PowerBiDaxConditionMetConfigSchema } from "../daxConditionMet/schema";
import { PowerBiDaxQueryResultChangedConfigSchema } from "../daxQueryResultChanged/schema";
import {
  emitEvent,
  persistSnapshot,
  warnMissingSnapshot,
  type PowerBiPollInput,
} from "./pollShared";

/**
 * The DAX domain: the two triggers that diff a piece of observable STATE
 * derived from an `executeQueries` result.
 *
 *   - `dax_condition_met`        — edge-triggered boolean over a scalar result.
 *   - `dax_query_result_changed` — content hash over the bounded result rows.
 *
 * The pure helpers (`extractScalar`, `evaluateCondition`, `hashResultRows`)
 * are exported because activation seeds the snapshot with the SAME derived
 * value the poll compares against — if seeding and polling derived it
 * differently, the first tick would fire a phantom event.
 *
 * Shared invariants (mirroring `integrations/microsoft-excel/triggers/_shared`):
 *   - The snapshot MUST already exist (activation seeded it). A missing
 *     snapshot logs + skips — never re-seeds silently, which would swallow
 *     every change made since activation.
 *   - Dedup keys are derived from durable provider state, never from a
 *     timestamp, so two identical ticks produce an identical eventId and
 *     dedup at the engine boundary.
 *   - Payloads carry fixed key sets: no raw provider bodies, no provider
 *     URLs, no error blobs (short error codes only).
 */

// ─── dax_condition_met ───────────────────────────────────────────────────────

export type DaxConditionOperator = "gt" | "gte" | "lt" | "lte" | "eq" | "neq";

/**
 * Extract the single scalar a condition query is contracted to return:
 * the first column of the first row. Returns `null` when the query
 * produced no rows / no columns — treated as "condition not met" rather
 * than an error, since an empty result is a legitimate measure outcome.
 */
export function extractScalar(
  rows: ReadonlyArray<Record<string, unknown>>,
): unknown {
  const first = rows[0];
  if (!first) return null;
  const values = Object.values(first);
  return values.length === 0 ? null : (values[0] ?? null);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Evaluate the author's condition against the scalar.
 *
 * Numeric comparison when BOTH sides parse as finite numbers; otherwise
 * string equality, which supports only `eq` / `neq`. An ordering operator
 * against a non-numeric value is a real misconfiguration (e.g. `gt` on a
 * text measure) and THROWS so the run surfaces the failure — the trigger
 * schema can't catch it because the value only exists at poll time.
 *
 * A null scalar (empty result set) is never "met".
 */
export function evaluateCondition(input: {
  value: unknown;
  operator: DaxConditionOperator;
  threshold: string;
}): boolean {
  const { value, operator, threshold } = input;
  if (value === null || value === undefined) return false;

  const left = asFiniteNumber(value);
  const right = asFiniteNumber(threshold);
  if (left !== null && right !== null) {
    switch (operator) {
      case "gt":
        return left > right;
      case "gte":
        return left >= right;
      case "lt":
        return left < right;
      case "lte":
        return left <= right;
      case "eq":
        return left === right;
      case "neq":
        return left !== right;
    }
  }

  if (operator !== "eq" && operator !== "neq") {
    throw new Error(
      `Power BI dax_condition_met: operator '${operator}' needs a numeric DAX result and a numeric threshold; got a non-numeric value. Use 'eq' or 'neq' for text results.`,
    );
  }
  const equal = String(value) === threshold;
  return operator === "eq" ? equal : !equal;
}

/**
 * EDGE-TRIGGERED: fires only on the false→true transition, so a condition
 * that stays true across ticks fires once and re-arms when it goes false.
 *
 * Dedup key `${operator}:${threshold}:${value}` is deliberately
 * value-derived rather than timestamped: a repeat transition to the SAME
 * value dedups against the previous firing at the engine boundary, while a
 * transition to a different value is a distinct event. Timestamp-keyed ids
 * would defeat dedup entirely (the Asana lesson).
 */
export async function pollDaxConditionMet(
  input: PowerBiPollInput,
): Promise<void> {
  const { trigger, providerAccountId, now } = input;
  const config = PowerBiDaxConditionMetConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    warnMissingSnapshot(trigger, "dax_condition_met");
    return;
  }

  const result = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      executeQueries({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
        ...(config.impersonatedUserName !== undefined
          ? { impersonatedUserName: config.impersonatedUserName }
          : {}),
        daxQuery: config.daxQuery,
      }),
  });

  const value = extractScalar(result.rows);
  const conditionMet = evaluateCondition({
    value,
    operator: config.operator,
    threshold: config.threshold,
  });

  if (conditionMet && !config.snapshot.lastConditionMet) {
    await emitEvent({
      trigger,
      providerAccountId,
      eventType: "dax_condition_met",
      key: `${config.operator}:${config.threshold}:${String(value)}`,
      payload: {
        workspaceId: config.workspaceId,
        semanticModelId: config.semanticModelId,
        value,
        operator: config.operator,
        threshold: config.threshold,
        conditionMet: true,
      },
    });
  }

  await persistSnapshot({
    triggerId: trigger.id,
    config,
    snapshot: { lastConditionMet: conditionMet, updatedAt: new Date().toISOString() },
    now,
  });
}

// ─── dax_query_result_changed ────────────────────────────────────────────────

/**
 * Canonical JSON for a bounded DAX result: rows in provider order, each
 * row's keys sorted so a column-order change in the provider response
 * doesn't masquerade as a data change.
 */
export function hashResultRows(
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  const canonical = rows.map((row) => {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(row).sort()) {
      sorted[key] = row[key];
    }
    return sorted;
  });
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Fires whenever the hash of the BOUNDED result rows changes.
 *
 * The bound is the author's `maxRows`: only the first `maxRows` rows are
 * hashed and emitted, so a change confined to rows beyond the bound does
 * NOT fire. That is the deliberate trade for a payload the engine can
 * carry — `rowCount` / `truncated` tell the author when they're watching a
 * clipped window and should tighten the DAX instead of raising maxRows.
 */
export async function pollDaxQueryResultChanged(
  input: PowerBiPollInput,
): Promise<void> {
  const { trigger, providerAccountId, now } = input;
  const config = PowerBiDaxQueryResultChangedConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    warnMissingSnapshot(trigger, "dax_query_result_changed");
    return;
  }

  const result = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      executeQueries({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
        daxQuery: config.daxQuery,
      }),
  });

  const rows = result.rows.slice(0, config.maxRows);
  const resultHash = hashResultRows(rows);

  if (resultHash !== config.snapshot.resultHash) {
    await emitEvent({
      trigger,
      providerAccountId,
      eventType: "dax_query_result_changed",
      key: resultHash,
      payload: {
        workspaceId: config.workspaceId,
        semanticModelId: config.semanticModelId,
        rows,
        rowCount: result.rows.length,
        truncated: result.rows.length > config.maxRows,
        resultHash,
      },
    });
  }

  await persistSnapshot({
    triggerId: trigger.id,
    config,
    snapshot: { resultHash, updatedAt: new Date().toISOString() },
    now,
  });
}
