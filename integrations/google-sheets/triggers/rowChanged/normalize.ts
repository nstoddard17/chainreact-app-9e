import { createHash } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Convert a single Sheets row diff entry into the canonical V2
 * TriggerEvent shape that `services/triggers/dispatch.ts` consumes.
 *
 * Slice 5 baseline shipped `changeKind: "added"` only with the
 * count-delta fast path. Sheets 2.3 Commit 3 extends this with
 * `"updated"` + `"removed"` variants emitted by the snapshot-diff
 * path.
 *
 * Event ID format — D-EventId accepted decision:
 *   - **Legacy added-only path** (`useLegacyEventId: true`): the
 *     Slice 5 format `${spreadsheetId}:${sheetName}:${rowIndex}:${hash}`.
 *     Used by `pull.ts`'s count-delta fast path when changeKinds is
 *     the default `["added"]`. Preserves backwards-compat with
 *     existing `webhook_event_dedup` rows.
 *   - **Extended changeKinds path** (`useLegacyEventId: false`):
 *     `${spreadsheetId}:${sheetName}:${changeKind}:${key}:${hash}` —
 *     the changeKind infix prevents an `updated` event for row N
 *     colliding with a hypothetical prior `added` for that row, and
 *     a `removed` for row N colliding with `added`/`updated`. The
 *     hash component is the POST-CHANGE row hash for added/updated,
 *     OR the LAST-KNOWN pre-removal hash for removed (preserves
 *     natural dedup if Sheets fires the same removal twice).
 *
 * Payload extensions (vs Slice 5):
 *   - `rowKey`: snapshot-mode key — positional row number as string
 *     OR keyColumn value coerced to string. Mirrors the snapshot
 *     identity model.
 *   - `keyColumn` / `keyValue`: populated only in keyColumn mode.
 *   - `rowValues`: current values for added/updated; null for
 *     removed (the row no longer exists at pull time).
 *   - `previousValues`: always `null` per D-PreviousValues — V2 does
 *     NOT store prior values; the field is reserved for forward
 *     compatibility if a future slice adds value-storage at the
 *     cost of doubling snapshot size.
 */

export type SheetsChangeKind = "added" | "updated" | "removed";

export interface NormalizeContext {
  accountId: string;
  spreadsheetId: string;
  sheetName: string;
  /** When set, surfaced as `headers` in the payload. Independent of
   * `changeKind` — readers may still want column-name semantics on a
   * removed event. */
  headers: ReadonlyArray<unknown> | null;
  /** keyColumn config echo. Null in positional mode. */
  keyColumn?: string | null;
}

export interface NormalizeRowInput {
  /** 1-indexed row number in the spreadsheet (matches what users
   * see). Null for `removed` events because the row no longer
   * exists at pull time. */
  rowIndex: number | null;
  /** Current row values. Null for `removed` events. */
  rowValues: ReadonlyArray<unknown> | null;
  /** Snapshot key — positional row number as string OR keyColumn
   * value coerced to string. For Slice 5 legacy callers the
   * rowIndex doubles as the key. */
  rowKey?: string;
  /** sha256 hex of the current row values for added/updated, OR the
   * pre-removal hash for removed. The 12-char prefix is taken inside
   * normalize for the eventId — pass the FULL hash. */
  rowHash?: string;
  /** ISO 8601 timestamp the notification was received at. */
  occurredAt: string;
}

export interface NormalizeOptions {
  /** When true (default), use the Slice 5 legacy eventId format
   * (no changeKind infix). Set false in snapshot-diff mode. */
  useLegacyEventId?: boolean;
}

/** Local SHA-256 hash for callers that pass `rowValues` without a
 * precomputed hash. Matches `_shared/snapshot.ts:hashRow` so the
 * dedup key aligns between the count-delta fast path and the
 * snapshot-diff path. */
function rowValuesHash(values: ReadonlyArray<unknown>): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

/**
 * Build a TriggerEvent for the given changeKind. The dispatcher
 * dedupes by `(provider, eventId)` so the eventId must be
 * deterministic for the (row, change) pair.
 */
export function normalize(
  row: NormalizeRowInput,
  context: NormalizeContext,
  changeKind: SheetsChangeKind = "added",
  options: NormalizeOptions = {},
): TriggerEvent {
  const useLegacyEventId = options.useLegacyEventId !== false;

  // Resolve the snapshot key. For legacy callers (Slice 5 fast path)
  // who don't pass `rowKey`, use rowIndex as the key. For removed
  // events `rowIndex` may be null; rowKey is then required.
  const key = row.rowKey ?? (row.rowIndex !== null ? String(row.rowIndex) : "");

  // Resolve the hash component. For legacy added-only callers we
  // compute it from rowValues. For removed events the caller MUST
  // pass the prior hash (the row's values are gone).
  const hashFull =
    row.rowHash ??
    (row.rowValues !== null
      ? rowValuesHash(row.rowValues)
      : (() => {
          throw new Error(
            "normalize: rowHash is required when rowValues is null (removed events).",
          );
        })());
  const hashShort = hashFull.slice(0, 12);

  const eventId = useLegacyEventId
    ? `${context.spreadsheetId}:${context.sheetName}:${key}:${hashShort}`
    : `${context.spreadsheetId}:${context.sheetName}:${changeKind}:${key}:${hashShort}`;

  const keyColumn = context.keyColumn ?? null;
  const isKeyColumnMode = keyColumn !== null;

  return {
    provider: "google-sheets",
    eventType: "row_changed",
    eventId,
    occurredAt: row.occurredAt,
    providerAccountId: context.accountId,
    payload: {
      changeKind,
      spreadsheetId: context.spreadsheetId,
      sheetName: context.sheetName,
      // 1-indexed sheet row number where the row currently lives.
      // Null for `removed` events (the row no longer exists).
      rowIndex: row.rowIndex,
      // Snapshot key — same as rowIndex in positional mode, the
      // column value in keyColumn mode. Workflow authors that need
      // stable identity reference `rowKey`.
      rowKey: key,
      keyColumn,
      keyValue: isKeyColumnMode ? key : null,
      rowValues: row.rowValues,
      headers: context.headers,
      // D-PreviousValues: always null. V2 does NOT store prior
      // values; the field is forward-compat reserved.
      previousValues: null,
    },
  };
}
