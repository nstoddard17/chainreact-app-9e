import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { listCalendars } from "@/integrations/microsoft-outlook-calendar/api/listCalendars";

/**
 * `microsoft-outlook-calendar:calendars` options resolver — Slice
 * ANALYTICS-SOURCES-OUTLOOK-CAL-1. Backs the (optional) calendar picker on the
 * Outlook Calendar analytics widgets; leaving it blank defaults to the viewer's
 * primary calendar.
 *
 * Behavior mirrors the `microsoft-outlook:folders` resolver (refreshable personal
 * provider):
 *   - `requiresIntegration: true` — the route loads the caller's active Outlook
 *     Calendar integration and short-circuits with `INTEGRATION_DISCONNECTED`.
 *   - Outlook Calendar is PERSONAL, and the analytics options call carries NO
 *     workflow context, so the route resolves the caller's OWN connection. The
 *     picker lists the EDITOR'S calendars only; at render each viewer still queries
 *     with their own token, so a co-member never receives another member's
 *     calendars or result.
 *   - Refreshable → `refreshAndRetry`. Uses only the granted `Calendars.ReadWrite`
 *     scope — no reconnect required.
 *   - Maps each calendar to `{ value: id, label: name }`. `q` filters client-side.
 *
 * PRIVACY: only calendar id + name are read — never an event, attendee, or address.
 *
 * Error sanitization — leak-free:
 *   - refresh failed / 401 → `INTEGRATION_DISCONNECTED` (reconnect).
 *   - anything else → generic `PROVIDER_ERROR`; a token-free event is logged.
 */

const PAGE_CAP = 100;

export const outlookCalendarsResolver: OptionsResolver = {
  source: "microsoft-outlook-calendar:calendars",
  provider: "microsoft-outlook-calendar",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "Connect Outlook Calendar to pick a calendar.",
      );
    }
    const integration = ctx.integration;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-outlook-calendar",
        providerAccountId: null,
        apiCall: (accessToken) => listCalendars({ accessToken }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Outlook Calendar and try again.",
        );
      }
      console.warn(
        JSON.stringify({
          event: "options.outlook_calendars.provider_error",
          source: "microsoft-outlook-calendar:calendars",
        }),
      );
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load your Outlook calendars. Try again.",
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const items = result.value
      .filter((c) => typeof c.id === "string" && c.id.length > 0 && typeof c.name === "string")
      .map((c) => ({ value: c.id, label: c.name as string }))
      .filter((item) => lowerQ.length === 0 || item.label.toLowerCase().includes(lowerQ))
      .slice(0, PAGE_CAP);

    return { items, hasMore: result.value.length > PAGE_CAP };
  },
};
