import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { memberAddEvent } from "../../_shared/mailchimp/api/members";
import { resolveDc } from "./_resolveDc";
import { CreateCustomEventConfigSchema } from "./createCustomEvent.schema";

/**
 * Mailchimp `create_custom_event` action handler — Slice 14 Commit 3.
 *
 * POSTs `/lists/{audienceId}/members/{subscriberHash}/events` to
 * record a custom event for the subscriber. Mailchimp returns 204
 * No Content; the action synthesizes a useful output shape so
 * downstream nodes can branch on success.
 *
 * Output shape: { success, eventName, subscriberEmail, audienceId,
 * occurredAt }.
 */
export const createCustomEvent: ActionHandler = async (input) => {
  const config = CreateCustomEventConfigSchema.parse(input.config);

  const { dc, providerAccountId } = await resolveDc({
    accountId: input.accountId,
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "mailchimp",
    providerAccountId,
    apiCall: (accessToken) =>
      memberAddEvent({
        accessToken,
        dc,
        audienceId: config.audience_id,
        email: config.email,
        name: config.event_name,
        ...(config.properties !== undefined ? { properties: config.properties } : {}),
        ...(config.occurred_at !== undefined ? { occurredAt: config.occurred_at } : {}),
        ...(config.is_syncing !== undefined ? { isSyncing: config.is_syncing } : {}),
      }),
  });

  return {
    output: {
      success: true,
      eventName: config.event_name,
      subscriberEmail: config.email,
      audienceId: config.audience_id,
      occurredAt: config.occurred_at ?? new Date().toISOString(),
    },
  };
};
