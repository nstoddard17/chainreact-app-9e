import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { memberPatch } from "../../_shared/mailchimp/api/members";
import { subscriberHash } from "../../_shared/mailchimp/api/_subscriberHash";
import { resolveDc } from "./_resolveDc";
import { UnsubscribeSubscriberConfigSchema } from "./unsubscribeSubscriber.schema";

/**
 * Mailchimp `unsubscribe_subscriber` action handler — Mailchimp 2.1
 * Commit 2.
 *
 * PATCHes `/lists/{listId}/members/{md5LowercaseEmail}` with
 * `{status: 'unsubscribed'}` via the existing `memberPatch` wrapper.
 * Pure state-change — preserves the subscriber record so the user can
 * be re-subscribed later (distinct from `remove_subscriber` which
 * archives or hard-deletes per Q11 destructive-gate mode).
 *
 * **No hidden notification side effects.** V1 accepted three flags
 * that V2 drops on port (audit M-R3):
 *   - `sendGoodbye` — V1 logged-only; Mailchimp's PATCH endpoint
 *     ignores it. Goodbye emails are a dashboard setting.
 *   - `sendNotification` — same. List-owner notifications are a
 *     dashboard setting.
 *   - `reason` — V1 fired a second `/notes` POST as a hidden side
 *     effect with `.catch(swallow)`. V2 keeps the action pure; users
 *     compose `unsubscribe_subscriber` → `add_note` explicitly when a
 *     reason note is wanted.
 *
 * **No raw response spread.** Output names every field explicitly.
 *
 * Output shape:
 *   - listId: string  (echoed config; useful for downstream branching)
 *   - subscriberHash: string  (the md5(lowercase(email)) used in the URL)
 *   - emailAddress: string  (Mailchimp's `email_address` from the
 *       PATCH response; may differ from input case if Mailchimp
 *       normalized it server-side)
 *   - status: string  (Mailchimp's post-PATCH status — expected to
 *       be `"unsubscribed"`)
 *   - unsubscribed: boolean  (derived: `status === "unsubscribed"`)
 *   - lastChanged: string | null  (Mailchimp's `last_changed` ISO
 *       timestamp, or null when omitted)
 *   - success: true  (literal; reaches output only on non-throw path —
 *       redundant with V2's throw-on-failure convention but kept for
 *       explicit downstream-branching ergonomics per Commit 2 spec)
 *
 * Errors:
 *   - `MissingDataCenterError` from `resolveDc` (no Mailchimp
 *     integration / dc not set) — propagates.
 *   - `NotFoundError` from the wrapper when the subscriber isn't in
 *     the audience — propagates (workflow author branches on the
 *     error rather than receiving a mixed-success `{found: false}`
 *     payload, consistent with `get_subscriber`).
 *   - 401 → `IntegrationActionRequiredError` via `refreshAndRetry`
 *     (Mailchimp is non-refreshable).
 */
export const unsubscribeSubscriber: ActionHandler = async (input) => {
  const config = UnsubscribeSubscriberConfigSchema.parse(input.config);

  const { dc, providerAccountId } = await resolveDc({
    accountId: input.accountId,
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const member = await refreshAndRetry({
    accountId: input.accountId,
    provider: "mailchimp",
    providerAccountId,
    apiCall: (accessToken) =>
      memberPatch({
        accessToken,
        dc,
        audienceId: config.listId,
        email: config.emailAddress,
        status: "unsubscribed",
      }),
  });

  const hash = subscriberHash(config.emailAddress);

  return {
    output: {
      listId: config.listId,
      subscriberHash: hash,
      emailAddress: member.email_address,
      status: member.status,
      unsubscribed: member.status === "unsubscribed",
      lastChanged: member.last_changed ?? null,
      success: true,
    },
  };
};
