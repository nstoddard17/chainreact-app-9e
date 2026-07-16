import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Microsoft Outlook (mail-only) provider manifest.
 *
 * First non-Google non-Slack provider in V2. The id is `microsoft-outlook`
 * (not `outlook` and not `microsoft`) so that Slice 7 (Calendar) can land
 * a sibling `microsoft-calendar` manifest under the same Azure AD app
 * without scope conflict. Each Microsoft surface is a separate provider
 * row in the registry — the shared OAuth wire-format gets factored into
 * `_shared/microsoft/` only once a second Microsoft provider exists
 * (deferred per docs/slices/slice-6-outlook-mail.md §"Confirmed scope
 * decisions" #6).
 *
 * Capability flags follow the V2 honest-state convention — they flip true
 * only when a real handler/trigger lands. As of this commit (Slice 6
 * Commit 2 — manifest + OAuth + dispatcher registration), `oauth` is true
 * and the rest are still false. Subsequent commits in the slice flip
 * `actions` (when send_email registers) and `webhookTrigger` (when
 * new_email's subscription trigger registers).
 *
 * Scopes — the four mail-only Graph scopes (Outlook Mail 2.1 widens
 * from Slice 6's original three):
 *   - `offline_access` — required for the Microsoft v2 endpoint to issue
 *     a refresh_token. Without it tokens last 60-90 minutes and the
 *     integration goes cold.
 *   - `Mail.Send` — required by the send_email action (Slice 6 Commit 3)
 *     and by reply_to_email / forward_email (Outlook Mail 2.1).
 *   - `Mail.Read` — required by the new_email trigger (Slice 6 Commit 4)
 *     so the webhook receiver can fetch the message body via
 *     /me/messages/{id}, and by future 2.2 fetch_emails.
 *   - `Mail.ReadWrite` — required by create_draft_email (Outlook Mail
 *     2.1) and by 2.2's move_email / delete_email / add_categories
 *     (PATCH / move / DELETE on /me/messages/{id}). Mail.ReadWrite is a
 *     superset of Mail.Read; both are declared so an IT-restricted
 *     Azure AD tenant that grants only Mail.Read can still operate
 *     send_email / new_email cleanly. Accepted by Marcus 2026-05-15;
 *     P-O1 in docs/slices/parity/outlook-mail-2-1-compose-drafts-plan.md.
 *
 * Calendar / Files / Teams / Contacts scopes are explicitly NOT here —
 * the V1 rot we fix is scope bloat (V1's auth.ts requested 8 scopes for
 * any Microsoft surface). Slice 7 (Calendar) widens additively via its
 * own sibling provider; future Outlook Mail surfaces stay mail-only.
 *
 * Existing connected accounts on the original 3-scope set will need
 * to re-grant consent the first time they hit a Mail.ReadWrite endpoint.
 * V2 handles that via the proactive-health system (CLAUDE.md "Proactive
 * OAuth Token Management") — Graph 403 surfaces as `action_required` and
 * the reconnect UX runs the standard OAuth flow. No migration script.
 *
 * tokenScope: "user" matches Gmail / Calendar / Drive / Sheets — one
 * Outlook integration per (user, email). A user with both Gmail and
 * Outlook connected has two independent integration rows — independent
 * OAuth, independent tokens, independent health.
 *
 * accountIdField: "email" is the email address resolved from Graph
 * `/me` (`mail` field with `userPrincipalName` fallback for consumer
 * accounts where the mailbox isn't provisioned). Same shape as Gmail.
 *
 * Health-check interval: 6h matches Gmail / Calendar / Drive / Sheets
 * (CLAUDE.md "Google/Microsoft: 6h").
 *
 * apiVersion: "v1.0" pins the Graph API version. The `beta` endpoint
 * exists but Slice 6 stays on `v1.0` (stable, fully backwards-compatible).
 *
 * refreshable: true — Microsoft's v2 OAuth issues refresh tokens when
 * `offline_access` is granted. Tokens rotate (new refresh_token returned
 * with each refresh response); when omitted from a response we preserve
 * the existing one (matches V1's auth.ts:113 policy and Google's
 * preserve-old behavior).
 */
export const microsoftOutlookManifest: ProviderManifest =
  ProviderManifestSchema.parse({
    id: "microsoft-outlook",
    displayName: "Microsoft Outlook",
    isEnabled: true,
    apiVersion: "v1.0",
    tokenScope: "user",
    oauthFlows: ["v2"],
    accountIdField: "email",
    scopes: {
      required: [
        "offline_access",
        "Mail.Send",
        "Mail.Read",
        // Outlook Mail 2.1 P-O1 widening — needed by create_draft_email
        // (2.1) + move/delete/add_categories (2.2). Mail.ReadWrite is a
        // superset of Mail.Read; both are declared so Azure AD tenants
        // that grant only the narrower scope can still run send_email +
        // new_email. Accepted 2026-05-15.
        "Mail.ReadWrite",
      ],
      optional: [
        // RESOLVERS-1 (Marcus-approved for this batch, same posture as the
        // CONFIG-FIELD-UX-SWEEP-4 scope adds) — needed ONLY by the
        // `microsoft-outlook:categories` options resolver (GET
        // /me/outlook/masterCategories), which backs the category picker
        // on add_categories. Optional, not required: no ACTION handler
        // needs it, and an IT-restricted tenant that declines it loses
        // only the picker (manual entry keeps the field usable).
        // NOTE: existing connections predate this scope — the picker
        // surfaces PROVIDER_REAUTH_REQUIRED (Reconnect) until the user
        // re-consents, and the Azure AD app registration may need the
        // delegated MailboxSettings.Read permission added before consent
        // can succeed.
        "MailboxSettings.Read",
      ],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      // True: the new_email subscription-watch trigger is registered via
      // integrations/microsoft-outlook/triggers/newEmail/index.ts (it
      // wires activation, deactivation, and subscription-renewal hooks).
      // The trigger uses Microsoft Graph subscriptions on /me/messages
      // with a 70.5h expiration and 1h renewal threshold — see
      // docs/slices/slice-6-outlook-mail.md for the design rationale.
      webhookTrigger: true,
      pollingTrigger: false,
      // True: send_email handler is registered in
      // services/execution/handlers/_registry.ts.
      actions: true,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000, // 6h
    refreshable: true,
  });
