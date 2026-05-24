import {
  OPTIONS_SOURCE_KEY_REGEX,
  type OptionsResolver,
} from "./types";

// Fixture resolver (Slice 3.30). Stays registered so smoke / route /
// integration tests have a provider-mock-free baseline.
import { nativeExamplesResolver } from "./fixtures/nativeExamples";

// First real provider resolver — Slice 3.32 (Slack channels picker for
// `slack:upload_file.channel`).
import { slackChannelsResolver } from "@/integrations/slack/options/channels";

// Google Sheets resolvers — Slice 3.GSHEETS-2.
// `spreadsheets` enumerates the connected user's spreadsheets via
// Drive's `files.list` (requires `drive.metadata.readonly` scope —
// added to the google-sheets manifest in the same slice). `sheets`
// enumerates the worksheets/tabs of a selected spreadsheet via Sheets'
// `spreadsheets.get?includeGridData=false`; depends on spreadsheetId.
// Together they back the two-hop cascade documented in
// docs/slices/phase-3/google-sheets-action-metadata-plan.md §4.
import { googleSheetsSpreadsheetsResolver } from "@/integrations/google-sheets/options/spreadsheets";
import { googleSheetsSheetsResolver } from "@/integrations/google-sheets/options/sheets";

// HubSpot resolvers — Slice 3.HUBSPOT-2.
//   - `hubspot:owners` — backs the `hubspot_owner_id` field across 8
//     create/update actions and engagements.
//   - `hubspot:deal_pipelines` → `hubspot:deal_stages` (depends on
//     `pipeline`) — the canonical pipeline → stage cascade for
//     `create_deal` / `update_deal`.
//   - `hubspot:ticket_pipelines` → `hubspot:ticket_stages` (depends on
//     `hs_pipeline`) — same cascade shape against ticket pipelines for
//     `create_ticket` / `update_ticket`.
//   - `hubspot:lists` — backs `listId` on `add_contact_to_list` and
//     `remove_from_list`. Surfaces `processingType` (MANUAL vs
//     DYNAMIC) on the option description so authors don't accidentally
//     target a dynamic list (which the membership APIs reject).
//
// All five core resolvers are read-only against scopes already in the
// 18-scope HubSpot manifest; no reconnect required.
import { hubspotOwnersResolver } from "@/integrations/hubspot/options/owners";
import { hubspotDealPipelinesResolver } from "@/integrations/hubspot/options/dealPipelines";
import { hubspotDealStagesResolver } from "@/integrations/hubspot/options/dealStages";
import { hubspotTicketPipelinesResolver } from "@/integrations/hubspot/options/ticketPipelines";
import { hubspotTicketStagesResolver } from "@/integrations/hubspot/options/ticketStages";
import { hubspotListsResolver } from "@/integrations/hubspot/options/lists";

// Mailchimp resolvers — Slice 3.MAILCHIMP-2.
//   - `mailchimp:audiences` — backs the audience / list picker across
//     the Mailchimp action + trigger surface (account-scoped, no deps).
//   - `mailchimp:campaigns` — backs the `campaignId` picker on
//     `get_campaign` / `get_campaign_stats` actions + `email_opened` /
//     `link_clicked` trigger filters (account-scoped, no deps).
//   - `mailchimp:segments` (depends on `listId`) — backs the
//     `segmentId` picker on `segment_updated` /
//     `subscriber_added_to_segment` triggers. Dep name is `listId`
//     because the two existing consumer trigger schemas both use
//     `listId` as the parent field — see the resolver file's header
//     for the field-name-variance discussion.
//
// Resolvers ship resolver-first ahead of MAILCHIMP-3 / MAILCHIMP-4
// metas. Mailchimp stays OUT of `COVERED_PROVIDERS` until those land.
// All three resolvers are read-only against the single
// `account_access` scope already in the Mailchimp manifest — no
// reconnect required.
import { mailchimpAudiencesResolver } from "@/integrations/mailchimp/options/audiences";
import { mailchimpCampaignsResolver } from "@/integrations/mailchimp/options/campaigns";
import { mailchimpSegmentsResolver } from "@/integrations/mailchimp/options/segments";

