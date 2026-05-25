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

// Monday.com resolvers — Slice 3.MONDAY-3.
//   - `monday:boards` — account-scoped top-level board picker. Backs
//     the `boardId` cascade root on every Monday action meta
//     (MONDAY-4). Sorted alphabetically by label client-side.
//   - `monday:groups` (depends on `boardId`) — groups within a board.
//     Backs the `groupId` field on `create_item` / `move_item`.
//   - `monday:columns` (depends on `boardId`) — board columns. Backs
//     the `columnId` field on `update_item`. Description carries the
//     column type as a UX hint (the column-aware value editor is
//     future polish — D-MON7).
//   - `monday:items` (depends on `boardId`) — items in the board.
//     Single page of 100 with `hasMore: cursor !== null`. Backs
//     `itemId` / `parentItemId` cascade fields.
//   - `monday:file_columns` (depends on `boardId`) — file-typed
//     columns PLUS the V1-preserved virtual `__item_files__`
//     sentinel. Sentinel value is preserved EXACTLY — workflow
//     authors who configured V1's `add_file` for it would break
//     otherwise.
//   - `monday:users` — account-scoped user picker. Backs future
//     column-aware assignee fields.
//
// Resolvers ship resolver-first per the standard MONDAY-2 → MONDAY-3
// → MONDAY-4 order. Monday stays OUT of `COVERED_PROVIDERS` until
// MONDAY-4 ActionMeta lands.
//
// Dep names preserved verbatim from V1 (camelCase): `boardId` (NOT
// `board_id`). Matches the MONDAY-2 Zod schemas.
import { mondayBoardsResolver } from "@/integrations/monday/options/boards";
import { mondayGroupsResolver } from "@/integrations/monday/options/groups";
import { mondayColumnsResolver } from "@/integrations/monday/options/columns";
import { mondayItemsResolver } from "@/integrations/monday/options/items";
import { mondayFileColumnsResolver } from "@/integrations/monday/options/fileColumns";
import { mondayUsersResolver } from "@/integrations/monday/options/users";
// Slice 3.MONDAY-5 — `monday:item_files` (deps itemId + columnId). The
// single resolver gap the MONDAY-5 audit found: backs the optional
// `fileId` picker on `download_file`. The other 23 actions' picker
// fields are covered by the 6 MONDAY-3 resolvers above (or are static
// enums / free text).
import { mondayItemFilesResolver } from "@/integrations/monday/options/itemFiles";

// Dropbox resolvers — Slice 3.DROPBOX-3 (resolver-first ahead of
// DROPBOX-4 action metas). Both are path-based (Dropbox D-DB6 — no
// synthetic ids):
//   - `dropbox:folders` — account-scoped recursive folder picker (no
//     deps). Prepends a synthetic Root option (value ""). Backs the
//     destination-folder fields + the UI-scope folder parent for the
//     files cascade. Single bounded page; sorted alphabetically.
//   - `dropbox:files` (depends on `folderPath`) — files inside the
//     selected folder. Dep VALUE is the parent folder path, NOT a
//     synthetic folderId; dep NAME is `folderPath` (DROPBOX-4) so it
//     doesn't collide with the leaf file field `path`/`fromPath` on the
//     action metas (the builder keys deps by parent field name).
//     NotFoundError → empty items (cascade fallback). Note: the options
//     route drops empty deps, so the Dropbox root ("") can't be the
//     parent — root files are typed directly; the picker covers nested
//     folders.
// Both reuse the DROPBOX-2 `filesListFolder` wrapper; no new transport.
import { dropboxFoldersResolver } from "@/integrations/dropbox/options/folders";
import { dropboxFilesResolver } from "@/integrations/dropbox/options/files";

