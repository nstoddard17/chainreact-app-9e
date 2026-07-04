import {
  type ProviderCapability,
  type ProviderManifest,
  ProviderManifestSchema,
} from "@/contracts/integration";
import { airtableManifest } from "./airtable/manifest";
import { asanaManifest } from "./asana/manifest";
import { discordManifest } from "./discord/manifest";
import { calendlyManifest } from "./calendly/manifest";
import { typeformManifest } from "./typeform/manifest";
import { dropboxManifest } from "./dropbox/manifest";
import { facebookManifest } from "./facebook/manifest";
import { githubManifest } from "./github/manifest";
import { gmailManifest } from "./gmail/manifest";
import { googleAnalyticsManifest } from "./google-analytics/manifest";
import { googleCalendarManifest } from "./google-calendar/manifest";
import { googleDocsManifest } from "./google-docs/manifest";
import { googleDriveManifest } from "./google-drive/manifest";
import { googleSheetsManifest } from "./google-sheets/manifest";
import { microsoftExcelManifest } from "./microsoft-excel/manifest";
import { microsoftOneDriveManifest } from "./microsoft-onedrive/manifest";
import { microsoftOneNoteManifest } from "./microsoft-onenote/manifest";
import { microsoftOutlookManifest } from "./microsoft-outlook/manifest";
import { microsoftOutlookCalendarManifest } from "./microsoft-outlook-calendar/manifest";
import { microsoftTeamsManifest } from "./microsoft-teams/manifest";
import { hubspotManifest } from "./hubspot/manifest";
import { mailchimpManifest } from "./mailchimp/manifest";
import { mondayManifest } from "./monday/manifest";
import { notionManifest } from "./notion/manifest";
import { shopifyManifest } from "./shopify/manifest";
import { slackManifest } from "./slack/manifest";
import { stripeManifest } from "./stripe/manifest";
import { trelloManifest } from "./trello/manifest";

