import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { membersList } from "../../_shared/mailchimp/api/members";
import { resolveDc } from "./_resolveDc";
import { GetSubscribersConfigSchema } from "./getSubscribers.schema";

/**
 * Mailchimp `get_subscribers` action handler — Mailchimp 2.1 Commit 1.
 *
 * GETs `/lists/{listId}/members` via the `membersList` wrapper. Pure
 * read; no Q11 surface. Resolves the user's DC via `resolveDc` so the
 * call routes to the right per-account REST host; missing DC throws
 * `MissingDataCenterError` (fail loud — V1's runtime re-fetch
 * fallback is intentionally not reproduced).
 *
 * **Single-page list only.** No auto-pagination. The output includes
 * `nextOffset` (derived from `offset + members.length`) so workflow
 * authors can compose follow-up calls themselves. `nextOffset` is
 * `null` when the page is empty OR when the cursor has reached
 * `totalItems`.
 *
 * **Bounded per-subscriber projection.** No raw Mailchimp response
 * spread — every field is named explicitly. Tag arrays are flattened
 * to bare strings (matches the `get_subscriber` action's shape).
 *
 * Output shape (Readonly):
 *   - listId: string
 *   - subscribers: Array<{ id, emailAddress, uniqueEmailId, contactId,
 *       status, mergeFields, tags, timestampSignup, lastChanged, vip,
 *       emailType }>
 *   - count: number   (this-page subscriber count)
 *   - totalItems: number   (Mailchimp's total across the audience)
 *   - nextOffset: number | null
 */
export const getSubscribers: ActionHandler = async (input) => {
  const config = GetSubscribersConfigSchema.parse(input.config);

  const { dc, providerAccountId } = await resolveDc({
    accountId: input.accountId,
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const requestedCount = config.count ?? 50;
  const requestedOffset = config.offset ?? 0;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "mailchimp",
    providerAccountId,
    apiCall: (accessToken) =>
      membersList({
        accessToken,
        dc,
        audienceId: config.listId,
        status: config.status,
        count: requestedCount,
        offset: requestedOffset,
        sinceLastChanged: config.sinceLastChanged,
        beforeLastChanged: config.beforeLastChanged,
        sortField: config.sortField,
        sortDir: config.sortDir,
      }),
  });

  const subscribers = result.members.map((m) => ({
    id: m.id,
    emailAddress: m.email_address,
    uniqueEmailId: m.unique_email_id ?? null,
    contactId: m.contact_id ?? null,
    status: m.status,
    mergeFields: m.merge_fields ?? {},
    tags: (m.tags ?? []).map((t) => t.name),
    timestampSignup: m.timestamp_signup ?? null,
    lastChanged: m.last_changed ?? null,
    vip: m.vip ?? false,
    emailType: m.email_type ?? null,
  }));

  // nextOffset is null when the page is empty (signals end-of-list)
  // OR when the cumulative cursor has reached totalItems. Otherwise
  // it's the offset a follow-up call should use.
  const cumulative = requestedOffset + subscribers.length;
  const nextOffset =
    subscribers.length === 0 || cumulative >= result.totalItems
      ? null
      : cumulative;

  return {
    output: {
      listId: config.listId,
      subscribers,
      count: subscribers.length,
      totalItems: result.totalItems,
      nextOffset,
    },
  };
};
