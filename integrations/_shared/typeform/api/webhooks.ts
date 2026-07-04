import { typeformRequest, typeformRequestVoid } from "./_request";

/**
 * Typed Typeform webhook lifecycle wrappers — Slice 5.TYPEFORM-1.
 *
 * `PUT /forms/{form_id}/webhooks/{tag}` and
 * `DELETE /forms/{form_id}/webhooks/{tag}` (both scope `webhooks:write`
 * per the scopes page — create/update/delete are all under it).
 *
 * Creation semantics (research.md "Webhooks API"): NO handshake — V2
 * mints the HMAC `secret` itself and sends it in the PUT body (contrast
 * Asana's X-Hook-Secret dance). `tag` is caller-chosen and unique per
 * form; PUT to the same tag UPDATES in place, so a deterministic
 * per-(workflow, node) tag makes activation idempotent.
 *
 * `event_types` is deliberately omitted from the PUT body: the reference
 * page describes it as required but the official walkthrough example
 * omits it (defaults to the standard `form_response` event). Verified at
 * Phase 13 live certification; add explicitly if a live PUT rejects.
 */

export interface TypeformWebhook {
  id?: string;
  tag?: string;
  form_id?: string;
  enabled?: boolean;
}

export interface WebhookPutInput {
  accessToken: string;
  /** The watched form id. */
  formId: string;
  /** Caller-chosen webhook identifier, unique per form. */
  tag: string;
  /** The notification URL (carries ?workflowId=&nodeId= for strict lookup). */
  url: string;
  /** V2-minted HMAC-SHA256 signing key (Typeform-Signature header). */
  secret: string;
}

export async function webhookPut(input: WebhookPutInput): Promise<TypeformWebhook> {
  return typeformRequest<TypeformWebhook>({
    accessToken: input.accessToken,
    method: "PUT",
    path: `/forms/${encodeURIComponent(input.formId)}/webhooks/${encodeURIComponent(input.tag)}`,
    data: {
      url: input.url,
      enabled: true,
      secret: input.secret,
      verify_ssl: true,
    },
    resourceForNotFound: `form ${input.formId} (create webhook)`,
  });
}

export interface WebhookDeleteInput {
  accessToken: string;
  formId: string;
  tag: string;
}

export async function webhookDelete(input: WebhookDeleteInput): Promise<void> {
  await typeformRequestVoid({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/forms/${encodeURIComponent(input.formId)}/webhooks/${encodeURIComponent(input.tag)}`,
    resourceForNotFound: `webhook ${input.tag} on form ${input.formId}`,
  });
}
