import { createHash } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Convert a newly-detected worksheet into the canonical V2
 * TriggerEvent shape that `services/triggers/dispatch.ts` consumes.
 *
 * Event ID format:
 *   `${spreadsheetId}:new_worksheet:${sheetId}:${nameHash}`
 *
 * The `sheetId` participation makes the eventId stable across
 * notifications for the same logical worksheet — Sheets fires
 * multiple watch notifications for the same workbook change, and
 * the dispatcher dedups via `(provider, eventId)`. The `nameHash`
 * participation distinguishes a true rename (sheetId unchanged, name
 * different) from re-fire of the same name — workflow authors that
 * care about each (sheetId, name) pair see them as distinct events.
 *
 * Delete-then-re-create of a sheet with the same name fires fresh
 * because Sheets assigns a new sheetId per creation — the eventId
 * differs from the prior delete/create cycle.
 *
 * Payload mirrors V1's documented `new_worksheet` output shape +
 * the bounded Sheets sheet-properties subset (sheetId, title,
 * index, sheetType). Avoids leaking raw Google `sheets[].properties`
 * spread.
 */

export interface NormalizeNewWorksheetInput {
  /** Numeric sheetId from `spreadsheets.get`. Sheets assigns this
   * per-worksheet on creation; stable across renames within the
   * same workbook. */
  sheetId: number;
  /** Current worksheet title. */
  worksheetName: string;
  /** Workbook position (0-indexed). May be undefined when the
   * sheets API omits it; payload tolerates null. */
  index: number | null;
  /** `GRID` / `OBJECT` per Sheets API. Optional in payload. */
  sheetType: string | null;
  /** ISO 8601 timestamp the notification was received at. */
  occurredAt: string;
}

export interface NormalizeNewWorksheetContext {
  providerAccountId: string;
  spreadsheetId: string;
}

function nameHash(name: string): string {
  return createHash("sha256")
    .update(JSON.stringify(name))
    .digest("hex")
    .slice(0, 12);
}

export function normalize(
  input: NormalizeNewWorksheetInput,
  context: NormalizeNewWorksheetContext,
): TriggerEvent {
  const eventId = `${context.spreadsheetId}:new_worksheet:${input.sheetId}:${nameHash(input.worksheetName)}`;

  return {
    provider: "google-sheets",
    eventType: "new_worksheet",
    eventId,
    occurredAt: input.occurredAt,
    providerAccountId: context.providerAccountId,
    payload: {
      changeKind: "added" as const,
      spreadsheetId: context.spreadsheetId,
      worksheetId: input.sheetId,
      worksheetName: input.worksheetName,
      index: input.index,
      sheetType: input.sheetType,
    },
  };
}