// Discord resolvers — Slice 3.DISCORD-3.
//   - `discord:guilds` — bot's guild list (no deps; top-level picker
//     for every Discord action's `guildId`).
//   - `discord:channels` (depends on `guildId`) — text-shaped channels
//     in the selected guild. Backs `channelId` on all 4 message actions.
//   - `discord:members` (depends on `guildId`) — guild member list.
//     Backs `userId` on `assign_role`, `userIds[]` on `delete_message`,
//     `filterAuthor` on `fetch_messages`.
//   - `discord:bot_messages` (depends on `channelId`) — channel's last
//     100 messages filtered to bot-authored only. Backs the future
//     `edit_message.messageId` picker (Discord only allows editing
//     bot-authored messages — D-DC2 two-resolver split).
//   - `discord:messages` (depends on `channelId`) — channel's last 100
//     messages, unfiltered. Backs the future `delete_message.messageIds`
//     picker (bot with Manage Messages can delete any message).
//   - `discord:roles` (depends on `guildId`) — assignable roles, with
//     @everyone + managed roles filtered out. Backs `roleId` on
//     `assign_role`. Hierarchy filtering documented-but-deferred (see
//     roles.ts header).
//
// Resolvers ship resolver-first ahead of the future DISCORD-4 action
// meta layer. Discord stays OUT of `COVERED_PROVIDERS` until those
// metas land. All resolvers authenticate as the global env
// `DISCORD_BOT_TOKEN`; per-user OAuth tokens are not used at resolver
// time (same model as Discord action handlers).
import { discordBotMessagesResolver } from "@/integrations/discord/options/botMessages";
import { discordChannelsResolver } from "@/integrations/discord/options/channels";
import { discordGuildsResolver } from "@/integrations/discord/options/guilds";
import { discordMembersResolver } from "@/integrations/discord/options/members";
import { discordMessagesResolver } from "@/integrations/discord/options/messages";
import { discordRolesResolver } from "@/integrations/discord/options/roles";

// Google Docs / Drive options resolvers — Slice 3.GDOCS-3.
//   - `google-docs:documents` — backs the `documentId` picker on the
//     four document-targeted Google Docs actions (`update_document`,
//     `share_document`, `get_document`, `export_document`). Drive
//     files.list filtered by Docs mimeType, sorted by modifiedTime
//     desc, single-page 200 items.
//   - `google-drive:folders` — account-scoped Drive folder picker.
//     Intentionally cross-product (lives under `google-drive/options/`)
//     so future Google Workspace metadata surfaces (Drive's own
//     actions, Sheets / Docs / Slides create-into-folder pickers) can
//     reuse the same resolver key. Drive files.list filtered by
//     folder mimeType, sorted alphabetically, single-page 200 items.
//
// Both resolvers share the extended `integrations/google-drive/api/
// filesList.ts` wrapper (this slice added optional `mimeType` +
// `orderBy` inputs to that wrapper rather than duplicating Drive list
// scaffolding per provider tree). Resolver-first ahead of GDOCS-4
// action metas; Google Docs stays OUT of `COVERED_PROVIDERS` until
// those land.
import { googleDocsDocumentsResolver } from "@/integrations/google-docs/options/documents";
import { googleDriveFoldersResolver } from "@/integrations/google-drive/options/folders";

// Microsoft OneNote resolvers — Slice 3.ONENOTE-3.
//   - `microsoft-onenote:notebooks` — account-scoped notebook picker
//     (no deps). Top-level picker that future notebook-targeted action
//     metas (`create_section`, `get_notebook_details`, plus the
//     `notebookId` step in `create_page` / `create_notebook` UX) hang
//     off of. Sorted alphabetically by displayName via Graph
//     `$orderby`.
//   - `microsoft-onenote:sections` (depends on `notebookId`) — sections
//     within the selected notebook. Backs `sectionId` on
//     `create_page`, `get_section_details`, `list_pages` and the
//     future `copy_page.targetSectionId` / `sourceSectionId` fields.
//     Sorted alphabetically by displayName.
//   - `microsoft-onenote:pages` (depends on `sectionId`) — pages in
//     the selected section. Backs `pageId` on `update_page`,
//     `get_page_content`, `delete_page` and the future
//     `copy_page.sourcePageId` field. Sorted by lastModifiedDateTime
//     desc (workflow authors usually want the most-recently-edited
//     page).
//
// Resolvers ship resolver-first ahead of ONENOTE-4 action metas.
// OneNote stays OUT of `COVERED_PROVIDERS` until those land. Dep
// names preserved verbatim from the ONENOTE-2 Zod schemas:
// `notebookId` / `sectionId` (camelCase, NOT snake_case).
//
// First Microsoft Graph options resolvers — patterns established
// here (PAGE_SIZE=100, nextLink → hasMore, NotFoundError → empty
// items cascade fallback) become the template for future Microsoft
// provider option surfaces (Outlook folders, OneDrive folders,
// Calendar pickers, etc.).
import { microsoftOneNoteNotebooksResolver } from "@/integrations/microsoft-onenote/options/notebooks";
import { microsoftOneNoteSectionsResolver } from "@/integrations/microsoft-onenote/options/sections";
import { microsoftOneNotePagesResolver } from "@/integrations/microsoft-onenote/options/pages";

