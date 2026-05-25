import { ProviderManifestSchema, type ProviderManifest } from "@/contracts/integration";

/**
 * Gmail provider manifest.
 *
 * Capability flags reflect honest current state — they flip true only
 * when a real handler/trigger is registered. As of Slice 2e, both
 * `actions` (sendEmail, Slice 2d) and `pollingTrigger` (newEmail,
 * Slice 2e) are `true`. This convention keeps the manifest from
 * advertising capabilities that don't exist.
 *
 * OAuth shape (via integrations/gmail/oauth.ts):
 *   - PKCE S256 (Slice 2a infra; Gmail is the first real consumer).
 *   - access_type=offline + prompt=consent — guarantees a refresh token on
 *     every connect (Google's quirk: refresh token only returned on first
 *     consent OR when prompt=consent forces re-consent). UX cost accepted
 *     per Slice 2 plan deferred-polish status.
 *   - tokenScope: "user" — one Gmail integration row per (user, email).
 *     Multi-account users connect each inbox separately.
 *   - accountIdField: "email" — providerAccountId is the Gmail
 *     emailAddress fetched from users.getProfile at callback time.
 *   - refreshable: true — Gmail's refreshToken is the first end-to-end
 *     refresh path against a real provider (Slice 2b infra).
 *
 * Scopes:
 *   - gmail.readonly: required for the polling trigger AND for the
 *     callback-time accountId lookup via users.getProfile.
 *   - gmail.send: required for the send action handler.
 *   - gmail.modify (Gmail 2.1 / P-G1): required for label add/remove,
 *     mark read/unread, archive, trash, and labels-on-send on the
 *     send_email expansion. Covers `users.messages.modify`,
 *     `users.messages.trash`, `users.labels.create`.
 *   - gmail.compose (Gmail 2.1 / P-G1): required for draft creation +
 *     thread reply ports (createDraft, createDraftReply, replyToEmail).
 *     Covers `users.drafts.create` and `users.messages.send` with
 *     `threadId`. Re-consent required for existing users at next
 *     connect — accepted trade-off per parity-gmail.md §10 (P-G1).
 *   - No gmail.labels (covered by gmail.modify per Google docs).
 *   - No gmail.settings.basic — updateSignature was a V1 orphan and is
 *     skipped per parity-gmail.md §7.
 *   - No openid/email/profile — userinfo lookup uses
 *     gmail.googleapis.com/v1/users/me/profile (covered by gmail.readonly),
 *     not the OAuth identity endpoint.
 *
 * Health-check interval: 6h matches the V1 cadence for Google integrations
 * (CLAUDE.md "Google/Microsoft: 6h"). The future health engine consumes
 * this; Slice 2c just declares it.
 */
export const gmailManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "gmail",
  displayName: "Gmail",
  isEnabled: true,
  apiVersion: "v1",
  tokenScope: "user",
  oauthFlows: ["v2"],
  accountIdField: "email",
  scopes: {
    required: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.compose",
    ],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    webhookTrigger: false,
    pollingTrigger: true, // Slice 2e: newEmail polling trigger shipped + registered
    actions: true, // Slice 2d: sendEmail handler shipped + registered
  },
  healthCheckIntervalMs: 6 * 60 * 60 * 1000, // 6h
  refreshable: true,
});
