import { mailchimpRequest } from "./_request";
import { ConflictError } from "../errors";

/**
 * Mailchimp Marketing API v3 `/lists/{audienceId}/webhooks` resource
 * wrappers — Slice 14 Commit 4.
 *
 * Used by the `audience_event` consolidated trigger's activate /
 * deactivate hooks to manage one webhook per (audience, workflow node).
 *
 * **Per-audience, single subscription with bitmap of events.** Unlike
 * Shopify's "one webhook per topic" model, Mailchimp expresses
 * subscribed events as a 6-boolean map on a single webhook resource.
 * Activation passes the full map (true for selected, false for
 * everything else); reactivation can PATCH the map; deactivation
 * deletes the webhook.
 *
 * **Auth: account access token + per-dc routing.** The wrapper takes
 * `dc` + `accessToken`; the routing helper in `_request.ts` builds
 * the per-dc URL.
 *
 * **No signature.** Mailchimp doesn't sign webhook deliveries — see
 * plan doc §"Webhook signature decision" and `_shared/mailchimp/webhooks/`.
 * The auth model for inbound is URL secrecy (workflowId + nodeId
 * query params on the callback) + audienceId match + eventType
 * allowlist + sha256(rawBody) dedup.
 *
 * **Duplicate-URL recovery.** Mailchimp returns a 400 with the
 * sub-error `field: "url"` + message including `"can't set up multiple
 * WebHooks"` when the same URL has already been subscribed on the
 * list. V1 [`MailchimpTriggerLifecycle.ts:218-302`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts#L218)
 * handles this by listing existing webhooks for the list, finding the
 * matching URL, and PATCHing the events on the existing record. V2
 * keeps this — re-activation after a partial-failure that left a
 * Mailchimp webhook orphaned is a real scenario.
 *
 * Both `webhooksCreate` and `webhooksList` use `mailchimpRequest`'s
 * 400-handling (the `_request.ts` helper promotes "Member Exists" to
 * `ConflictError`; the duplicate-webhook-URL case has a different
 * envelope, so we detect it locally via the wrapper-level guard).
 */

export type MailchimpWebhookEventName =
  | "subscribe"
  | "unsubscribe"
  | "profile"
  | "cleaned"
  | "upemail"
  | "campaign";

export const MAILCHIMP_WEBHOOK_EVENT_NAMES: readonly MailchimpWebhookEventName[] = [
  "subscribe",
  "unsubscribe",
  "profile",
  "cleaned",
  "upemail",
  "campaign",
] as const;

/**
 * Mailchimp's webhook event map. Mailchimp REQUIRES every event field
 * to be explicitly set (true or false) per V1
 * [`MailchimpTriggerLifecycle.ts:56`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts#L56)
 * and current Mailchimp docs. A missing key would be treated as `false`
 * but the explicit shape is safer.
 */
export type MailchimpWebhookEvents = Readonly<
  Record<MailchimpWebhookEventName, boolean>
>;

/**
 * Mailchimp's `sources` map controls WHICH actors trigger the webhook.
 * `user` = list subscriber via signup form / unsubscribe link, `admin`
 * = Mailchimp dashboard manual change, `api` = REST API change.
 * Slice 14 Batch 1 defaults all three to `true` so the trigger fires
 * regardless of source — this matches V1
 * [`MailchimpTriggerLifecycle.ts:208-212`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts#L208).
 */
export type MailchimpWebhookSources = Readonly<{
  user: boolean;
  admin: boolean;
  api: boolean;
}>;

export interface MailchimpWebhook {
  id: string;
  url: string;
  events: MailchimpWebhookEvents;
  sources: MailchimpWebhookSources;
  list_id?: string;
}

interface MailchimpWebhooksListResponse {
  webhooks: MailchimpWebhook[];
  list_id?: string;
  total_items?: number;
}

// ─── webhooksCreate ─────────────────────────────────────────────────────────

export interface WebhooksCreateInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  /** Callback URL — must include `?workflowId=X&nodeId=Y` for receive-path routing. */
  url: string;
  events: MailchimpWebhookEvents;
  sources: MailchimpWebhookSources;
}

export async function webhooksCreate(
  input: WebhooksCreateInput,
): Promise<MailchimpWebhook> {
  return mailchimpRequest<MailchimpWebhook>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "POST",
    path: `/lists/${encodeURIComponent(input.audienceId)}/webhooks`,
    body: {
      url: input.url,
      events: { ...input.events },
      sources: { ...input.sources },
    },
    resourceForNotFound: `audience webhook (create on list ${input.audienceId})`,
  });
}

// ─── webhooksList ───────────────────────────────────────────────────────────