// Side-effect imports: each provider's trigger/handler modules self-register
// with the polling + activation + subscription registries at module load.
// Adding a new trigger provider means adding its registration import here.
import "./gmail/triggers/newEmail";
// Gmail 2.3 Commit 3 — new_labeled_email polling trigger.
import "./gmail/triggers/newLabeledEmail";
// Gmail 2.3 Commit 4 — new_attachment polling trigger.
import "./gmail/triggers/newAttachment";
import "./google-calendar/triggers/eventChanged";
import "./google-docs/triggers/newDocument";
import "./google-docs/triggers/documentUpdated";
import "./google-drive/triggers/fileChanged";
import "./google-sheets/triggers/rowChanged";
// Sheets 2.3 Commit 4 — new_worksheet watch-based push trigger.
import "./google-sheets/triggers/newWorksheet";
import "./microsoft-outlook/triggers/newEmail";
// Outlook Mail 2.3 Commit 3 — email_sent + email_flagged subscription-
// watch triggers. Both share the existing webhook receive route and
// renewal cron; their index.ts modules register activation /
// deactivation / subscription handlers at load time.
import "./microsoft-outlook/triggers/emailSent";
import "./microsoft-outlook/triggers/emailFlagged";
import "./microsoft-outlook-calendar/triggers/eventChanged";
import "./microsoft-onedrive/triggers/fileChanged";
// Slice 3.ONENOTE-5 — microsoft-onenote:new_note + :updated_note
// section-scoped polling triggers. Activation hooks seed snapshots
// (createdDateTime / lastModifiedDateTime) for first-poll-miss
// protection; the polling-triggers cron polls every 5 min via
// GET /me/onenote/sections/{id}/pages with $orderby + client-side
// filter. Polling-only — Graph deprecated OneNote webhook
// subscriptions May 2023.
import "./microsoft-onenote/triggers/newNote";
import "./microsoft-onenote/triggers/updatedNote";
import "./microsoft-excel/triggers/newRow";
import "./microsoft-excel/triggers/newTableRow";
import "./microsoft-excel/triggers/newWorksheet";
import "./microsoft-excel/triggers/updatedRow";
import "./microsoft-excel/triggers/updatedTableRow";
import "./microsoft-teams/triggers/newChannelMessage";
import "./airtable/triggers/recordChanged";
import "./stripe/triggers/eventReceived";
import "./shopify/triggers/webhookReceived";
import "./hubspot/triggers/webhookReceived";
import "./github/triggers/newCommit";
import "./mailchimp/triggers/audienceEvent";
import "./mailchimp/triggers/campaignCreated";
import "./mailchimp/triggers/emailOpened";
import "./mailchimp/triggers/linkClicked";
// Mailchimp 2.1 Commit 3 — 3 parity polling triggers.
import "./mailchimp/triggers/subscriberAddedToSegment";
import "./mailchimp/triggers/segmentUpdated";
import "./mailchimp/triggers/newAudience";
// Slack 2.1 Commit 8 — 5 message + reaction trigger filters register
// with the P-S2 filter registry at module load.
import "./slack/triggers";
// Slice 17 Commit 5 — 6 Trello board-webhook triggers register their
// activation + deactivation hooks at module load.
import "./trello/triggers/newCard";
import "./trello/triggers/cardUpdated";
import "./trello/triggers/cardMoved";
import "./trello/triggers/commentAdded";
import "./trello/triggers/memberChanged";
import "./trello/triggers/cardArchived";
// Slice 3.DISCORD-6 — discord:slash_command webhook trigger.
// Activation registers a guild-scoped slash command via Discord's
// `POST /applications/{app_id}/guilds/{guild_id}/commands`; deactivation
// deletes it. Interactions arrive at the deployment-wide endpoint
// `/api/webhooks/discord` (configured per Discord application in the
// Developer Portal) — strict-direct-lookup via ?workflowId=&nodeId=.
import "./discord/triggers/slashCommand";
// Slice 3.DISCORD-7 — discord:new_message polling trigger.
// Activation seeds snapshot.lastSeenMessageId from the channel's
// current newest message; the polling-triggers cron fetches new
// messages every ~5 minutes via GET /channels/{id}/messages?after={id}.
// Polling-only — no provider-side resource to renew.
import "./discord/triggers/newMessage";
// Slice 3.MONDAY-7 — 5 Monday board-webhook triggers. Each registers its
// activation (create_webhook) + deactivation (delete_webhook) hooks at
// module load. Strict-direct-lookup via ?workflowId=&nodeId= on the
// notification URL; events arrive at /api/webhooks/monday. Monday
// webhooks don't expire — no renewal/subscription-watch marker.
import "./monday/triggers/newItem";
import "./monday/triggers/columnChanged";
import "./monday/triggers/itemMoved";
import "./monday/triggers/newSubitem";
import "./monday/triggers/newUpdate";
// Slice 3.DROPBOX-5 — dropbox:new_file webhook trigger. App-level webhook
// (one URL in the Dropbox App Console) + per-account cursor reconciliation;
// notifications arrive at /api/webhooks/dropbox. Activation seeds a
// list_folder cursor (first-poll-miss protection) — NO remote
// create_webhook (the app webhook is shared-infra and never expires), so
// NO deactivation/renewal hook either.
import "./dropbox/triggers/newFile";
// Slice 3.FACEBOOK-5 — facebook:new_post / new_comment app-level webhook
// triggers. Each registers its activation (subscribed_apps), reference-count-
// safe deactivation, and per-trigger filter (pageId / optional postId) at
// module load. Notifications arrive at /api/webhooks/facebook (app-level, one
// URL in the Meta App Dashboard). Both subscribe the same Page `feed` field.
import "./facebook/triggers/newPost";
import "./facebook/triggers/newComment";
// Slice 5.ASANA-1 — 2 Asana project-webhook triggers. Each registers its
// activation (POST /webhooks + X-Hook-Secret handshake persistence),
// deactivation (DELETE /webhooks/{gid}), and P-S2 projectId dispatcher
// filter at module load. Strict-direct-lookup via ?workflowId=&nodeId= on
// the notification URL; events arrive at /api/webhooks/asana. Asana
// webhooks don't expire on a schedule — no renewal/subscription-watch
// marker (Asana deletes them itself after 24h of failed deliveries).
import "./asana/triggers/newTaskInProject";
import "./asana/triggers/taskUpdatedInProject";
// Slice 5.TYPEFORM-1 — 1 Typeform form-webhook trigger. Registers its
// activation (PUT /forms/{id}/webhooks/{tag} with a V2-minted secret —
// no creation handshake), deactivation (DELETE …/webhooks/{tag}), and
// P-S2 formId dispatcher filter at module load. Strict-direct-lookup via
// ?workflowId=&nodeId= on the notification URL; events arrive at
// /api/webhooks/typeform. Typeform webhooks don't expire on a schedule —
// no renewal/subscription-watch marker.
import "./typeform/triggers/newResponseInForm";
// Slice 5.CALENDLY-1 — 2 Calendly webhook-subscription triggers. Each
// registers its activation (POST /webhook_subscriptions with a V2-minted
// signing_key — no creation handshake), shared deactivation
// (DELETE /webhook_subscriptions/{uuid}), and P-S2 subscriber/event-type
// dispatcher filter at module load. Strict-direct-lookup via
// ?workflowId=&nodeId= on the notification URL; events arrive at
// /api/webhooks/calendly. Calendly subscriptions don't expire on a
// schedule — no renewal/subscription-watch marker.
import "./calendly/triggers/eventScheduled";
import "./calendly/triggers/eventCanceled";
// Native-nodes Slice 2 Commit 3 — scheduled_trigger registers its
// native-activation hook at module load. See
// docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md §5.
// manual_trigger has no activation hook so no side-effect import
// needed; the run-now route imports its schema directly.
import "./native/triggers/scheduledTrigger";

