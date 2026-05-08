import { createHash } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Convert a single newly-added Sheets row into the canonical V2
 * TriggerEvent shape that `services/triggers/dispatch.ts` consumes.
 *
 * Slice 5 single-trigger model — `row_changed` with payload
 * `changeKind: "added"`. Updated/removed detection is deferred per the
 * Slice 5 plan doc; the trigger's pull only emits added rows in Batch 1.
 *
 * Dedup key (`(provider, eventId)` for `webhook_event_dedup`): combine
 * spreadsheetId + sheetName + 1-indexed rowIndex + a SHA-256 of the row
 * values. Rationale:
 *   - Duplicate notification for the same row addition → identical
 *     spreadsheetId/sheetName/rowIndex/values → identical eventId →
 *     dedup catches it.
 *   - Same rowIndex overwritten with different values later (a
 *     deferred-detection "update") → different value hash → fresh
 *     dedup key. Treated as a separate "added" event in Batch 1's
 *     added-only model. Acceptable trade-off documented in the plan.
 */

export interface NormalizeContext {
  accountId: string;
  spreadsheetId: string;
  sheetName: string;
  /** When set, surfaced as `headers` in the payload. */
  headers: ReadonlyArray<unknown> | null;
}

export interface NormalizeRowInput {
  /** 1-indexed row number in the spreadsheet (matches what users see). */
  rowIndex: number;
  rowValues: ReadonlyArray<unknown>;
  /** ISO 8601 timestamp the notification was received at. */
  occurredAt: string;
}

function rowValuesHash(values: ReadonlyArray<unknown>): string {
  // Stable JSON.stringify is fine here — arrays preserve order, and the
  // values inside are scalars (string|number|bool|null). Drop the hash
  // to 12 hex chars for compact dedup keys.
  return createHash("sha256")
    .update(JSON.stringify(values))
    .digest("hex")
    .slice(0, 12);
}

export function normalize(
  row: NormalizeRowInput,
  context: NormalizeContext,
): TriggerEvent {
  const eventId = `${context.spreadsheetId}:${context.sheetName}:${row.rowIndex}:${rowValuesHash(row.rowValues)}`;

  return {
    provider: "google-sheets",
    eventType: "row_changed",
    eventId,
    occurredAt: row.occurredAt,
    accountId: context.accountId,
    payload: {
      changeKind: "added" as const,
      spreadsheetId: context.spreadsheetId,
      sheetName: context.sheetName,
      // 1-indexed spreadsheet row number — the number the user sees in
      // Google Sheets' row gutter. Slice 5 plan calls this "rowNumber"
      // optionally; we use rowIndex here for consistency with Drive's
      // payload conventions. Both names are fine for forward-compat
      // since nothing downstream pins on the field name yet.
      rowIndex: row.rowIndex,
      rowValues: row.rowValues,
      // Headers are null when headerRow=false or the sheet has no row 1.
      // Workflow authors who want to map columns to header names check
      // `headers !== null` before zipping.
      headers: context.headers,
    },
  };
}
