/**
 * Write smoke harness deps — Google Sheets cell-FORMAT read-back.
 *
 * Backs the `format_range` write-smoke verify: no user-facing Sheets action reads
 * cell formatting (`get_cell_value` / `read_rows` use `values.get`, values only),
 * so this bounded smoke-only reader independently confirms a format landed.
 *
 * SAFETY (seam-refresh-guard invariants — see context.ts):
 *   - the provider HTTP call (`cellFormatGet`) runs inside a `refreshAndRetry`
 *     apiCall lambda — refresh-safe, never a raw `decryptToken(...)`;
 *   - bounded: reads ONLY the smoke spreadsheet + the single cell named in `range`,
 *     and `cellFormatGet`'s `fields` mask returns ONLY format booleans + an
 *     alignment enum (no cell values / payload / PII);
 *   - the output is the sanitized `{ bold, italic, horizontalAlignment }` scalar
 *     shape the wrapper returns — nothing else is surfaced.
 *
 * Unlike the calendar/file readers there is no deletion/absence semantics here, so
 * any thrown provider error propagates to the composer's outer catch -> a sanitized
 * VERIFY_FAILED (a permission/API failure can never read as a passing format).
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { cellFormatGet } from "@/integrations/google-sheets/api/cellFormatGet";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

/**
 * Smoke read-back: `google-sheets:cell_format`. Reads one cell's user-entered
 * format from the smoke spreadsheet. Returns null for any other (provider, action).
 */
export async function sheetsSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "google-sheets" || input.action !== "cell_format") return null;

  const integration = await getActiveForExecution(ctx.accountId, "google-sheets", null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) return { ok: false, output: null, reason: "google-sheets not connected" };

  const spreadsheetId = input.config.spreadsheetId;
  const range = input.config.range;
  if (typeof spreadsheetId !== "string" || spreadsheetId.length === 0) {
    return { ok: false, output: null, reason: "cell_format read-back: missing spreadsheetId" };
  }
  if (typeof range !== "string" || range.length === 0) {
    return { ok: false, output: null, reason: "cell_format read-back: missing range" };
  }

  const format = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "google-sheets",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) => cellFormatGet({ accessToken, spreadsheetId, range }),
  });

  // Bounded + sanitized: only the format scalars the verify reads.
  return {
    ok: true,
    output: {
      bold: format.bold,
      italic: format.italic,
      horizontalAlignment: format.horizontalAlignment,
    },
    reason: null,
  };
}