/**
 * Hand-maintained options-source resolver registry.
 *
 * Plan reference: docs/slices/phase-3/options-source-plan.md §5.
 *
 * Discipline mirrors `services/discovery/_registry.ts`:
 *   - Explicit imports surface in PRs — adding a resolver means
 *     adding the import + an entry in `ALL_RESOLVERS`.
 *   - Module-load validation:
 *     - Every `source` matches the `<provider>:<resource>` regex.
 *     - Duplicate sources throw at module load with a clear error.
 *   - The exported lookup map is frozen — no runtime mutation.
 *
 * Why hand-maintained rather than glob-style auto-discovery:
 *   - Reviewers scan the diff to see exactly which resolvers a slice
 *     covers; no implicit auto-registration.
 *   - Resolver placement is colocated under each provider tree
 *     (`integrations/<provider>/options/<resource>.ts`) — the central
 *     registry is the audit surface, not the discovery mechanism.
 *
 * Server-only — never imported by client code. The structural test
 * at `tests/structure/client-server-boundary.test.ts` catches any
 * non-type-only import of `@/services/options/...` from
 * `features/` / `components/` / `lib/api/` / `stores/`.
 */

export const ALL_OPTIONS_RESOLVERS: ReadonlyArray<OptionsResolver> = [
  nativeExamplesResolver,
  slackChannelsResolver,
  googleSheetsSpreadsheetsResolver,
  googleSheetsSheetsResolver,
  // HubSpot (Slice 3.HUBSPOT-2). Resolver-first ahead of HubSpot
  // metadata batches (HUBSPOT-3..6); 17 of the 26 HubSpot mutation /
  // read metas consume at least one of these resolvers.
  hubspotOwnersResolver,
  hubspotDealPipelinesResolver,
  hubspotDealStagesResolver,
  hubspotTicketPipelinesResolver,
  hubspotTicketStagesResolver,
  hubspotListsResolver,
  // Mailchimp (Slice 3.MAILCHIMP-2). Resolver-first ahead of
  // MAILCHIMP-3 (12 action metas) + MAILCHIMP-4 (2 campaign-read
  // metas + 7 trigger metas + COVERED_PROVIDERS flip).
  mailchimpAudiencesResolver,
  mailchimpCampaignsResolver,
  mailchimpSegmentsResolver,
  // Slice 3.DISCORD-3 — 6 Discord resolvers (resolver-first ahead of
  // DISCORD-4 action metas). Dep names preserved verbatim from V1
  // (`guildId`, `channelId` — camelCase, NOT snake_case).
  discordGuildsResolver,
  discordChannelsResolver,
  discordMembersResolver,
  discordBotMessagesResolver,
  discordMessagesResolver,
  discordRolesResolver,
  // Slice 3.GDOCS-3 — Google Docs + Google Drive options resolvers
  // (resolver-first ahead of GDOCS-4 action metas). Both share the
  // extended google-drive filesList wrapper.
  googleDocsDocumentsResolver,
  googleDriveFoldersResolver,
  // Slice 3.ONENOTE-3 — Microsoft OneNote options resolvers
  // (resolver-first ahead of ONENOTE-4 action metas). First Microsoft
  // Graph options resolvers; pattern: PAGE_SIZE=100, nextLink →
  // hasMore, NotFoundError → empty items cascade fallback. Dep names
  // (`notebookId`, `sectionId`) match the ONENOTE-2 Zod schemas
  // verbatim.
  microsoftOneNoteNotebooksResolver,
  microsoftOneNoteSectionsResolver,
  microsoftOneNotePagesResolver,
];

// Module-load validation. Throws synchronously so any importer of this
// module fails the build with a clear message rather than a runtime
// surprise on the first request.
const resolverBySource: ReadonlyMap<string, OptionsResolver> = (() => {
  const m = new Map<string, OptionsResolver>();
  for (const r of ALL_OPTIONS_RESOLVERS) {
    if (!OPTIONS_SOURCE_KEY_REGEX.test(r.source)) {
      throw new Error(
        `Options resolver source '${r.source}' does not match <provider>:<resource> regex.`,
      );
    }
    const expected = `${r.provider}:`;
    if (!r.source.startsWith(expected)) {
      throw new Error(
        `Options resolver source '${r.source}' does not start with declared provider '${r.provider}'.`,
      );
    }
    if (m.has(r.source)) {
      throw new Error(
        `Duplicate options resolver registered for source '${r.source}'.`,
      );
    }
    m.set(r.source, r);
  }
  return m;
})();

/**
 * Look up a resolver by its `source` key. Returns `undefined` when
 * the source isn't registered — the route maps that to a
 * `SOURCE_NOT_FOUND` response.
 */
export function getOptionsResolver(source: string): OptionsResolver | undefined {
  return resolverBySource.get(source);
}

/**
 * Stable, deterministic list of all registered resolvers, sorted by
 * `source`. Exposed primarily so structural / registry tests can
 * assert coverage shape without relying on an `Object.entries`-style
 * iteration order; also useful when the future admin tooling lists
 * known sources.
 */
export function listOptionsResolvers(): ReadonlyArray<OptionsResolver> {
  return [...resolverBySource.values()].sort((a, b) =>
    a.source < b.source ? -1 : a.source > b.source ? 1 : 0,
  );
}
