import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { memberPut } from "../../_shared/mailchimp/api/members";
import { resolveDc } from "./_resolveDc";
import { AddSubscriberConfigSchema } from "./addSubscriber.schema";

/**
 * Mailchimp `add_subscriber` action handler — Slice 14 Commit 3 (Q11
 * hot spot).
 *
 * PUTs `/lists/{audienceId}/members/{subscriberHash}` (upsert
 * semantics — works for both new and existing subscribers). Wraps
 * the principal call in `refreshAndRetry`; on 401, the Mailchimp
 * non-refreshable contract surfaces as
 * `IntegrationActionRequiredError(reason: "refresh_not_supported")`.
 *
 * **Merge-field mapping.** V1 stores location as nested
 * `ADDRESS: { addr1, city, state, zip, country }` when `address` is
 * present; falls back to separate `CITY` / `STATE` / `ZIP` /
 * `COUNTRY` merge tags otherwise. V2 mirrors this ([V1 addSubscriber.ts:64-70](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addSubscriber.ts#L64))
 * — Mailchimp's standard ADDRESS merge tag expects the nested shape,
 * but workflows that supply only some fields shouldn't be forced
 * into the address-object format.
 *
 * **Tag parsing.** V1 splits the CSV `tags` field on commas, trims
 * each, drops empties. V2 mirrors. Tags are sent as bare strings in
 * the PUT body — Mailchimp interprets the array as the complete tag
 * set for the subscriber (NOT an additive diff). Use `add_tag` /
 * `remove_tag` actions for tag-diff operations.
 *
 * **status_if_new mirroring.** PUT to an existing record keeps the
 * subscriber's current status; only newly-created records get the
 * explicit `status` value. The wrapper passes `status` into
 * `status_if_new` so upsert behavior is predictable regardless of
 * pre-existing state (matches V1 wire shape via [provider-registry.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts)
 * + V1's PUT body construction).
 *
 * Output shape: { subscriberId, email, status, listId, timestamp,
 * tags }. Stable so downstream nodes can pin against it.
 */
export const addSubscriber: ActionHandler = async (input) => {
  const config = AddSubscriberConfigSchema.parse(input.config);

  const { dc, providerAccountId } = await resolveDc({
    accountId: input.accountId,
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  // Build merge fields. Mailchimp's standard ADDRESS expects nested
  // `{ addr1, city, state, zip, country }`. When `address` is
  // present we use the nested form; otherwise emit individual merge
  // tags. (V1 line 64-70.)
  const mergeFields: Record<string, unknown> = {};
  if (config.first_name) mergeFields.FNAME = config.first_name;
  if (config.last_name) mergeFields.LNAME = config.last_name;
  if (config.phone) mergeFields.PHONE = config.phone;
  if (config.address) {
    mergeFields.ADDRESS = {
      addr1: config.address,
      city: config.city ?? "",
      state: config.state ?? "",
      zip: config.zip ?? "",
      country: config.country ?? "",
    };
  } else {
    if (config.city) mergeFields.CITY = config.city;
    if (config.state) mergeFields.STATE = config.state;
    if (config.zip) mergeFields.ZIP = config.zip;
    if (config.country) mergeFields.COUNTRY = config.country;
  }

  // CSV → trimmed string[] → drop empties.
  const tags =
    config.tags === undefined || config.tags.length === 0
      ? undefined
      : config.tags
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);

  const member = await refreshAndRetry({
    accountId: input.accountId,
    provider: "mailchimp",
    providerAccountId,
    apiCall: (accessToken) =>
      memberPut({
        accessToken,
        dc,
        audienceId: config.audience_id,
        email: config.email,
        status: config.status,
        ...(Object.keys(mergeFields).length > 0 ? { mergeFields } : {}),
        ...(tags && tags.length > 0 ? { tags } : {}),
      }),
  });

  return {
    output: {
      subscriberId: member.id,
      email: member.email_address,
      status: member.status,
      listId: member.list_id,
      timestamp: member.timestamp_opt ?? new Date().toISOString(),
      tags: (member.tags ?? []).map((t) => t.name),
    },
  };
};
