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
import { tableColumnsList } from "@/integrations/microsoft-excel/api/tableColumnsList";

/**
 * `microsoft-excel:table_columns` options resolver — RESOLVERS-1.
 *
 * Backs the `lookupColumn` picker on `microsoft-excel:find_row`: lists
 * the REAL column headers of the selected Excel table so authors pick a
 * header instead of hand-typing it (manual entry stays available via
 * `allowManualEntry` for variable wiring / unlisted columns).
 *
 * Endpoint: `GET /v1.0/me/drive/items/{workbookId}/workbook/tables/{tableName}/columns`
 * via the existing `api/tableColumnsList.ts` wrapper — the SAME read the
 * `find_row` runtime handler resolves the lookup column against, so
 * "what the picker offers" and "what the handler matches" are the same
 * list by construction.
 * Docs: https://learn.microsoft.com/en-us/graph/api/tablecolumn-list
 *
 *   - `value` / `label` = the column NAME (Excel enforces unique column
 *     names within a table; `find_row.lookupColumn` stores the header
 *     name verbatim).
 *   - `description` omitted — table columns don't carry a stable
 *     absolute sheet letter (a table can start at any cell), and names
 *     are unique so no disambiguation is needed.
 *   - Empty table → empty `items` (honest "no columns detected", NOT an
 *     error).
 *
 * `requiredDeps` are pinned verbatim to the `find_row` runtime Zod
 * schema's camelCase names (`workbookId`, `tableName`).
 *
 * Cascade fallback + error sanitization mirror
 * `microsoft-excel:worksheet_columns`: parent workbook/table deleted →
 * empty items; 401 / action-required → INTEGRATION_DISCONNECTED;
 * anything else → PROVIDER_ERROR with a static message (no tokens, no
 * raw Graph bodies, no cell content).
 *
 * Needs live smoke — coded against the official Graph docs; no live
 * verification was possible in this slice.
 */

export const microsoftExcelTableColumnsResolver: OptionsResolver = {
  source: "microsoft-excel:table_columns",
  provider: "microsoft-excel",
  requiresIntegration: true,
  requiredDeps: ["workbookId", "tableName"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Microsoft Excel integration. Connect Excel first.",
      );
    }

    const integration = ctx.integration;

    const workbookId = ctx.deps.workbookId;
    const tableName = ctx.deps.tableName;
    if (typeof workbookId !== "string" || workbookId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a workbook first.",
      );
    }
    if (typeof tableName !== "string" || tableName.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a table first.",
      );
    }

    let columns;
    try {
      columns = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-excel",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          tableColumnsList({
            accessToken,
            workbookId,
            tableName,
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
        // Parent workbook / table no longer exists — empty picker, not an
        // error (re-picking the parents refetches).
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't read the table's columns. Try again.",
      );
    }

    const seen = new Set<string>();
    const items: Array<{ value: string; label: string }> = [];
    for (const column of columns) {
      if (typeof column.name !== "string") continue;
      const name = column.name.trim();
      if (name.length === 0) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      items.push({ value: name, label: name });
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