// Facebook resolvers — Slice 3.FACEBOOK-3 (resolver-first ahead of the
// FACEBOOK-4 action metas). The accepted surface is 4 resolvers; the V1
// `facebook_groups` + `facebook_monetization_eligibility` resolvers are
// REJECTED (no in-scope action consumes them; group publishing is
// Graph-deprecated) and intentionally NOT registered.
//   - `facebook:pages` — account-scoped Page picker (no deps). The cascade
//     root every Facebook action's `pageId` hangs off (`GET /me/accounts`,
//     same call as the runtime page-token derivation).
//   - `facebook:posts` (depends on `pageId`) — recent Page posts. Backs the
//     `postId` field on `comment_on_post` / `update_post` / `delete_post`.
//   - `facebook:albums` (depends on `pageId`) — Page photo albums.
//     Forward-looking: the `upload_photo` album field is a deferred
//     FACEBOOK-2 follow-up; the resolver ships now as accepted surface.
//   - `facebook:conversations` (depends on `pageId`) — Messenger
//     conversations. Backs `send_message.recipientId`; value is
//     `conversationId:psid` (the shape the FACEBOOK-2 handler splits).
//
// Dep name `pageId` is preserved verbatim (matches the FACEBOOK-2 Zod
// schemas — NOT snake_case `page_id`). Page-scoped resolvers derive the Page
// token at runtime (`getPageAccessToken`); no Page token is ever stored or
// surfaced. Facebook stays OUT of `COVERED_PROVIDERS` until FACEBOOK-4
// action metas land.
import { facebookPagesResolver } from "@/integrations/facebook/options/pages";
import { facebookPostsResolver } from "@/integrations/facebook/options/posts";
import { facebookAlbumsResolver } from "@/integrations/facebook/options/albums";
import { facebookConversationsResolver } from "@/integrations/facebook/options/conversations";

// Google Analytics (GA4) resolvers — Slice 3.GOOGLE-ANALYTICS-3
// (resolver-first ahead of the GA-4 action metas). The accepted surface is
// 4 resolvers; NO measurement-secret resolver and NO Universal Analytics
// resolvers are registered (D-GA1 audit).
//   - `google-analytics:accounts` — account picker (no deps; Admin API
//     `accountSummaries.list`). Cascade root for `:properties`.
//   - `google-analytics:properties` (depends on `accountId`) — GA4 properties
//     under the account (derived from the same accountSummaries call). Backs
//     `propertyId` on every GA action.
//   - `google-analytics:data_streams` (depends on `propertyId`) — WEB data
//     streams; value is the `measurementId` (G-XXXX) for `send_event`. The
//     Measurement Protocol api_secret is NEVER read or surfaced.
//   - `google-analytics:conversion_events` (depends on `propertyId`) — backs
//     `find_conversion.conversionEventName` (reuses the GA-2 wrapper).
//
// Dep names `accountId` / `propertyId` are preserved verbatim (match the
// GA-2 Zod schemas). Google Analytics stays OUT of `COVERED_PROVIDERS` until
// GA-4 action metas land.
import { googleAnalyticsAccountsResolver } from "@/integrations/google-analytics/options/accounts";
import { googleAnalyticsPropertiesResolver } from "@/integrations/google-analytics/options/properties";
import { googleAnalyticsDataStreamsResolver } from "@/integrations/google-analytics/options/dataStreams";
import { googleAnalyticsConversionEventsResolver } from "@/integrations/google-analytics/options/conversionEvents";

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
  // Slice 3.MONDAY-3 — 6 Monday.com options resolvers (resolver-first
  // ahead of MONDAY-4 action metas). Dep names preserved verbatim from
  // V1 (`boardId` — camelCase, NOT snake_case). `monday:file_columns`
  // preserves the V1 virtual `__item_files__` sentinel exactly.
  mondayBoardsResolver,
  mondayGroupsResolver,
  mondayColumnsResolver,
  mondayItemsResolver,
  mondayFileColumnsResolver,
  mondayUsersResolver,
  // Slice 3.MONDAY-5 — download_file fileId picker (deps itemId + columnId).
  mondayItemFilesResolver,
  // Slice 3.DROPBOX-3 — 2 Dropbox path-based resolvers (resolver-first
  // ahead of DROPBOX-4 action metas). `dropbox:files` deps on `folderPath`
  // (the parent folder path; Dropbox is path-based, no synthetic ids; dep
  // renamed from `path` in DROPBOX-4 so it doesn't collide with the leaf
  // file field).
  dropboxFoldersResolver,
  dropboxFilesResolver,
  // Slice 3.FACEBOOK-3 — 4 Facebook options resolvers (resolver-first ahead
  // of FACEBOOK-4 action metas). Dep name `pageId` preserved verbatim. The
  // rejected V1 `facebook_groups` / `facebook_monetization_eligibility`
  // resolvers are intentionally absent.
  facebookPagesResolver,
  facebookPostsResolver,
  facebookAlbumsResolver,
  facebookConversationsResolver,
  // Slice 3.GOOGLE-ANALYTICS-3 — 4 GA4 resolvers (resolver-first ahead of
  // GA-4 action metas). Dep names `accountId` / `propertyId` preserved
  // verbatim. No measurement-secret / Universal-Analytics resolvers.
  googleAnalyticsAccountsResolver,
  googleAnalyticsPropertiesResolver,
  googleAnalyticsDataStreamsResolver,
  googleAnalyticsConversionEventsResolver,
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
