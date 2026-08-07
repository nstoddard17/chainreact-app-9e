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
 * Scopes (GOOGLE-OAUTH-SCOPE-MINIMIZATION-1, 2026-08-07 — single scope):
 *   - gmail.modify is the ONLY requested scope. Per Google's method
 *     reference it authorizes every endpoint the registered Gmail
 *     surface calls: users.getProfile (callback identity + trigger
 *     seed), users.history.list / users.messages.list / get /
 *     attachments.get / users.labels.list (triggers + read actions),
 *     users.messages.send (send_email, reply_to_email),
 *     users.drafts.create (create_draft, create_draft_reply),
 *     users.messages.modify / trash / users.labels.create (label,
 *     read-state, archive, trash actions). It is "all read/write
 *     operations except immediate permanent deletion".
 *   - The former quad (readonly + send + modify + compose) was fully
 *     redundant: modify is a superset of readonly's reads and of the
 *     send/compose grants for the methods we call. Requesting one
 *     restricted scope instead of three restricted + one sensitive
 *     shrinks the consent screen and the Google verification surface
 *     without removing any capability. Existing tokens (granted the
 *     quad) trivially satisfy required ⊆ granted.
 *   - NOT requested: mail.google.com. delete_email's former
 *     "permanent" mode needed users.messages.delete, which Google
 *     authorizes ONLY under mail.google.com — it 403'd under the old
 *     quad too. GOOGLE-OAUTH-REVIEW-READINESS-2 retired the mode
 *     rather than requesting the full-mailbox scope: the builder
 *     offers trash only, and the handler rejects a legacy saved
 *     "permanent" config with a clear error (never silently trashes).
 *   - No gmail.labels (covered by gmail.modify per Google docs).
 *   - No gmail.settings.basic — updateSignature was a V1 orphan and is
 *     skipped per parity-gmail.md §7.
 *   - No openid/email/profile — userinfo lookup uses
 *     gmail.googleapis.com/v1/users/me/profile (covered by gmail.modify),
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
    required: ["https://www.googleapis.com/auth/gmail.modify"],
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