/**
 * Aggregated provider registry.
 *
 * Per docs/rules/provider-registry.md:
 *   - Hand-maintained explicit imports. Adding a provider requires adding it
 *     to ALL_MANIFESTS below.
 *   - Every manifest is validated against ProviderManifestSchema at module
 *     load. Build fails on a malformed manifest.
 *   - The exported PROVIDERS object is frozen — no runtime mutation.
 */

const ALL_MANIFESTS: readonly ProviderManifest[] = [
  slackManifest,
  gmailManifest,
  googleCalendarManifest,
  // Slice 3.GDOCS-2 — Google Docs runtime port (5 actions, no
  // triggers). webhookTrigger flips when GDOCS-5 ships Drive
  // files.watch push triggers.
  googleDocsManifest,
  googleDriveManifest,
  googleSheetsManifest,
  microsoftOutlookManifest,
  microsoftOutlookCalendarManifest,
  microsoftOneDriveManifest,
  microsoftOneNoteManifest,
  microsoftExcelManifest,
  microsoftTeamsManifest,
  notionManifest,
  airtableManifest,
  stripeManifest,
  shopifyManifest,
  hubspotManifest,
  githubManifest,
  mailchimpManifest,
  // Slice 3.MONDAY — Monday.com (24 actions + 5 webhook triggers).
  // webhookTrigger flipped true in MONDAY-7 (create_webhook /
  // delete_webhook per-workflow lifecycle).
  mondayManifest,
  trelloManifest,
  // Slice 3.DISCORD-2 — Discord runtime port (actions only). Triggers
  // deferred per Slice 3.DISCORD-1 §2.3 decision D-DC1; manifest
  // declares capabilities.actions=true with webhook+polling=false.
  discordManifest,
  // Slice 3.DROPBOX-2 — Dropbox runtime port (11 actions, no triggers).
  // webhookTrigger flips true in DROPBOX-5 (app-level webhook + per-account
  // cursor model). actions=true; oauth refreshable (token_access_type=offline).
  dropboxManifest,
  // Slice 3.FACEBOOK-2 — Facebook runtime port (8 Pages actions, no
  // triggers). webhookTrigger flips true in FACEBOOK-5 (app-level webhook +
  // per-page subscribed_apps). actions=true; NOT refreshable (long-lived
  // user token, no refresh token). Pages-only scope; Meta App Review gates
  // external GA (Dev-Mode usable now).
  facebookManifest,
  // Slice 3.GOOGLE-ANALYTICS-2 — GA4 runtime port (6 actions, no triggers).
  // Standard refreshable Google OAuth; GA4-only (Data + Admin API +
  // Measurement Protocol). webhookTrigger/pollingTrigger false (triggers
  // deferred — D-GA3). analytics.edit is a sensitive Google scope gated by
  // OAuth app verification (internal launch-readiness, not user-facing).
  googleAnalyticsManifest,
  // Slice 5.ASANA-1 — Asana, the first net-new (no-V1) provider. 5 task
  // actions + 2 project-webhook triggers ship in the same slice, so
  // actions/webhookTrigger are true from day one. Personal credential
  // class; refreshable PKCE OAuth.
  asanaManifest,
  // Slice 5.TYPEFORM-1 — Typeform, the second net-new (no-V1) provider.
  // 1 form-webhook trigger + the typeform:forms option source; ZERO
  // actions this slice (the form_response payload is self-contained), so
  // capabilities.actions is honestly false. Personal credential class;
  // refreshable non-PKCE OAuth with ROTATING refresh tokens (offline
  // scope).
  typeformManifest,
  // Slice 5.CALENDLY-1 — Calendly, the third net-new (no-V1) provider.
  // 2 webhook-subscription triggers + the calendly:event_types option
  // source; ZERO actions this slice (the invitee payload embeds the
  // scheduled_event, so it is self-contained), so capabilities.actions is
  // honestly false. Personal credential class; refreshable PKCE OAuth
  // with Basic-auth token exchange and SINGLE-USE ROTATING refresh
  // tokens.
  calendlyManifest,
];

