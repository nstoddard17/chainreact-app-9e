import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { listSpreadsheets } from "../api/listSpreadsheets";

/**
 * `google-sheets:spreadsheets` options resolver — Slice 3.GSHEETS-2.
 *
 * Backs the `spreadsheetId` field across the 12 Google Sheets actions
 * + 2 triggers documented in the GSHEETS-1 plan §4. Enumerates the
 * connected user's Google Sheets spreadsheets via Drive's
 * `files.list?q=mimeType='application/vnd.google-apps.spreadsheet'`.
 *
 * Architecture:
 *   - `requiresIntegration: true` — the route loads an active
 *     google-sheets integration row before invocation and short-
 *     circuits with `INTEGRATION_DISCONNECTED` if no row exists.
 *   - No `requiredDeps` — spreadsheets are account-scoped; the picker
 *     opens against the connected Drive.
 *   - The wrapper goes through `refreshAndRetry` so a stale access
 *     token triggers exactly one refresh + retry cycle. Slack's
 *     channels resolver doesn't need this because Slack bot tokens
 *     don't expire by default; Google tokens DO expire (default 1h)
 *     so the refresh path is the production-safe choice. The cost is
 *     one extra integration-row lookup (refreshAndRetry does its own
 *     fetch) — negligible.
 *
 * Mapping (Drive file → OptionItem):
 *   - `value`: Drive file id (the spreadsheetId).
 *   - `label`: file name. Drive guarantees a string `name` on
 *     spreadsheet-mimeType files; defensive null-check stays in the
 *     wrapper.
 *   - `description`: `modifiedTime` formatted as "Modified
 *     YYYY-MM-DD" (date only — not minute-precision, which would feel
 *     stale by the time the user reads the picker). Omitted when
 *     Drive doesn't return a modifiedTime.
 *
 * Client-side `q` filter mirrors the Slack channels resolver: Drive's
 * `files.list?q=` is the API-side filter, but Drive's syntax is
 * different from "substring match a name" and adding it would force
 * the resolver to round-trip a new search query for every keystroke.
 * Single-page 200-item filter happens client-side, same as Slack.
 *
 * Error sanitization:
 *   - `IntegrationActionRequiredError` from refreshAndRetry (refresh
 *     failed OR refresh-not-supported, neither of which should hit
 *     Google in production) → `INTEGRATION_DISCONNECTED` with a
 *     reconnect prompt.
 *   - Any other thrown error from the wrapper (generic Error from a
 *     non-401 4xx/5xx, network failure, decode failure) →
 *     `PROVIDER_ERROR` with a sanitized message. The raw Drive error
 *     body is dropped from the user-visible string.
 *   - Never logs the access token, never echoes raw Drive response
 *     bodies.
 */

function formatDescription(modifiedTime: string | undefined): string | undefined {
  if (!modifiedTime) return undefined;
  // Take only the date portion of the ISO 8601 timestamp. Defensive
  // against non-ISO strings — if the prefix doesn't parse as a date,
  // skip the description entirely rather than surface gibberish.
  const datePart = modifiedTime.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return undefined;
  return `Modified ${datePart}`;
}

export const googleSheetsSpreadsheetsResolver: OptionsResolver = {
  source: "google-sheets:spreadsheets",
  provider: "google-sheets",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      // The route guards against this — `requiresIntegration: true`
      // resolvers receive a non-null integration record OR the route
      // short-circuits with INTEGRATION_DISCONNECTED before dispatch.
      // Defensive throw classified the same way the route would.
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Google Sheets integration. Connect Google Sheets first.",
      );
    }

    const integration = ctx.integration;

    let page;
    try {
      page = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "google-sheets",
        providerAccountId: null,
        apiCall: (accessToken) => listSpreadsheets({ accessToken }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Google Sheets and try again.",
        );
      }
      if (err instanceof Unauthorized401Error) {
        // Defensive — refreshAndRetry should swallow + retry 401s.
        // Surface this path as INTEGRATION_DISCONNECTED so the
        // builder shows a reconnect affordance.
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Google Sheets and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Google Sheets. Try again.",
      );
    }

    const items = page.spreadsheets.map((sheet) => {
      const description = formatDescription(sheet.modifiedTime);
      return description !== undefined
        ? { value: sheet.id, label: sheet.name, description }
        : { value: sheet.id, label: sheet.name };
    });

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return {
      items: filtered,
      hasMore: page.hasMore,
    };
  },
};