export interface WebhooksListInput {
  accessToken: string;
  dc: string;
  audienceId: string;
}

export async function webhooksList(
  input: WebhooksListInput,
): Promise<readonly MailchimpWebhook[]> {
  const response = await mailchimpRequest<MailchimpWebhooksListResponse>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "GET",
    path: `/lists/${encodeURIComponent(input.audienceId)}/webhooks`,
    resourceForNotFound: `audience webhooks (list on list ${input.audienceId})`,
  });
  return response.webhooks ?? [];
}

// ─── webhooksDelete ─────────────────────────────────────────────────────────

export interface WebhooksDeleteInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  webhookId: string;
}

export async function webhooksDelete(input: WebhooksDeleteInput): Promise<void> {
  await mailchimpRequest<Record<string, never>>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "DELETE",
    path: `/lists/${encodeURIComponent(input.audienceId)}/webhooks/${encodeURIComponent(input.webhookId)}`,
    resourceForNotFound: `audience webhook ${input.webhookId} (on list ${input.audienceId})`,
  });
}

// ─── webhooksPatch ──────────────────────────────────────────────────────────

export interface WebhooksPatchInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  webhookId: string;
  events: MailchimpWebhookEvents;
  sources: MailchimpWebhookSources;
}

/**
 * PATCH an existing webhook — used by `webhooksCreateOrAdopt` when the
 * URL is already subscribed and we want to update its event/source
 * map to match the current workflow's selection.
 */
export async function webhooksPatch(
  input: WebhooksPatchInput,
): Promise<MailchimpWebhook> {
  return mailchimpRequest<MailchimpWebhook>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "PATCH",
    path: `/lists/${encodeURIComponent(input.audienceId)}/webhooks/${encodeURIComponent(input.webhookId)}`,
    body: {
      events: { ...input.events },
      sources: { ...input.sources },
    },
    resourceForNotFound: `audience webhook ${input.webhookId} (on list ${input.audienceId})`,
  });
}

// ─── webhooksCreateOrAdopt ──────────────────────────────────────────────────

/**
 * Mailchimp's "can't set up multiple WebHooks" recovery — V1
 * [`MailchimpTriggerLifecycle.ts:218-302`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts#L218)
 * pattern. Try create; on duplicate-URL failure, list webhooks for
 * the list, find the existing one with our URL, and PATCH its events
 * to match. Returns the resolved webhook either way.
 *
 * "Duplicate URL" detection: V1 sniffs
 * `errors[].field === 'url' && errors[].message?.includes("can't set up multiple WebHooks")`.
 * Mailchimp's error envelope for this case arrives as HTTP 400 with
 * an `errors[]` array nested under the standard error envelope. V2's
 * `mailchimpRequest` already promotes "Member Exists" 400s to
 * `ConflictError`; for the webhook-duplicate case the title is NOT
 * "Member Exists" so it falls through to a generic Error. The wrapper
 * here re-throws on any non-duplicate-URL error.
 */
export async function webhooksCreateOrAdopt(
  input: WebhooksCreateInput,
): Promise<{ webhook: MailchimpWebhook; adopted: boolean }> {
  try {
    const webhook = await webhooksCreate(input);
    return { webhook, adopted: false };
  } catch (err) {
    if (!(err instanceof Error)) throw err;
    // Match V1's duplicate-URL detection. The shared `_request.ts`
    // helper wraps the error envelope into the message string; the
    // duplicate-URL case manifests as "can't set up multiple WebHooks"
    // substring within that message. ConflictError is the
    // already-categorized shape so we accept either signal as the
    // duplicate trigger.
    const isDuplicateUrl =
      err instanceof ConflictError ||
      err.message.includes("can't set up multiple WebHooks");
    if (!isDuplicateUrl) throw err;

    // Find the existing webhook matching our URL.
    const existing = await webhooksList({
      accessToken: input.accessToken,
      dc: input.dc,
      audienceId: input.audienceId,
    });
    const match = existing.find((w) => w.url === input.url);
    if (!match) {
      // Mailchimp said "duplicate URL" but we can't find it. Surface
      // the original error with extra context — better than a silent
      // 404 from a missing PATCH target.
      throw new Error(
        `Mailchimp webhook duplicate-URL recovery failed: no webhook with url=${input.url} on list ${input.audienceId} (Mailchimp reported duplicate but list returned no matching record).`,
      );
    }

    // Adopt by PATCHing the existing record's events/sources to match
    // the current workflow's selection.
    const patched = await webhooksPatch({
      accessToken: input.accessToken,
      dc: input.dc,
      audienceId: input.audienceId,
      webhookId: match.id,
      events: input.events,
      sources: input.sources,
    });
    return { webhook: patched, adopted: true };
  }
}
