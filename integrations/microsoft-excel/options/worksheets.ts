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
import { worksheetsList } from "@/integrations/microsoft-excel/api/worksheetsList";

/**
 * `microsoft-excel:worksheets` options resolver — Slice 4.EXCEL-META-2.
 *
 * Backs the `worksheetName` field on the worksheet-targeted actions
 * (`add_row`, `delete_row`, `update_row`, `export_sheet`,
 * `rename_worksheet`, `delete_worksheet`, `get_worksheets`) and the
 * `new_row` / `updated_row` / `new_worksheet` triggers.
 *
 * **Dep name `workbookId` is pinned verbatim** to the Excel runtime Zod
 * schemas (camelCase, NOT snake_case). Future ActionMeta/TriggerMeta wire
 * `dependsOn: "workbookId"` to this exact name.
 *
 * **`value` is the worksheet NAME, not its id** — the runtime handlers
 * address worksheets by name (`worksheetName`), and Excel enforces unique
 * sheet names within a workbook, so the name is a safe stable key.
 *
 * Architecture mirrors `microsoft-onenote:sections`:
 *   - `requiresIntegration: true`; `requiredDeps: ["workbookId"]` (route
 *     short-circuits `MISSING_DEPENDENCY` before dispatch; the in-resolver
 *     guard covers direct invocations).
 *   - Wrapper via `refreshAndRetry({provider: "microsoft-excel",
 *     providerAccountId: ctx.integration.providerAccountId})`.
 *
 * `worksheetsList` returns a bare array (Graph `value[]`; no pagination),
 * so `hasMore` is always `false`. Worksheet lists are small.
 *
 * Cascade fallback: if the parent `workbookId` was deleted between picker
 * mounts the wrapper throws `NotFoundError` → return empty `items` (NOT a
 * thrown error), mirroring `microsoft-onenote:sections`. Re-picking the
 * workbook clears `worksheetName` and refetches under the new parent.
 *
 * Error sanitization mirrors the OneNote template — no token / raw Graph
 * body / cell content ever reaches the browser.
 */

export const microsoftExcelWorksheetsResolver: OptionsResolver = {
  source: "microsoft-excel:worksheets",
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

    let worksheets;
    try {
      worksheets = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-excel",
        providerAccountId,
        apiCall: (accessToken) => worksheetsList({ accessToken, workbookId }),
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
        // Parent workbook id no longer exists — empty picker, not an error.
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Excel worksheets. Try again.",
      );
    }

    const items: Array<{ value: string; label: string }> = [];
    for (const ws of worksheets) {
      if (typeof ws.name !== "string" || ws.name.length === 0) continue;
      items.push({ value: ws.name, label: ws.name });
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
