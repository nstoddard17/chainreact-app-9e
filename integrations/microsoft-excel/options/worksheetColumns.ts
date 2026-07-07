import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { worksheetUsedRange } from "@/integrations/microsoft-excel/api/worksheetUsedRange";

/**
 * `microsoft-excel:worksheet_columns` options resolver —
 * SPREADSHEET-CONFIG-REDESIGN-1.
 *
 * Backs the column-aware row editor on `microsoft-excel:add_row`
 * (`spreadsheet-rows` field type): reads the REAL first-row headers of
 * the selected worksheet so the builder can render one input per column
 * instead of asking authors to think in positional arrays / header-keyed
 * records. Never invents columns — an empty result means the UI must say
 * "couldn't detect columns" and offer its manual fallback.
 *
 * Source of truth alignment with the runtime handler (`actions/addRow.ts`
 * `executeBatch`): both read `worksheetUsedRange(valuesOnly=true)` and
 * treat row 1 of the used range as the header row, keeping "what the
 * picker offers" and "what the handler validates batch keys against"
 * the same list by construction.
 *
 *   - `value` / `label` = the header CELL TEXT (batch rows are keyed by
 *     header name; the handler's header→column map uses the same text).
 *   - `description` = the ABSOLUTE column letter ("Column B"), computed
 *     from the used range's start column so labels stay honest even when
 *     content doesn't start at A.
 *   - Blank header cells are skipped; duplicate header names keep the
 *     FIRST occurrence only (the handler's header map would silently
 *     last-win on duplicates — offering one avoids ambiguous keys).
 *   - Empty worksheet / all-blank row 1 → empty `items` (honest
 *     "no columns detected", NOT an error).
 *
 * `requiredDeps` are pinned verbatim to the Excel runtime Zod schema's
 * camelCase names (`workbookId`, `worksheetName`).
 *
 * Cascade fallback + error sanitization mirror
 * `microsoft-excel:worksheets`: parent deleted → empty items; 401 /
 * action-required → INTEGRATION_DISCONNECTED; anything else →
 * PROVIDER_ERROR with a static message (no tokens, no raw Graph bodies,
 * no cell content).
 */

export const microsoftExcelWorksheetColumnsResolver: OptionsResolver = {
  source: "microsoft-excel:worksheet_columns",
  provider: "microsoft-excel",
  requiresIntegration: true,
  requiredDeps: ["workbookId", "worksheetName"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Microsoft Excel integration. Connect Excel first.",
      );
    }

    const integration = ctx.integration;

    const workbookId = ctx.deps.workbookId;
    const worksheetName = ctx.deps.worksheetName;
    if (typeof workbookId !== "string" || workbookId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a workbook first.",
      );
    }
    if (typeof worksheetName !== "string" || worksheetName.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a worksheet first.",
      );
    }

    let used;
    try {
      used = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-excel",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          worksheetUsedRange({
            accessToken,
            workbookId,
            worksheetName,
            valuesOnly: true,
          }),
      });
    } catch (err) {
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Microsoft Excel and try again.",
        );
      }
      if (err instanceof NotFoundError) {
        // Parent workbook / worksheet no longer exists — empty picker,
        // not an error (re-picking the parents refetches).
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't read the worksheet's columns. Try again.",
      );
    }

    const headerRow = used.values?.[0] ?? [];
    const startColumn = startColumnNumber(used.address ?? "");

    const seen = new Set<string>();
    const items: Array<{ value: string; label: string; description: string }> =
      [];
    for (let i = 0; i < headerRow.length; i++) {
      const cell = headerRow[i];
      if (typeof cell !== "string") continue;
      const header = cell.trim();
      if (header.length === 0) continue;
      if (seen.has(header)) continue;
      seen.add(header);
      items.push({
        value: header,
        label: header,
        description: `Column ${columnLetter(startColumn + i)}`,
      });
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};

/**
 * 1-based column number of the used range's FIRST column, parsed from its
 * A1 address (`"Sheet1!B2:D9"` → 2). Unparseable → 1 (assume column A),
 * matching the handler's A-anchored fallback posture.
 */
function startColumnNumber(address: string): number {
  const local = address.includes("!")
    ? address.slice(address.lastIndexOf("!") + 1)
    : address;
  const start = local.includes(":") ? local.slice(0, local.indexOf(":")) : local;
  const match = start.match(/^([A-Za-z]+)\d*$/);
  if (!match) return 1;
  let n = 0;
  for (const ch of match[1]!.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

/** 1-based column number → A1 letter (1 → A, 27 → AA). */
function columnLetter(n: number): string {
  if (n < 1) return "A";
  let result = "";
  let remaining = n;
  while (remaining > 0) {
    const rem = (remaining - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}
