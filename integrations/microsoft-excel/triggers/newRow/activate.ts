import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { worksheetUsedRange } from "../../api/worksheetUsedRange";
import { buildSnapshot } from "../_shared/snapshot";
import { ExcelNewRowConfigSchema } from "./schema";

/**
 * Excel `new_row` activation hook.
 *
 * Seeds the row-hash snapshot at activation time, BEFORE the first poll
 * runs. This closes the V1 "first poll miss" bug:
 *   - V1's `MicrosoftGraphTriggerLifecycle.ts:175-212` calls
 *     fetchExcelWorksheetSnapshot() inside a try/catch that SWALLOWS
 *     errors. If snapshot seed fails, the poll handler later guards
 *     with `if (!previousSnapshot) return` and silently never fires.
 *   - V2 fails activation when snapshot seed throws — the orchestrator
 *     wraps as TRIGGER_REGISTRATION_FAILED and surfaces a clear error.
 *
 * For an empty worksheet (no rows), the snapshot is `{ rowHashes: {},
 * rowCount: 0 }`. The first row added by the user thereafter becomes
 * key `"1"` and fires on the next poll tick.
 *
 * For a non-empty worksheet, every existing row is included in the
 * snapshot baseline. Rows added BEFORE activation are NOT replayed —
 * matches the V1 + Gmail polling convention.
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  // Parse the user-supplied trigger config to extract workbookId +
  // worksheetName. The orchestrator hasn't persisted the row yet, so
  // we read from node.config directly.
  const parsed = ExcelNewRowConfigSchema.parse({
    workbookId: (node.config as { workbookId?: string }).workbookId,
    worksheetName: (node.config as { worksheetName?: string }).worksheetName,
  });

  const range = await refreshAndRetry({
    userId: integration.userId,
    provider: "microsoft-excel",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      worksheetUsedRange({
        accessToken,
        workbookId: parsed.workbookId,
        worksheetName: parsed.worksheetName,
        valuesOnly: true,
      }),
  });

  // Detect Graph's "empty worksheet" envelope (1×1 with a single null
  // cell — same heuristic as add_row).
  const allValues = range.values ?? [];
  const isEmpty =
    allValues.length === 0 ||
    (allValues.length === 1 &&
      (allValues[0]?.length ?? 0) === 1 &&
      (allValues[0]![0] === null || allValues[0]![0] === undefined));

  const entries = isEmpty
    ? []
    : allValues.map((row, index) => ({
        // 1-based row index — matches Excel's A1 row numbering.
        key: String(index + 1),
        values: row,
      }));

  const snapshot = buildSnapshot(entries);

  return {
    pollingEnabled: true,
    snapshot,
  };
};
