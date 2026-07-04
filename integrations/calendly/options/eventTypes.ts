import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { eventTypesList } from "@/integrations/_shared/calendly/api/eventTypes";
import { usersMe } from "@/integrations/_shared/calendly/api/users";
import { uuidFromUri } from "../triggers/_shared/project";
import {
  filterAndSortByLabel,
  mapCalendlyOptionsError,
  requireCalendlyIntegration,
} from "./_shared";

/**
 * `calendly:event_types` options resolver — Slice 5.CALENDLY-1.
 *
 * Backs the OPTIONAL `eventTypeId` filter field on both Calendly
 * triggers. No deps (the event-type list is top-level for the connected
 * user). One page of 100 (Calendly's max `count`) with `hasMore` from
 * `pagination.next_page_token`; Calendly documents no server-side name
 * search, so `ctx.q` filters locally only.
 *
 * The user URI the listing needs comes from the integration's account
 * metadata (persisted at connect by oauth.ts); rows without it fall
 * back to one `GET /users/me` call. Values are event-type UUIDs (the
 * P-S2 filter compares UUIDs; raw API URIs never become config values),
 * labels are event-type names only.
 */
const PAGE_SIZE = 100;

export const calendlyEventTypesResolver: OptionsResolver = {
  source: "calendly:event_types",
  provider: "calendly",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireCalendlyIntegration(ctx);

    let page;
    try {
      const metadata = integration.accountMetadata as {
        calendlyUserUri?: unknown;
      };
      let userUri =
        typeof metadata.calendlyUserUri === "string" &&
        metadata.calendlyUserUri.length > 0
          ? metadata.calendlyUserUri
          : null;
      if (!userUri) {
        const me = await refreshAndRetry({
          accountId: integration.accountId,
          provider: "calendly",
          providerAccountId: integration.providerAccountId,
          apiCall: (accessToken) => usersMe({ accessToken }),
        });
        userUri = me.uri ?? null;
      }
      if (!userUri) {
        throw new Error("Calendly user URI unresolved.");
      }
      const resolvedUserUri = userUri;

      page = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "calendly",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          eventTypesList({
            accessToken,
            userUri: resolvedUserUri,
            count: PAGE_SIZE,
          }),
      });
    } catch (err) {
      mapCalendlyOptionsError(err, "event types");
    }

    const items: OptionItem[] = [];
    for (const eventType of page.items) {
      const id = uuidFromUri(eventType.uri);
      if (!id) continue;
      const label =
        typeof eventType.name === "string" && eventType.name.length > 0
          ? eventType.name
          : id;
      items.push({ value: id, label });
    }

    return { items: filterAndSortByLabel(items, ctx.q), hasMore: page.hasMore };
  },
};
