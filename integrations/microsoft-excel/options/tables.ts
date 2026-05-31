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
import { tablesList } from "@/integrations/microsoft-excel/api/tablesList";

/**
 * `microsoft-excel:tables` options resolver — Slice 4.EXCEL-META-2.
 *
 * Backs the `tableName` field on `add_table_row` and the `new_table_row` /
 * `updated_table_row` triggers. Uses the new `tablesList` Graph helper
 * (GET `…/workbook/tables`).
 *
 * **Dep name `workbookId` pinned verbatim** to the Excel runtime schemas
 * (camelCase). **`value` is the table NAME** — handlers address tables by
 * name (`tableName`); Excel table names are unique within a workbook.
 *
 * Architecture mirrors `microsoft-excel:worksheets` / OneNote sections:
 *   - `requiresIntegration: true`; `requiredDeps: ["workbookId"]`.
 *   - Wrapper via `refreshAndRetry({provider: "microsoft-excel",
 *     providerAccountId: ctx.integration.providerAccountId})`.
 *   - `tablesList` returns a bare array → `hasMore: false`.
 *   - Parent workbook gone (`NotFoundError`) → empty items (cascade
 *     fallback, not a thrown error).
 *
 * Error sanitization mirrors the OneNote/worksheets template — no token /
 * raw Graph body / cell content reaches the browser.
 */

export const microsoftExcelTablesResolver: OptionsResolver = {
  source: "microsoft-excel:tables",
  provider: "microsoft-excel",
  requiresIntegration: true,
  requiredDeps: ["workbookId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Microsoft Excel integration. Connect Excel first.",
      );
    }

    const integration = ctx.integration;

    const workbookId = ctx.deps.workbookId;
    if (typeof workbookId !== "string" || workbookId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a workbook first.",
      );
    }

    const providerAccountId = integration.providerAccountId;

    let tables;
    try {
      tables = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-excel",
        providerAccountId,
        apiCall: (accessToken) => tablesList({ accessToken, workbookId }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Microsoft Excel and try again.",
        );
      }
      if (err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Microsoft Excel and try again.",
        );
      }
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Excel tables. Try again.",
      );
    }

    const items: Array<{ value: string; label: string }> = [];
    for (const tbl of tables) {
      if (typeof tbl.name !== "string" || tbl.name.length === 0) continue;
      items.push({ value: tbl.name, label: tbl.name });
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
