import {
  InsufficientScopeError,
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { calendarListList } from "@/integrations/google-calendar/api/calendarList";

/**
 * `google-calendar:calendars` options resolver.
 *
 * Backs the `calendarId` field across every Google Calendar action + the
 * event_changed trigger. Lists the user's calendars via `calendarList.list`.
 *
 * Architecture mirrors `google-sheets:spreadsheets`:
 *   - `requiresIntegration: true` — route loads the active Google Calendar
 *     integration row + short-circuits with INTEGRATION_DISCONNECTED if absent.
 *   - No `requiredDeps` — calendars are account-scoped.
 *   - Wrapper goes through `refreshAndRetry` (Google is oauth_with_refresh).
 *
 * Mapping (calendar → OptionItem):
 *   - `value`: the calendar id — exactly what the handler/schema expects for
 *     `calendarId` (e.g. "primary" / "you@gmail.com" / a long group id).
 *   - `label`: `summaryOverride` (the user's rename) ?? `summary` ?? id.
 *   - `description`: "Primary calendar" on the primary entry so it's easy to
 *     spot. No raw payload / access-role internals leaked.
 *   - Deleted entries are dropped.
 *
 * SCOPE / RECONNECT: `calendarList.list` needs the manifest's optional
 * `calendar.calendarlist.readonly` (or a superset — pre-minimization tokens
 * carry `calendar.readonly`, which also works). A token holding neither gets
 * HTTP 403 → `InsufficientScopeError` → `PROVIDER_REAUTH_REQUIRED` (the client
 * renders a Reconnect prompt). Refresh can't fix it — only re-consent grants the
 * new scope. Manual id entry (`allowManualEntry`) keeps the field usable
 * meanwhile.
 */
export const googleCalendarCalendarsResolver: OptionsResolver = {
  source: "google-calendar:calendars",
  provider: "google-calendar",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Google Calendar integration. Connect Google Calendar first.",
      );
    }

    const integration = ctx.integration;

    let page;
    try {
      page = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "google-calendar",
        providerAccountId: null,
        apiCall: (accessToken) => calendarListList({ accessToken }),
      });
    } catch (err) {
      if (err instanceof InsufficientScopeError) {
        // Old token missing `calendar.readonly` — reconnect to grant it.
        throw new OptionsResolverError(
          "PROVIDER_REAUTH_REQUIRED",
          "Reconnect Google Calendar to allow listing your calendars.",
        );
      }
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Google Calendar and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Google calendars. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> = [];
    for (const cal of page.items ?? []) {
      if (typeof cal.id !== "string" || cal.id.length === 0) continue;
      if (cal.deleted === true) continue;
      const label =
        (typeof cal.summaryOverride === "string" && cal.summaryOverride.length > 0
          ? cal.summaryOverride
          : typeof cal.summary === "string" && cal.summary.length > 0
            ? cal.summary
            : cal.id);
      items.push(
        cal.primary === true
          ? { value: cal.id, label, description: "Primary calendar" }
          : { value: cal.id, label },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter(
            (item) =>
              item.label.toLowerCase().includes(lowerQ) ||
              item.value.toLowerCase().includes(lowerQ),
          )
        : items;

    return {
      items: filtered,
      hasMore:
        typeof page.nextPageToken === "string" && page.nextPageToken.length > 0,
    };
  },
};
