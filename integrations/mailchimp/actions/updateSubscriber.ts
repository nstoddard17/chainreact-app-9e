import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { memberPatch } from "../../_shared/mailchimp/api/members";
import { resolveDc } from "./_resolveDc";
import { UpdateSubscriberConfigSchema } from "./updateSubscriber.schema";

/**
 * Mailchimp `update_subscriber` action handler — Slice 14 Commit 3.
 *
 * PATCHes `/lists/{audienceId}/members/{subscriberHash}`. Partial
 * update — only the fields present in the body change; everything
 * else stays as-is. The subscriber hash is computed from the
 * CURRENT email (not the new one), so the URL still resolves the
 * existing record even when `new_email` is set.
 *
 * Email-change behavior: when `new_email` is set, Mailchimp ships
 * the change AND fires `upemail` webhooks (relevant for Slice 14
 * Commit 4's `audience_event` trigger with `upemail` in its event
 * set).
 *
 * Output shape: { subscriberId, email, status, listId, lastChanged }.
 */
export const updateSubscriber: ActionHandler = async (input) => {
  const config = UpdateSubscriberConfigSchema.parse(input.config);

  const { dc, accountId } = await resolveDc({
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  // Build merge fields per the same nested-ADDRESS rule as
  // `add_subscriber` (V1 parity).
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

  const member = await refreshAndRetry({
    userId: input.userId,
    provider: "mailchimp",
    accountId,
    apiCall: (accessToken) =>
      memberPatch({
        accessToken,
        dc,
        audienceId: config.audience_id,
        email: config.email,
        ...(config.status !== undefined ? { status: config.status } : {}),
        ...(config.new_email !== undefined ? { newEmail: config.new_email } : {}),
        ...(Object.keys(mergeFields).length > 0 ? { mergeFields } : {}),
      }),
  });

  return {
    output: {
      subscriberId: member.id,
      email: member.email_address,
      status: member.status,
      listId: member.list_id,
      lastChanged: member.last_changed ?? null,
    },
  };
};
