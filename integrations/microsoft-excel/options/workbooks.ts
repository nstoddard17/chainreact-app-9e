import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { workbooksList } from "@/integrations/microsoft-excel/api/workbooksList";

/**
 * `microsoft-excel:workbooks` options resolver — Slice 4.EXCEL-META-2.
 *
 * Top-level Excel picker. Account-scoped (one workbook list per connected
 * user). Backs the `workbookId` field on EVERY Excel action + trigger —
 * this is the cascade root the worksheets / tables resolvers depend on.
 *
 * **Why a resolver is required (not optional polish):** `workbookId` is an
 * opaque Microsoft Graph DriveItem id, NOT a human-typeable value. Without
 * this picker the Excel builder is effectively unusable. (Contrast Shopify,
 * whose ids are typeable from admin URLs — it shipped resolver-free.)
 *
 * Architecture (mirrors `microsoft-onenote:notebooks`):
 *   - `requiresIntegration: true`; no `requiredDeps` (workbooks are
 *     account-scoped).
 *   - Wrapper goes through `refreshAndRetry({provider: "microsoft-excel",
 *     providerAccountId: ctx.integration.providerAccountId})` so a stale Microsoft
 *     v2 access token triggers exactly one refresh + retry cycle.
 *
 * Source: `workbooksList` (drive-root `.xlsx` mime filter). Single page
 * (`top: 100`); `hasMore: result.nextLink !== null` (Graph's authoritative
 * pagination signal). API order is drive-root order (not a meaningful
 * "recent" sort), so we keep Graph order and let the case-insensitive `q`
 * filter narrow by name.
 *
 * Mapping (workbook → OptionItem):
 *   - `value`: `id` (the DriveItem id the handlers/triggers consume as
 *     `workbookId`).
 *   - `label`: `name` when non-empty, else `id` (defensive fallback).
 *   - `description`: `Modified YYYY-MM-DD` from `lastModifiedDateTime`
 *     when ISO-shaped (helps disambiguate similarly-named workbooks).
 *     Workbook NAMES are not secrets (file titles in the user's own drive);
 *     cell CONTENTS are never read here.
 *
 * Error sanitization (mirrors the OneNote template):
 *   - `IntegrationActionRequiredError` / leaked `Unauthorized401Error`
 *     → `INTEGRATION_DISCONNECTED` (reconnect prompt).
 *   - Any other thrown error → `PROVIDER_ERROR` with a static message;
 *     raw Graph bodies / tokens / URLs never reach the browser.
 */

const PAGE_SIZE = 100;

function formatDescription(lastModifiedDateTime: unknown): string | undefined {
  if (
    typeof lastModifiedDateTime !== "string" ||
    lastModifiedDateTime.length === 0
  ) {
    return undefined;
  }
  const datePart = lastModifiedDateTime.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return undefined;
  return `Modified ${datePart}`;
}

export const microsoftExcelWorkbooksResolver: OptionsResolver = {
  source: "microsoft-excel:workbooks",
  provider: "microsoft-excel",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Microsoft Excel integration. Connect Excel first.",
      );
    }

    const integration = ctx.integration;

    const providerAccountId = integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-excel",
        providerAccountId,
        apiCall: (accessToken) =>
          workbooksList({ accessToken, top: PAGE_SIZE }),
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
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Excel workbooks. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> =
      [];
    for (const wb of result.workbooks) {
      if (typeof wb.id !== "string" || wb.id.length === 0) continue;
      const label =
        typeof wb.name === "string" && wb.name.length > 0 ? wb.name : wb.id;
      const description = formatDescription(wb.lastModifiedDateTime);
      items.push(
        description !== undefined
          ? { value: wb.id, label, description }
          : { value: wb.id, label },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return {
      items: filtered,
      hasMore: result.nextLink !== null,
    };
  },
};
