import {
  type ProviderCapability,
  type ProviderManifest,
  ProviderManifestSchema,
} from "@/contracts/integration";
import { airtableManifest } from "./airtable/manifest";
import { discordManifest } from "./discord/manifest";
import { githubManifest } from "./github/manifest";
import { gmailManifest } from "./gmail/manifest";
import { googleCalendarManifest } from "./google-calendar/manifest";
import { googleDriveManifest } from "./google-drive/manifest";
import { googleSheetsManifest } from "./google-sheets/manifest";
import { microsoftExcelManifest } from "./microsoft-excel/manifest";
import { microsoftOneDriveManifest } from "./microsoft-onedrive/manifest";
import { microsoftOutlookManifest } from "./microsoft-outlook/manifest";
import { microsoftOutlookCalendarManifest } from "./microsoft-outlook-calendar/manifest";
import { microsoftTeamsManifest } from "./microsoft-teams/manifest";
import { hubspotManifest } from "./hubspot/manifest";
import { mailchimpManifest } from "./mailchimp/manifest";
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
  googleDriveManifest,
  googleSheetsManifest,
  microsoftOutlookManifest,
  microsoftOutlookCalendarManifest,
  microsoftOneDriveManifest,
  microsoftExcelManifest,
  microsoftTeamsManifest,
  notionManifest,
  airtableManifest,
  stripeManifest,
  shopifyManifest,
  hubspotManifest,
  githubManifest,
  mailchimpManifest,
  trelloManifest,
  // Slice 3.DISCORD-2 — Discord runtime port (actions only). Triggers
  // deferred per Slice 3.DISCORD-1 §2.3 decision D-DC1; manifest
  // declares capabilities.actions=true with webhook+polling=false.
  discordManifest,
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
