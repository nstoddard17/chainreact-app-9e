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
import { quickbooksManifest } from "./quickbooks/manifest";
import { motiveManifest } from "./motive/manifest";
import { adpManifest } from "./adp/manifest";
import { fleetioManifest } from "./fleetio/manifest";
import { edenManifest } from "./eden/manifest";
import { linearManifest } from "./linear/manifest";
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
import { microsoftPowerBiManifest } from "./microsoft-powerbi/manifest";
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
// Microsoft Power BI — 16 polling triggers. Power BI exposes no author-safe
// outbound webhook for these resources, so everything polls with an
// activation-seeded baseline (first poll after activation fires zero events).
// Each index.ts registers ONLY its activation hook; the single shared
// `microsoftPowerBiPollingHandler` (covering all 16 event types via its
// canHandle predicate) is registered once, by semanticModelRefreshCompleted.
import "./microsoft-powerbi/triggers/semanticModelRefreshCompleted";
import "./microsoft-powerbi/triggers/semanticModelRefreshFailed";
import "./microsoft-powerbi/triggers/semanticModelRefreshCanceled";
import "./microsoft-powerbi/triggers/dataflowRefreshCompleted";
import "./microsoft-powerbi/triggers/dataflowRefreshFailed";
import "./microsoft-powerbi/triggers/dataflowRefreshCanceled";
import "./microsoft-powerbi/triggers/importCompleted";
import "./microsoft-powerbi/triggers/importFailed";
import "./microsoft-powerbi/triggers/pipelineDeploymentCompleted";
import "./microsoft-powerbi/triggers/pipelineDeploymentFailed";
import "./microsoft-powerbi/triggers/daxConditionMet";
import "./microsoft-powerbi/triggers/daxQueryResultChanged";
import "./microsoft-powerbi/triggers/gatewayDatasourceStatusChanged";
import "./microsoft-powerbi/triggers/workspaceItemAdded";
import "./microsoft-powerbi/triggers/workspaceItemRemoved";
import "./microsoft-powerbi/triggers/workspaceAccessChanged";
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
// Slice 5.ASANA-1 + ASANA-2 — 5 Asana project-webhook triggers. Each
// registers its activation (POST /webhooks + X-Hook-Secret handshake
// persistence), deactivation (DELETE /webhooks/{gid}), and P-S2 projectId
// dispatcher filter at module load. Strict-direct-lookup via
// ?workflowId=&nodeId= on the notification URL; events arrive at
// /api/webhooks/asana. Asana webhooks don't expire on a schedule — no
// renewal/subscription-watch marker (Asana deletes them itself after 24h
// of failed deliveries). The 3 ASANA-2 triggers add server-side field/
// subtype filters + receive-time post-fetch gates.
import "./asana/triggers/newTaskInProject";
import "./asana/triggers/taskUpdatedInProject";
import "./asana/triggers/taskCompleted";
import "./asana/triggers/taskAssigned";
import "./asana/triggers/commentAddedToTask";
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
// QUICKBOOKS-1 — 4 QuickBooks triggers on Intuit's APP-LEVEL webhook (one
// endpoint + entity checklist configured once per app in the Intuit
// portal; NO per-workflow provider webhooks). Each registers its
// activation (validates the integration and stores an internal
// trigger-interest row config patch { appLevelWebhook, realmId } — no
// provider call), a no-op deactivation (removing the trigger_resources
// row IS the interest removal), and a fail-closed P-S2 realmId filter at
// module load. Events arrive at /api/webhooks/quickbooks and fan out by
// (realmId, entity, operation) with post-fetch enrichment. Intuit
// webhooks don't expire — no renewal/subscription-watch marker.
import "./quickbooks/triggers/customerCreated";
import "./quickbooks/triggers/invoiceCreated";
import "./quickbooks/triggers/paymentReceived";
import "./quickbooks/triggers/invoicePaid";
// MOTIVE-1 — 7 Motive company-webhook triggers + 1 fuel-purchase polling
// trigger. Each webhook trigger registers its activation (POST
// /v1/company_webhooks with a V2-minted 20-char secret — no creation
// handshake), shared deactivation (DELETE /v1/company_webhooks/{id}), and a
// P-S2 companyId filter at module load. Strict-direct-lookup via
// ?workflowId=&nodeId=; events arrive at /api/webhooks/motive and are verified
// with X-KT-Webhook-Signature (HMAC-SHA1). Motive webhooks don't expire — no
// renewal marker. new_fuel_purchase polls (no fuel webhook exists) with an
// activation-seeded id high-water (first-poll-miss protection).
import "./motive/triggers/newInspectionReport";
import "./motive/triggers/newHosViolation";
import "./motive/triggers/newSafetyEvent";
import "./motive/triggers/newSpeedingEvent";
import "./motive/triggers/newFaultCode";
import "./motive/triggers/newVehicle";
import "./motive/triggers/newDriver";
import "./motive/triggers/newFuelPurchase";
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
  microsoftPowerBiManifest,
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
  // QUICKBOOKS-1 — QuickBooks Online, the fourth net-new (no-V1)
  // provider. 7 bounded actions + 4 app-level-webhook triggers + 5 option
  // sources ship in the same slice, so actions/webhookTrigger are true
  // from day one. ACCOUNT credential class (a company's books — the
  // Stripe/Shopify posture); refreshable non-PKCE OAuth with Basic-auth
  // token exchange and ~daily-ROTATING refresh tokens on a rolling
  // 100-day window; realmId (company id) arrives only on the OAuth
  // callback redirect and is the providerAccountId.
  quickbooksManifest,
  // MOTIVE-1 — Motive (gomotive.com, formerly KeepTruckin), a fleet-management /
  // telematics provider. 10 bounded actions (fuel CRUD + bulk CSV import + send
  // message + create/update vehicle + update driver) + 7 company-webhook
  // triggers + 1 fuel-purchase polling trigger + 2 option sources ship in the
  // same slice, so actions/webhookTrigger/pollingTrigger are all true from day
  // one. ACCOUNT credential class (a company's fleet — the Stripe/QuickBooks
  // posture); refreshable non-PKCE OAuth with body-auth token exchange and
  // SINGLE-USE ROTATING refresh tokens; companyId (read from /v1/companies) is
  // the providerAccountId + webhook fan-out scope.
  motiveManifest,
  // EDEN-3 — Eden (eden.so), a content-research / boards / creator-analysis /
  // social-scheduling platform whose ONLY automation surface is a remote MCP
  // server (https://mcp.eden.so/mcp). NEW `token_paste` auth (pasted `eden_pat_`).
  // Connect-only for now: capabilities.oauth true, actions/triggers honestly
  // false — every action's schema depends on the LIVE MCP tools/list capture,
  // blocked until an authorized eden_pat_ credential is supplied. isExperimental
  // true (hidden from the default Apps catalog) until Phase 13 live certification.
  edenManifest,
  // CS-1 MCP-AUTH — Linear (linear.app), the first MCP-CATALOG app (approved
  // plan: docs/slices/phase-5/mcp-integration-layer-architecture-plan.md).
  // Connect-only this slice: capabilities.oauth true via the shared MCP OAuth
  // helper in static-endpoint mode (regular Linear OAuth; Bearer accepted by
  // mcp.linear.app per vendor docs); actions/triggers honestly false until the
  // compiler + executor slices (CS-2/CS-3) register typed handlers.
  // isExperimental true until live certification (CS-6).
  linearManifest,
  // ADP (adp.com) — payroll / HR / workforce platform. NEW `machine_credentials`
  // auth (OAuth2 client_credentials + mandatory mutual-TLS client certificate),
  // handled by services/machineCredentials/* (NOT the OAuth dispatcher). Shipped
  // DISABLED (isEnabled:false) + all capabilities false: the auth/transport/
  // webhook-verify FOUNDATION is code-complete + tested, but ADP API access is
  // gated on ADP Marketplace partnership / API Central + an ADP-issued WS cert +
  // sandbox + security certification, and the typed action/trigger catalog awaits
  // sandbox verification of ADP's exact request/response shapes (no fabrication).
  // See docs/providers/adp/owner-report.md.
  adpManifest,
  // FLEETIO-1 — Fleetio (fleetio.com), fleet MAINTENANCE management (work
  // orders / DVIR inspections / service reminders / fuel + meter entries) —
  // the maintenance-side counterpart to Motive. NEW `credential_paste` auth
  // (user enters API key + Account-Token into the shared V2 credential form;
  // verified via GET /accounts; API version pinned 2025-05-05). Connect-only
  // this slice: capabilities.oauth true; actions/triggers honestly false until
  // Slice 2+ registers typed handlers. ACCOUNT credential class (a company's
  // fleet — the Motive/QuickBooks posture). isExperimental true until the
  // post-owner-setup live certification pass.
  fleetioManifest,
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