// Validate every manifest against the schema at module load. parse() throws
// on any malformed manifest; loading any importer of this module fails the
// build with a clear error.
for (const m of ALL_MANIFESTS) {
  ProviderManifestSchema.parse(m);
}

const byId = new Map<string, ProviderManifest>();
for (const m of ALL_MANIFESTS) {
  if (byId.has(m.id)) {
    throw new Error(`Duplicate provider id in registry: ${m.id}`);
  }
  byId.set(m.id, m);
}

export const PROVIDERS: Readonly<Record<string, ProviderManifest>> = Object.freeze(
  Object.fromEntries(byId),
);

export function getProvider(id: string): ProviderManifest | undefined {
  return byId.get(id);
}

export function listProviders(): readonly ProviderManifest[] {
  return ALL_MANIFESTS;
}

export function providerSupports(id: string, capability: ProviderCapability): boolean {
  const m = byId.get(id);
  if (!m) return false;
  return m.capabilities[capability] === true;
}

/**
 * Public SVG icon URL for a provider (Slice 4.BUILDER-INSPECTOR-1).
 *
 * Convention: `/integrations/{providerId}.svg`. Assets live under
 * `public/integrations/` and were ported from V1 in this slice. The
 * mapping intentionally lives here (registry / discovery layer) so the
 * Builder UI never carries per-provider iconography branches.
 *
 * Returns `undefined` for unknown provider ids (i.e. not in the
 * manifest registry). For known providers the URL is returned
 * unconditionally — asset existence is not validated at build time;
 * `WorkflowNodeCard` falls back to its initials avatar via `<img onError>`
 * if a file happens to be missing for a given provider. This lets us
 * ship without per-provider opt-out logic.
 */
export function providerIconUrl(id: string): string | undefined {
  if (!byId.has(id)) return undefined;
  return `/integrations/${id}.svg`;
}
