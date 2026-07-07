/**
 * Hand-maintained inventory of every ActionMeta + TriggerMeta the V2 discovery
 * registry surfaces. Extracted from `_registry.ts` (max-lines lint cleanup,
 * AI-28 follow-up). The split is data-only: lookups, schema validation, sort
 * helpers, and the public `listActionMetasForProvider` / `getActionMeta` /
 * etc. APIs all stay in `_registry.ts`.
 *
 * Adding a new action / trigger meta still means: add the import below, add
 * the entry to the right array, ship a PR. Reviewer scans the diff to see
 * exactly which providers a slice covers — no implicit auto-discovery.
 *
 * Underscore-prefixed module name = internal sibling; consumers continue to
 * import the public surface from `_registry.ts` only.
 */
import { type ActionMeta } from "@/contracts/actionMeta";
import { type TriggerMeta } from "@/contracts/triggerMeta";

// Native action metadata (Slice 3.0 coverage scope).
import { httpRequestMeta } from "@/integrations/native/actions/httpRequest.meta";
import { formatTransformerMeta } from "@/integrations/native/actions/formatTransformer.meta";
import { delayMeta } from "@/integrations/native/actions/delay.meta";
import { ifThenConditionMeta } from "@/integrations/native/actions/ifThenCondition.meta";
import { routerMeta } from "@/integrations/native/actions/router.meta";

// Native trigger metadata.
import { manualTriggerMeta } from "@/integrations/native/triggers/manualTrigger.meta";
import { scheduledTriggerMeta } from "@/integrations/native/triggers/scheduledTrigger.meta";

// GitHub action metadata (Slice 3.0b coverage scope).
import { createIssueMeta } from "@/integrations/github/actions/createIssue.meta";
import { createRepositoryMeta } from "@/integrations/github/actions/createRepository.meta";
import { createPullRequestMeta } from "@/integrations/github/actions/createPullRequest.meta";
import { createBranchMeta } from "@/integrations/github/actions/createBranch.meta";
import { createGistMeta } from "@/integrations/github/actions/createGist.meta";
import { addCommentMeta } from "@/integrations/github/actions/addComment.meta";

// Microsoft Outlook Mail action metadata (Slice 3.17 coverage scope).
import { outlookSendEmailMeta } from "@/integrations/microsoft-outlook/actions/sendEmail.meta";
import { outlookReplyToEmailMeta } from "@/integrations/microsoft-outlook/actions/replyToEmail.meta";
import { outlookForwardEmailMeta } from "@/integrations/microsoft-outlook/actions/forwardEmail.meta";
import { outlookCreateDraftEmailMeta } from "@/integrations/microsoft-outlook/actions/createDraftEmail.meta";
import { outlookFetchEmailsMeta } from "@/integrations/microsoft-outlook/actions/fetchEmails.meta";
import { outlookGetAttachmentMeta } from "@/integrations/microsoft-outlook/actions/getAttachment.meta";
import { outlookAddCategoriesMeta } from "@/integrations/microsoft-outlook/actions/addCategories.meta";
import { outlookMoveEmailMeta } from "@/integrations/microsoft-outlook/actions/moveEmail.meta";
import { outlookDeleteEmailMeta } from "@/integrations/microsoft-outlook/actions/deleteEmail.meta";
import { outlookListFoldersMeta } from "@/integrations/microsoft-outlook/actions/listFolders.meta";
import { outlookGetProfileMeta } from "@/integrations/microsoft-outlook/actions/getProfile.meta";

// Microsoft Outlook Mail trigger metadata (Slice 3.17 coverage scope).
import { outlookNewEmailTriggerMeta } from "@/integrations/microsoft-outlook/triggers/newEmail/newEmail.meta";
import { outlookEmailSentTriggerMeta } from "@/integrations/microsoft-outlook/triggers/emailSent/emailSent.meta";
import { outlookEmailFlaggedTriggerMeta } from "@/integrations/microsoft-outlook/triggers/emailFlagged/emailFlagged.meta";

// Gmail action metadata (Slice 3.15 coverage scope).
import { sendEmailMeta } from "@/integrations/gmail/actions/sendEmail.meta";
import { replyToEmailMeta } from "@/integrations/gmail/actions/replyToEmail.meta";
import { createDraftMeta } from "@/integrations/gmail/actions/createDraft.meta";
import { createDraftReplyMeta } from "@/integrations/gmail/actions/createDraftReply.meta";
import { searchEmailsMeta } from "@/integrations/gmail/actions/searchEmails.meta";
import { getAttachmentMeta } from "@/integrations/gmail/actions/getAttachment.meta";
import { addLabelMeta } from "@/integrations/gmail/actions/addLabel.meta";
import { removeLabelMeta } from "@/integrations/gmail/actions/removeLabel.meta";
import { createLabelMeta } from "@/integrations/gmail/actions/createLabel.meta";
import { markAsReadMeta } from "@/integrations/gmail/actions/markAsRead.meta";
import { markAsUnreadMeta } from "@/integrations/gmail/actions/markAsUnread.meta";
import { archiveEmailMeta } from "@/integrations/gmail/actions/archiveEmail.meta";
import { deleteEmailMeta } from "@/integrations/gmail/actions/deleteEmail.meta";
import { listLabelsMeta } from "@/integrations/gmail/actions/listLabels.meta";
import { getProfileMeta } from "@/integrations/gmail/actions/getProfile.meta";

// GitHub trigger metadata.
import { newCommitTriggerMeta } from "@/integrations/github/triggers/newCommit/newCommit.meta";

// Gmail trigger metadata (Slice 3.12 coverage scope).
import { newEmailTriggerMeta } from "@/integrations/gmail/triggers/newEmail/newEmail.meta";
import { newLabeledEmailTriggerMeta } from "@/integrations/gmail/triggers/newLabeledEmail/newLabeledEmail.meta";
import { newAttachmentTriggerMeta } from "@/integrations/gmail/triggers/newAttachment/newAttachment.meta";

// Slack action metadata (Slice 3.26 + 3.27 + 3.35 — partial coverage:
// file actions + messaging Group A; Slack remains intentionally absent
// from COVERED_PROVIDERS in
// tests/structure/discovery-meta-coverage.test.ts until every Slack
// runtime handler has a meta — the channels / reactions / users /
// block-kit surfaces are still pending).
import { slackDownloadFileMeta } from "@/integrations/slack/actions/files/downloadFile.meta";
import { slackUploadFileMeta } from "@/integrations/slack/actions/files/uploadFile.meta";
// Slice 3.35 — Slack messaging Group A.
import { slackSendChannelMessageMeta } from "@/integrations/slack/actions/sendChannelMessage.meta";
import { slackSendDirectMessageMeta } from "@/integrations/slack/actions/sendDirectMessage.meta";
import { slackUpdateMessageMeta } from "@/integrations/slack/actions/updateMessage.meta";
import { slackDeleteMessageMeta } from "@/integrations/slack/actions/deleteMessage.meta";
import { slackGetMessagesMeta } from "@/integrations/slack/actions/getMessages.meta";
import { slackGetThreadMessagesMeta } from "@/integrations/slack/actions/getThreadMessages.meta";
import { slackScheduleMessageMeta } from "@/integrations/slack/actions/scheduleMessage.meta";
import { slackCancelScheduledMessageMeta } from "@/integrations/slack/actions/cancelScheduledMessage.meta";
// Slice 3.36 — Slack reactions / pins / list_scheduled_messages (Group B).
import { slackAddReactionMeta } from "@/integrations/slack/actions/addReaction.meta";
import { slackRemoveReactionMeta } from "@/integrations/slack/actions/removeReaction.meta";
import { slackPinMessageMeta } from "@/integrations/slack/actions/pinMessage.meta";
import { slackUnpinMessageMeta } from "@/integrations/slack/actions/unpinMessage.meta";
import { slackListScheduledMessagesMeta } from "@/integrations/slack/actions/listScheduledMessages.meta";
// Slice 3.37 — Slack channel management (Group C, 12 actions).
import { slackListChannelsMeta } from "@/integrations/slack/actions/channels/listChannels.meta";
import { slackGetChannelInfoMeta } from "@/integrations/slack/actions/channels/getChannelInfo.meta";
import { slackCreateChannelMeta } from "@/integrations/slack/actions/channels/createChannel.meta";
import { slackArchiveChannelMeta } from "@/integrations/slack/actions/channels/archiveChannel.meta";
import { slackUnarchiveChannelMeta } from "@/integrations/slack/actions/channels/unarchiveChannel.meta";
import { slackRenameChannelMeta } from "@/integrations/slack/actions/channels/renameChannel.meta";
import { slackJoinChannelMeta } from "@/integrations/slack/actions/channels/joinChannel.meta";
import { slackLeaveChannelMeta } from "@/integrations/slack/actions/channels/leaveChannel.meta";
import { slackInviteUsersToChannelMeta } from "@/integrations/slack/actions/channels/inviteUsersToChannel.meta";
import { slackRemoveUserFromChannelMeta } from "@/integrations/slack/actions/channels/removeUserFromChannel.meta";
import { slackSetChannelTopicMeta } from "@/integrations/slack/actions/channels/setChannelTopic.meta";
import { slackSetChannelPurposeMeta } from "@/integrations/slack/actions/channels/setChannelPurpose.meta";
// Slice 3.38 — Slack users + remaining file (Group D) + block-kit (Group E) +
// COVERED_PROVIDERS flip. After this slice every Slack runtime handler
// has a meta; tests/structure/discovery-meta-coverage.test.ts gates on
// 1:1 handler↔meta from here on.
import { slackGetUserInfoMeta } from "@/integrations/slack/actions/users/getUserInfo.meta";
import { slackListUsersMeta } from "@/integrations/slack/actions/users/listUsers.meta";
import { slackGetFileInfoMeta } from "@/integrations/slack/actions/files/getFileInfo.meta";
import { slackPostInteractiveBlocksMeta } from "@/integrations/slack/actions/postInteractiveBlocks.meta";

// Notion action metadata (Slices 3.41 + 3.42 — full 16/16 coverage).
// Slice 3.42 added the blocks/comments/users group and flipped Notion
// into `COVERED_PROVIDERS` in tests/structure/discovery-meta-coverage.test.ts
// — 1:1 handler↔meta coverage is enforced from here on.
import { notionCreatePageMeta } from "@/integrations/notion/actions/createPage.meta";
import { notionUpdatePageMeta } from "@/integrations/notion/actions/updatePage.meta";
import { notionArchivePageMeta } from "@/integrations/notion/actions/archivePage.meta";
import { notionRestorePageMeta } from "@/integrations/notion/actions/restorePage.meta";
import { notionGetPageMeta } from "@/integrations/notion/actions/getPage.meta";
import { notionCreateDatabaseMeta } from "@/integrations/notion/actions/createDatabase.meta";
import { notionCreateDatabaseEntryMeta } from "@/integrations/notion/actions/createDatabaseEntry.meta";
import { notionQueryDatabaseMeta } from "@/integrations/notion/actions/queryDatabase.meta";
import { notionSearchMeta } from "@/integrations/notion/actions/search.meta";
// Slice 3.42 — blocks + comments + users (7 actions). After this slice
// Notion's 16/16 action surface is covered and the structural test
// gates on 1:1 handler↔meta coverage.
import { notionAppendBlockChildrenMeta } from "@/integrations/notion/actions/appendBlockChildren.meta";
import { notionGetBlockMeta } from "@/integrations/notion/actions/getBlock.meta";
import { notionGetBlockChildrenMeta } from "@/integrations/notion/actions/getBlockChildren.meta";
import { notionCreateCommentMeta } from "@/integrations/notion/actions/createComment.meta";
import { notionListCommentsMeta } from "@/integrations/notion/actions/listComments.meta";
import { notionGetUserMeta } from "@/integrations/notion/actions/getUser.meta";
import { notionListUsersMeta } from "@/integrations/notion/actions/listUsers.meta";

// Google Sheets action metadata (Slices 3.GSHEETS-3 + 3.GSHEETS-4 —
// full 12/12 coverage). Read + simple-write surface in GSHEETS-3;
// GSHEETS-4 closes with the destructive (clear_range, delete_row),
// bulk (batch_update), and formatting (format_range) actions plus
// the 2 trigger metas. Google Sheets is flipped INTO
// `COVERED_PROVIDERS` in tests/structure/discovery-meta-coverage.test.ts
// in the same slice — the 1:1 handler↔meta invariant is enforced from
// here on. `append_row` / `update_row` mirror the schema's `range`
// field (not a sheet picker) because the schema does not accept a
// separate `sheetName` for these two; the slice rule is "use exact
// runtime field names." Cascade behavior (sheetName picker gated on
// spreadsheetId) is exercised by `get_cell_value`, `find_row`,
// `update_cell`, `delete_row`, `format_range`, and the `row_changed`
// trigger.
import { googleSheetsReadRowsMeta } from "@/integrations/google-sheets/actions/readRows.meta";
import { googleSheetsGetCellValueMeta } from "@/integrations/google-sheets/actions/getCellValue.meta";
import { googleSheetsGetSheetMetadataMeta } from "@/integrations/google-sheets/actions/getSheetMetadata.meta";
import { googleSheetsFindRowMeta } from "@/integrations/google-sheets/actions/findRow.meta";
import { googleSheetsCreateSpreadsheetMeta } from "@/integrations/google-sheets/actions/createSpreadsheet.meta";
import { googleSheetsAppendRowMeta } from "@/integrations/google-sheets/actions/appendRow.meta";
import { googleSheetsUpdateRowMeta } from "@/integrations/google-sheets/actions/updateRow.meta";
import { googleSheetsUpdateCellMeta } from "@/integrations/google-sheets/actions/updateCell.meta";
// Slice 3.GSHEETS-4 — destructive / bulk / formatting actions.
import { googleSheetsClearRangeMeta } from "@/integrations/google-sheets/actions/clearRange.meta";
import { googleSheetsDeleteRowMeta } from "@/integrations/google-sheets/actions/deleteRow.meta";
import { googleSheetsBatchUpdateMeta } from "@/integrations/google-sheets/actions/batchUpdate.meta";
import { googleSheetsFormatRangeMeta } from "@/integrations/google-sheets/actions/formatRange.meta";
// Slice 3.GSHEETS-4 — Google Sheets trigger metas. Both register an
// activation hook in their respective `triggers/<event>/index.ts`
// (Drive `files.watch` push transport); the
// trigger-meta-activation-invariant test is satisfied.
import { googleSheetsNewWorksheetTriggerMeta } from "@/integrations/google-sheets/triggers/newWorksheet/newWorksheet.meta";
import { googleSheetsRowChangedTriggerMeta } from "@/integrations/google-sheets/triggers/rowChanged/rowChanged.meta";

// HubSpot action metadata (Slice 3.HUBSPOT-3 — first 6 of 26
// actions). Contacts + companies surface — create / update / get
// pairs. Resolver-first machinery from HUBSPOT-2 (`hubspot:owners` +
// pipelines) is NOT consumed in this slice — none of the contact /
// company schemas accept `hubspot_owner_id`. HUBSPOT-4 metas
// (deals + tickets) are the first owners-resolver consumers.
// HubSpot stays OUT of `COVERED_PROVIDERS` until all 26 actions +
// the 1 trigger meta land in HUBSPOT-6.
//
// Meta files live under `integrations/hubspot/actions/meta/` rather
// than colocated with handler+schema. The structural leaf-folder cap
// (50 files per directory) forced this split at HUBSPOT-3 — the
// parent `actions/` folder was at 45 files pre-slice; adding 6 metas
// would push it to 51. The `meta/` subdir is the minimum-blast-
// radius fix: handler + schema files stay put, only the new meta
// files relocate, and the registry imports point at the new path.
// HUBSPOT-4 / HUBSPOT-5 metas will land in the same subdir.
import { hubspotCreateContactMeta } from "@/integrations/hubspot/actions/meta/createContact.meta";
import { hubspotUpdateContactMeta } from "@/integrations/hubspot/actions/meta/updateContact.meta";
import { hubspotGetContactsMeta } from "@/integrations/hubspot/actions/meta/getContacts.meta";
import { hubspotCreateCompanyMeta } from "@/integrations/hubspot/actions/meta/createCompany.meta";
import { hubspotUpdateCompanyMeta } from "@/integrations/hubspot/actions/meta/updateCompany.meta";
import { hubspotGetCompaniesMeta } from "@/integrations/hubspot/actions/meta/getCompanies.meta";
// HubSpot deals + tickets + owners-read (Slice 3.HUBSPOT-4 — next 7
// of 26 actions). First HubSpot batch to consume the HUBSPOT-2
// resolver-first machinery:
//   - `hubspot:owners`         — `hubspot_owner_id` on create/update
//                                deal + create/update ticket.
//   - `hubspot:deal_pipelines` → `hubspot:deal_stages` (dependsOn
//                                `pipeline`) — pipeline → dealstage
//                                cascade on create/update deal.
//   - `hubspot:ticket_pipelines` → `hubspot:ticket_stages` (dependsOn
//                                `hs_pipeline`) — pipeline → stage
//                                cascade on create/update ticket.
// HubSpot still stays OUT of `COVERED_PROVIDERS` — 13 more action
// metas + 1 trigger meta still pending across HUBSPOT-5..6.
import { hubspotCreateDealMeta } from "@/integrations/hubspot/actions/meta/createDeal.meta";
import { hubspotUpdateDealMeta } from "@/integrations/hubspot/actions/meta/updateDeal.meta";
import { hubspotGetDealsMeta } from "@/integrations/hubspot/actions/meta/getDeals.meta";
import { hubspotCreateTicketMeta } from "@/integrations/hubspot/actions/meta/createTicket.meta";
import { hubspotUpdateTicketMeta } from "@/integrations/hubspot/actions/meta/updateTicket.meta";
import { hubspotGetTicketsMeta } from "@/integrations/hubspot/actions/meta/getTickets.meta";
import { hubspotGetOwnersMeta } from "@/integrations/hubspot/actions/meta/getOwners.meta";
// HubSpot engagements + lists + commerce (Slice 3.HUBSPOT-5 — final
// 13 of 26 actions). Closes the HubSpot action surface at 26/26.
// HubSpot stays OUT of `COVERED_PROVIDERS` for ONE more slice — the
// HUBSPOT-6 trigger meta + `webhook_received` registration flips the
// gate. Resolver re-uses from HUBSPOT-2:
//   - `hubspot:owners`  — owner combobox on every engagement
//                         (create_note / create_task / create_call /
//                         create_meeting).
//   - `hubspot:lists`   — list picker on add_contact_to_list +
//                         remove_from_list (first consumer of the
//                         stretch resolver). Picker surfaces each
//                         list's MANUAL / DYNAMIC processingType.
// `remove_line_item` is the single high-risk + destructive action in
// the HubSpot surface — the meta declares the destructive trio
// (isDestructive / requiresConfirmation / riskLevel: high). All
// other HUBSPOT-5 actions are medium (create/update writes) or low
// (`get_products` / `get_line_items` reads).
import { hubspotCreateNoteMeta } from "@/integrations/hubspot/actions/meta/createNote.meta";
import { hubspotCreateTaskMeta } from "@/integrations/hubspot/actions/meta/createTask.meta";
import { hubspotCreateCallMeta } from "@/integrations/hubspot/actions/meta/createCall.meta";
import { hubspotCreateMeetingMeta } from "@/integrations/hubspot/actions/meta/createMeeting.meta";
import { hubspotAddContactToListMeta } from "@/integrations/hubspot/actions/meta/addContactToList.meta";
import { hubspotRemoveFromListMeta } from "@/integrations/hubspot/actions/meta/removeFromList.meta";
import { hubspotCreateProductMeta } from "@/integrations/hubspot/actions/meta/createProduct.meta";
import { hubspotUpdateProductMeta } from "@/integrations/hubspot/actions/meta/updateProduct.meta";
import { hubspotGetProductsMeta } from "@/integrations/hubspot/actions/meta/getProducts.meta";
import { hubspotCreateLineItemMeta } from "@/integrations/hubspot/actions/meta/createLineItem.meta";
import { hubspotUpdateLineItemMeta } from "@/integrations/hubspot/actions/meta/updateLineItem.meta";
import { hubspotGetLineItemsMeta } from "@/integrations/hubspot/actions/meta/getLineItems.meta";
import { hubspotRemoveLineItemMeta } from "@/integrations/hubspot/actions/meta/removeLineItem.meta";

// Stripe (Slice 4.STRIPE-TRIGGER-META-2 — 16 actions + 1 consolidated
// webhook trigger). Refactored to the per-provider sub-registry pattern;
// closes the last direct-import provider so all 26 providers now use the
// same template. Trigger meta (`stripe:event_received`) closes the single
// launch blocker identified by PROVIDER-AUDIT-1 — `enabledEvents` config
// field with 18 static options from `STRIPE_ALLOWED_EVENT_TYPES`, including
// the 3 failed-payment events the Stripe → Slack DM use case needs.
import {
  STRIPE_ACTION_METAS,
  STRIPE_TRIGGER_METAS,
} from "./providers/stripe";

// HubSpot trigger metadata (Slice 3.HUBSPOT-6 — closes HubSpot at
// 26/26 actions + 1/1 triggers). Single consolidated `webhook_received`
// trigger covers every HubSpot subscription type (12 as of HubSpot 2.1
// — contact / company / deal / ticket × creation / propertyChange /
// deletion); workflows branch on `payload.subscriptionType`. Webhook
// activation: `integrations/hubspot/triggers/webhookReceived/index.ts`
// calls `registerActivation("hubspot", "webhook_received", activate)`,
// so the `trigger-meta-activation-invariant` test is satisfied without
// adding an entry to `SHARED_INFRA_EXEMPT_KEYS`. Same slice flips
// `hubspot` into `COVERED_PROVIDERS` in
// tests/structure/discovery-meta-coverage.test.ts — 1:1 handler↔meta
// drift is enforced from here on.
import { hubspotWebhookReceivedTriggerMeta } from "@/integrations/hubspot/triggers/webhookReceived/webhookReceived.meta";

// Mailchimp (Slice 3.MAILCHIMP-3 + 3.MAILCHIMP-4) — sub-registry split.
// See providers/mailchimp.ts for per-meta imports + rationale.
import { MAILCHIMP_ACTION_METAS, MAILCHIMP_TRIGGER_METAS } from "./providers/mailchimp";

// Discord (Slice 3.DISCORD-4 + 3.DISCORD-6) — 5 actions + 1 trigger.
// See providers/discord.ts + DISCORD-5 architecture doc.
import { DISCORD_ACTION_METAS, DISCORD_TRIGGER_METAS } from "./providers/discord";

// Google Docs (Slice 3.GDOCS-4 actions + 3.GDOCS-5 triggers).
// Rationale lives in providers/google-docs.ts header.
import { GOOGLE_DOCS_ACTION_METAS, GOOGLE_DOCS_TRIGGER_METAS } from "./providers/google-docs";

// Microsoft OneNote — full rationale in providers/microsoft-onenote.ts.
import { MICROSOFT_ONENOTE_ACTION_METAS, MICROSOFT_ONENOTE_TRIGGER_METAS } from "./providers/microsoft-onenote";
// Monday.com (MONDAY-6 actions + MONDAY-7 triggers) — 24 actions, 5
// webhook triggers.
import { MONDAY_ACTION_METAS, MONDAY_TRIGGER_METAS } from "./providers/monday";
// Dropbox (DROPBOX-4 actions + DROPBOX-5 trigger) — 11 actions, 1 webhook
// trigger (`new_file`, app-level webhook + per-account cursor
// reconciliation, NOT per-workflow webhook creation). See
// providers/dropbox.ts header for the architecture rationale.
import { DROPBOX_ACTION_METAS, DROPBOX_TRIGGER_METAS } from "./providers/dropbox";
// Facebook (FACEBOOK-4 actions + FACEBOOK-5 triggers) — 8 actions, 2
// webhook triggers (`new_post` / `new_comment`, app-level webhook + per-page
// `subscribed_apps`). See providers/facebook.ts header for the architecture
// rationale.
import { FACEBOOK_ACTION_METAS, FACEBOOK_TRIGGER_METAS } from "./providers/facebook";
// Google Analytics (GOOGLE-ANALYTICS-4 actions only) — 6 actions, 0
// triggers. GA4 has no clean push/webhook model; triggers are
// deferred/rejected (D-GA3). See providers/google-analytics.ts header.
import { GOOGLE_ANALYTICS_ACTION_METAS } from "./providers/google-analytics";
// Shopify (Slice 4.SHOPIFY-META-2) — 11 actions + 1 webhook trigger.
import { SHOPIFY_ACTION_METAS, SHOPIFY_TRIGGER_METAS } from "./providers/shopify";
// Microsoft Excel (Slice 4.EXCEL-META-3) — 10 actions + 5 polling triggers.
import {
  MICROSOFT_EXCEL_ACTION_METAS,
  MICROSOFT_EXCEL_TRIGGER_METAS,
} from "./providers/microsoft-excel";
// Airtable (Slice 4.AIRTABLE-META-3) — 11 actions + 1 webhook trigger.
import {
  AIRTABLE_ACTION_METAS,
  AIRTABLE_TRIGGER_METAS,
} from "./providers/airtable";
// Trello (Slice 4.TRELLO-META-3) — 8 actions + 6 per-board webhook triggers.
import {
  TRELLO_ACTION_METAS,
  TRELLO_TRIGGER_METAS,
} from "./providers/trello";
// Microsoft OneDrive (Slice 4.ONEDRIVE-META-3) — 7 actions + 1 whole-drive
// webhook trigger.
import {
  MICROSOFT_ONEDRIVE_ACTION_METAS,
  MICROSOFT_ONEDRIVE_TRIGGER_METAS,
} from "./providers/microsoft-onedrive";
// Microsoft Teams (Slice 4.TEAMS-META-3) — 5 actions + 1 per-(team,channel)
// webhook trigger.
import {
  MICROSOFT_TEAMS_ACTION_METAS,
  MICROSOFT_TEAMS_TRIGGER_METAS,
} from "./providers/microsoft-teams";
// Google Calendar (Slice 4.GCAL-META-2) — 5 actions + 1 watch-based webhook
// trigger. No resolvers (calendarId=primary/typeable; eventId trigger-fed).
import {
  GOOGLE_CALENDAR_ACTION_METAS,
  GOOGLE_CALENDAR_TRIGGER_METAS,
} from "./providers/google-calendar";
// Google Drive (Slice 4.GDRIVE-META-2) — 5 actions + 1 watch-based webhook
// trigger. Reuses the existing google-drive:folders resolver; no new
// resolver work. delete_file = high/destructive/requiresConfirmation in both
// permanent/trash modes. FileRef deferred (mirror OneDrive).
import {
  GOOGLE_DRIVE_ACTION_METAS,
  GOOGLE_DRIVE_TRIGGER_METAS,
} from "./providers/google-drive";
// Microsoft Outlook Calendar (Slice 4.OUTLOOK-CAL-META-2 — final
// launch-gap provider). 5 actions + 1 Graph-subscription webhook
// trigger. ZERO resolvers (no calendarId field anywhere — actions
// pinned to /me/events; no per-trigger filtering). Approach-A flat-
// time-fields shim on create_event + update_event schemas (additive
// Zod preprocess; nested shape still works).
import {
  MICROSOFT_OUTLOOK_CALENDAR_ACTION_METAS,
  MICROSOFT_OUTLOOK_CALENDAR_TRIGGER_METAS,
} from "./providers/microsoft-outlook-calendar";
// Asana (Slice 5.ASANA-1 — first net-new provider, no V1 code) — 5 task/
// comment actions + 2 project-scoped webhook triggers with the
// X-Hook-Secret handshake lifecycle.
import {
  ASANA_ACTION_METAS,
  ASANA_TRIGGER_METAS,
} from "./providers/asana";
// Typeform (Slice 5.TYPEFORM-1 + TYPEFORM-2 — second net-new provider,
// no V1 code) — 1 form-scoped webhook trigger with a caller-minted-secret
// lifecycle + 2 read actions (TYPEFORM-2, new responses:read scope).
import {
  TYPEFORM_ACTION_METAS,
  TYPEFORM_TRIGGER_METAS,
} from "./providers/typeform";
// Calendly (Slice 5.CALENDLY-1 — third net-new provider, no V1 code) —
// 2 user-scoped webhook-subscription triggers with a caller-minted
// signing-key lifecycle; ZERO actions this slice (no
// CALENDLY_ACTION_METAS export exists).
import { CALENDLY_TRIGGER_METAS } from "./providers/calendly";

// Slack trigger metadata (Slice 3.11 coverage scope).
import { newMessageChannelTriggerMeta } from "@/integrations/slack/triggers/newMessageChannel/newMessageChannel.meta";
import { newDirectMessageTriggerMeta } from "@/integrations/slack/triggers/newDirectMessage/newDirectMessage.meta";
import { newMessagePrivateChannelTriggerMeta } from "@/integrations/slack/triggers/newMessagePrivateChannel/newMessagePrivateChannel.meta";
import { newGroupDirectMessageTriggerMeta } from "@/integrations/slack/triggers/newGroupDirectMessage/newGroupDirectMessage.meta";
import { reactionAddedTriggerMeta } from "@/integrations/slack/triggers/reactionAdded/reactionAdded.meta";
import { reactionRemovedTriggerMeta } from "@/integrations/slack/triggers/reactionRemoved/reactionRemoved.meta";
import { channelCreatedTriggerMeta } from "@/integrations/slack/triggers/channelCreated/channelCreated.meta";
import { memberJoinedChannelTriggerMeta } from "@/integrations/slack/triggers/memberJoinedChannel/memberJoinedChannel.meta";
import { memberLeftChannelTriggerMeta } from "@/integrations/slack/triggers/memberLeftChannel/memberLeftChannel.meta";
import { fileUploadedTriggerMeta } from "@/integrations/slack/triggers/fileUploaded/fileUploaded.meta";

/**
 * Hand-maintained discovery metadata registry.
 *
 * Per docs/slices/phase-3-builder-ui-plan.md §10 Slice 3.0:
 *   - Explicit imports surface in PRs. Adding metadata for a new action
 *     means adding the import + the export array entry below.
 *   - Every meta is parsed against its Zod contract at module load.
 *     Build fails on any malformed meta with a clear error.
 *   - Duplicate (provider, type) keys are rejected at module load.
 *   - The exported lookup maps are frozen — no runtime mutation.
 *
 * Why this is hand-maintained rather than generated:
 *   - Matches the existing pattern in `services/execution/handlers/_registry.ts`
 *     and `integrations/_registry.ts`. Reviewer scans the PR diff to see
 *     exactly which actions a slice covers; no implicit auto-discovery.
 *   - Decouples the builder discovery surface from handler-schema Zod
 *     internals. The contracts in `contracts/actionMeta.ts` and
 *     `contracts/triggerMeta.ts` express UI concerns that don't belong
 *     in runtime validation schemas (labels, descriptions, dependsOn,
 *     optionsSource, displayOrder, FileRef awareness).
 *
 * Coverage scope: native (Slice 3.0) + GitHub (Slice 3.0b). Subsequent
 * commits expand coverage one provider at a time, validated by a
 * coverage structural test that grows its expected-coverage set
 * alongside the imports.
 */

export const ALL_ACTION_META: ReadonlyArray<ActionMeta> = [
  // Native (Slice 3.0).
  httpRequestMeta,
  formatTransformerMeta,
  delayMeta,
  ifThenConditionMeta,
  routerMeta,
  // GitHub (Slice 3.0b).
  createIssueMeta,
  createRepositoryMeta,
  createPullRequestMeta,
  createBranchMeta,
  createGistMeta,
  addCommentMeta,
  // Gmail (Slice 3.15). Ordered to match each meta's displayOrder
  // (10/20/30/40/50/60/70/80/90/100/110/120/130) so the registry
  // diff lines up with the sorted output of listActionMetasForProvider.
  sendEmailMeta,
  replyToEmailMeta,
  createDraftMeta,
  createDraftReplyMeta,
  searchEmailsMeta,
  getAttachmentMeta,
  addLabelMeta,
  removeLabelMeta,
  createLabelMeta,
  markAsReadMeta,
  markAsUnreadMeta,
  archiveEmailMeta,
  deleteEmailMeta,
  // Slice 4.GMAIL-READ-1 — read-only metadata actions (displayOrder 140/150).
  listLabelsMeta,
  getProfileMeta,
  // Microsoft Outlook Mail (Slice 3.17). Ordered to match each meta's
  // displayOrder (10/20/30/40/50/60/70/80/90).
  outlookSendEmailMeta,
  outlookReplyToEmailMeta,
  outlookForwardEmailMeta,
  outlookCreateDraftEmailMeta,
  outlookFetchEmailsMeta,
  outlookGetAttachmentMeta,
  outlookAddCategoriesMeta,
  outlookMoveEmailMeta,
  outlookDeleteEmailMeta,
  // Slice 4.OUTLOOK-READ-1 — read-only metadata actions (displayOrder 100/110).
  outlookListFoldersMeta,
  outlookGetProfileMeta,
  // Slack file actions (Slice 3.26 + 3.27). `download_file` is the
  // FileRef producer; `upload_file` is the FileRef consumer that
  // exercises the Slice 3.25 single-FileRef FileField (chip + picker
  // + replace semantics). Ordered by displayOrder (10/20).
  slackDownloadFileMeta,
  slackUploadFileMeta,
  // Slack messaging Group A (Slice 3.35). 8 actions sharing the
  // channel-picker (`slack:channels`) + message-reference UX shape.
  // user-id field on send_direct_message stays `text` for v1; a
  // future `slack:users` resolver slice (3.39+) will flip it.
  // Ordered to match displayOrder (30..100).
  slackSendChannelMessageMeta,
  slackSendDirectMessageMeta,
  slackUpdateMessageMeta,
  slackDeleteMessageMeta,
  slackGetMessagesMeta,
  slackGetThreadMessagesMeta,
  slackScheduleMessageMeta,
  slackCancelScheduledMessageMeta,
  // Slack reactions / pins / list_scheduled_messages (Slice 3.36 —
  // Group B). All small `{channel, ts, …}`-shape actions; no user-id
  // fields. `list_scheduled_messages` lives here because it's the
  // read companion to Group A's schedule/cancel pair. Ordered to
  // match displayOrder (110..150).
  slackAddReactionMeta,
  slackRemoveReactionMeta,
  slackPinMessageMeta,
  slackUnpinMessageMeta,
  slackListScheduledMessagesMeta,
  // Slack channel management (Slice 3.37 — Group C, 12 actions).
  // Reads + lifecycle + membership + topic/purpose. Every action's
  // channel field uses the `slack:channels` picker; required for the
  // single-channel ops, optional only on list_channels (which has no
  // channel field at all — it discovers them). `invite_users_to_channel`
  // uses `string-array` for `users` since multi-select combobox is
  // deferred (Slice 3.7) and the `slack:users` resolver is deferred
  // (Slice 3.39+). Ordered to match displayOrder (160..270).
  slackListChannelsMeta,
  slackGetChannelInfoMeta,
  slackCreateChannelMeta,
  slackArchiveChannelMeta,
  slackUnarchiveChannelMeta,
  slackRenameChannelMeta,
  slackJoinChannelMeta,
  slackLeaveChannelMeta,
  slackInviteUsersToChannelMeta,
  slackRemoveUserFromChannelMeta,
  slackSetChannelTopicMeta,
  slackSetChannelPurposeMeta,
  // Slack users + remaining file + block-kit (Slice 3.38 — Group D +
  // E). Closes Slack action coverage at 31/31; the same slice flips
  // Slack into `COVERED_PROVIDERS` in tests/structure/
  // discovery-meta-coverage.test.ts so the 1:1 handler↔meta invariant
  // is enforced from here on. User-id fields stay `text` pending a
  // future `slack:users` resolver slice (3.39+). `get_file_info`
  // produces a FileRef(provider_url) — declared with
  // producesFileRef=true. Ordered to match displayOrder (280..310).
  slackGetUserInfoMeta,
  slackListUsersMeta,
  slackGetFileInfoMeta,
  slackPostInteractiveBlocksMeta,
  // Notion pages + databases (Slice 3.41 — Group 3.41, 9 of 16). The
  // page/database surface — paste-JSON for nested object/array fields
  // (parent, properties, children, icon, cover, filter, sorts) per the
  // metadata plan §3.2. The remaining 7 (blocks / comments / users)
  // land in Slice 3.42, which flips Notion into COVERED_PROVIDERS in
  // the same commit. Ordered to match displayOrder (10..90).
  notionCreatePageMeta,
  notionUpdatePageMeta,
  notionArchivePageMeta,
  notionRestorePageMeta,
  notionGetPageMeta,
  notionCreateDatabaseMeta,
  notionCreateDatabaseEntryMeta,
  notionQueryDatabaseMeta,
  notionSearchMeta,
  // Notion blocks + comments + users (Slice 3.42 — closes Notion at
  // 16/16). Same slice flips Notion into `COVERED_PROVIDERS` in
  // tests/structure/discovery-meta-coverage.test.ts so the 1:1
  // handler↔meta invariant is enforced from here on. Ordered to match
  // displayOrder (100..160).
  notionAppendBlockChildrenMeta,
  notionGetBlockMeta,
  notionGetBlockChildrenMeta,
  notionCreateCommentMeta,
  notionListCommentsMeta,
  notionGetUserMeta,
  notionListUsersMeta,
  ...STRIPE_ACTION_METAS, // Stripe (STRIPE-TRIGGER-META-2 sub-registry refactor) — 16 actions, displayOrder 10..160 (8 customer + payment lifecycle from Slice 3.45 then 8 subscriptions + commerce from Slice 3.46).
  // Google Sheets — first 8 of 12 actions (Slice 3.GSHEETS-3).
  // Consumes the GSHEETS-2 `google-sheets:spreadsheets` /
  // `google-sheets:sheets` resolvers. Google Sheets remains OUT of
  // `COVERED_PROVIDERS` until batch_update / clear_range / delete_row /
  // format_range action metas + the 2 trigger metas land. Ordered to
  // match displayOrder (10..80): read surface first, then create, then
  // writes.
  googleSheetsReadRowsMeta,
  googleSheetsGetCellValueMeta,
  googleSheetsGetSheetMetadataMeta,
  googleSheetsFindRowMeta,
  googleSheetsCreateSpreadsheetMeta,
  googleSheetsAppendRowMeta,
  googleSheetsUpdateRowMeta,
  googleSheetsUpdateCellMeta,
  // Slice 3.GSHEETS-4 — destructive / bulk / formatting actions.
  // displayOrder 90..120 continues the 10..80 GSHEETS-3 sequence.
  googleSheetsClearRangeMeta,
  googleSheetsDeleteRowMeta,
  googleSheetsBatchUpdateMeta,
  googleSheetsFormatRangeMeta,
  // HubSpot contacts + companies (Slice 3.HUBSPOT-3 — first 6 of 26).
  // Ordered to match displayOrder (10..60): create/update/get pair
  // for contacts then companies. No `hubspot:owners` consumers in
  // this slice — the contact/company schemas have no
  // `hubspot_owner_id` field; the deal/ticket/engagement metas in
  // HUBSPOT-4/5 are the first owners-resolver users.
  hubspotCreateContactMeta,
  hubspotUpdateContactMeta,
  hubspotGetContactsMeta,
  hubspotCreateCompanyMeta,
  hubspotUpdateCompanyMeta,
  hubspotGetCompaniesMeta,
  // HubSpot deals + tickets + owners-read (Slice 3.HUBSPOT-4 — next 7
  // of 26). Ordered to match displayOrder (70..130): deal create/update/
  // get, ticket create/update/get, then owners read. First HubSpot
  // batch to wire `hubspot:owners` + the deal_pipelines/deal_stages +
  // ticket_pipelines/ticket_stages cascades from HUBSPOT-2. HubSpot
  // stays OUT of `COVERED_PROVIDERS` — 13 actions + 1 trigger pending
  // across HUBSPOT-5..6.
  hubspotCreateDealMeta,
  hubspotUpdateDealMeta,
  hubspotGetDealsMeta,
  hubspotCreateTicketMeta,
  hubspotUpdateTicketMeta,
  hubspotGetTicketsMeta,
  hubspotGetOwnersMeta,
  // HubSpot engagements + lists + commerce (Slice 3.HUBSPOT-5 — final
  // 13 of 26). Ordered to match displayOrder (140..260): the four
  // engagement creates first (note / task / call / meeting), then the
  // list-membership pair, then products (create / update / get), then
  // line items (create / update / get / remove). `remove_line_item`
  // displayOrder is intentionally LAST in the HubSpot surface — it's
  // the only destructive action and reviewers should see it at the
  // bottom of the library list. HubSpot stays OUT of
  // `COVERED_PROVIDERS` until HUBSPOT-6 ships the trigger meta.
  hubspotCreateNoteMeta,
  hubspotCreateTaskMeta,
  hubspotCreateCallMeta,
  hubspotCreateMeetingMeta,
  hubspotAddContactToListMeta,
  hubspotRemoveFromListMeta,
  hubspotCreateProductMeta,
  hubspotUpdateProductMeta,
  hubspotGetProductsMeta,
  hubspotCreateLineItemMeta,
  hubspotUpdateLineItemMeta,
  hubspotGetLineItemsMeta,
  hubspotRemoveLineItemMeta,
  // Mailchimp (Slice 3.MAILCHIMP-3 + 3.MAILCHIMP-4) — 14 actions in displayOrder 10..140.
  ...MAILCHIMP_ACTION_METAS,
  // Discord (Slice 3.DISCORD-4) — 5 actions in displayOrder 10..50.
  // COVERED_PROVIDERS flip lands in the same slice; see providers/
  // discord.ts header for the trigger-deferral rationale.
  ...DISCORD_ACTION_METAS,
  // Google Docs (GDOCS-4) — 5 actions in displayOrder 10..50.
  // OneNote (ONENOTE-4) — 12 actions; see providers/microsoft-onenote.ts.
  ...GOOGLE_DOCS_ACTION_METAS, ...MICROSOFT_ONENOTE_ACTION_METAS,
  ...MONDAY_ACTION_METAS, // Monday (MONDAY-6) — 24 actions, displayOrder 10..240.
  ...DROPBOX_ACTION_METAS, // Dropbox (DROPBOX-4) — 11 actions, displayOrder 10..110.
  ...FACEBOOK_ACTION_METAS, // Facebook (FACEBOOK-4) — 8 actions, displayOrder 10..80.
  ...GOOGLE_ANALYTICS_ACTION_METAS, // Google Analytics (GOOGLE-ANALYTICS-4) — 6 actions, displayOrder 10..60.
  ...SHOPIFY_ACTION_METAS, // Shopify (SHOPIFY-META-2) — 11 actions, displayOrder 10..110.
  ...MICROSOFT_EXCEL_ACTION_METAS, // Microsoft Excel (EXCEL-META-3) — 10 actions, displayOrder 10..100.
  ...AIRTABLE_ACTION_METAS, // Airtable (AIRTABLE-META-3) — 11 actions, displayOrder 10..110.
  ...TRELLO_ACTION_METAS, // Trello (TRELLO-META-3) — 8 actions, displayOrder 10..80.
  ...MICROSOFT_ONEDRIVE_ACTION_METAS, // Microsoft OneDrive (ONEDRIVE-META-3) — 7 actions, displayOrder 10..70.
  ...MICROSOFT_TEAMS_ACTION_METAS, // Microsoft Teams (TEAMS-META-3) — 5 actions, displayOrder 10..50.
  ...GOOGLE_CALENDAR_ACTION_METAS, // Google Calendar (GCAL-META-2) — 5 actions, displayOrder 10..50.
  ...GOOGLE_DRIVE_ACTION_METAS, // Google Drive (GDRIVE-META-2) — 5 actions, displayOrder 10..50.
  ...MICROSOFT_OUTLOOK_CALENDAR_ACTION_METAS, // Microsoft Outlook Calendar (OUTLOOK-CAL-META-2) — 5 actions, displayOrder 10..50.
  ...ASANA_ACTION_METAS, // Asana (ASANA-1) — 5 actions, displayOrder 10..50.
  ...TYPEFORM_ACTION_METAS, // Typeform (TYPEFORM-2) — 2 read actions, displayOrder 10..20.
];

export const ALL_TRIGGER_META: ReadonlyArray<TriggerMeta> = [
  // Native (Slice 3.0).
  manualTriggerMeta,
  scheduledTriggerMeta,
  // GitHub (Slice 3.0b).
  newCommitTriggerMeta,
  // Gmail (Slice 3.12). Polling triggers — each registers an activation
  // function in `integrations/gmail/triggers/<event>/index.ts` that
  // seeds `snapshot.historyId` at activate time. The activation-registry
  // invariant test is satisfied by those registrations (no exemption
  // needed); adding one here would silently mask the first-poll-miss
  // protection contract.
  newEmailTriggerMeta,
  newLabeledEmailTriggerMeta,
  newAttachmentTriggerMeta,
  // Slack (Slice 3.11). Slack uses a single global webhook URL — no
  // per-workflow activation work — so every key below is registered in
  // SHARED_INFRA_EXEMPT_KEYS of the activation invariant test.
  newMessageChannelTriggerMeta,
  newDirectMessageTriggerMeta,
  newMessagePrivateChannelTriggerMeta,
  newGroupDirectMessageTriggerMeta,
  reactionAddedTriggerMeta,
  reactionRemovedTriggerMeta,
  channelCreatedTriggerMeta,
  memberJoinedChannelTriggerMeta,
  memberLeftChannelTriggerMeta,
  fileUploadedTriggerMeta,
  // Microsoft Outlook Mail (Slice 3.17). Webhook subscription-watch
  // triggers — each registers a per-workflow Graph subscription via
  // `registerActivation("microsoft-outlook", <type>, ...)`. The
  // activation-registry invariant test is satisfied by those
  // registrations (no exemption needed). Ordered to match each meta's
  // displayOrder (10/20/30).
  outlookNewEmailTriggerMeta,
  outlookEmailSentTriggerMeta,
  outlookEmailFlaggedTriggerMeta,
  // Google Sheets (Slice 3.GSHEETS-4 — closes Google Sheets at 12/12
  // actions + 2/2 triggers). Both triggers register a per-workflow
  // activation hook (Drive `files.watch`) — the
  // trigger-meta-activation-invariant test is satisfied, no exemption
  // needed. Same slice flips google-sheets into `COVERED_PROVIDERS`.
  googleSheetsNewWorksheetTriggerMeta,
  googleSheetsRowChangedTriggerMeta,
  // HubSpot (Slice 3.HUBSPOT-6 — closes HubSpot at 26/26 actions +
  // 1/1 triggers). Consolidated `webhook_received` trigger covers
  // every HubSpot subscription type (workflows branch on
  // `payload.subscriptionType`). Activation is wired via
  // `integrations/hubspot/triggers/webhookReceived/index.ts` →
  // `registerActivation("hubspot", "webhook_received", activate)`, so
  // the trigger-meta-activation-invariant test is satisfied without
  // adding the key to `SHARED_INFRA_EXEMPT_KEYS`. Same slice flips
  // `hubspot` into `COVERED_PROVIDERS` — 1:1 handler↔meta drift is
  // enforced from here on.
  hubspotWebhookReceivedTriggerMeta,
  // Mailchimp (Slice 3.MAILCHIMP-4) — 1 webhook + 6 polling.
  ...MAILCHIMP_TRIGGER_METAS,
  // Discord (Slice 3.DISCORD-6) — `slash_command` webhook trigger.
  // Activation registers a guild-scoped slash command via Discord's
  // `POST /applications/{app_id}/guilds/{guild_id}/commands`. Activation
  // hook lives at integrations/discord/triggers/slashCommand/index.ts
  // → registerActivation("discord", "slash_command", activate), so the
  // trigger-meta-activation-invariant test is satisfied without an
  // exemption. `new_message` polling lands in DISCORD-7;
  // `member_join` deferred (DISCORD-N-member-join) per
  // docs/slices/phase-3/discord-trigger-architecture-plan.md.
  // Google Docs (GDOCS-5) — new_document + document_updated.
  // OneNote (ONENOTE-5) — new_note + updated_note (polling — Graph
  // deprecated OneNote webhook subscriptions May 2023; webhookTrigger
  // on manifest stays permanently false).
  ...DISCORD_TRIGGER_METAS, ...GOOGLE_DOCS_TRIGGER_METAS, ...MICROSOFT_ONENOTE_TRIGGER_METAS,
  // Monday (MONDAY-7) — 5 webhook triggers (new_item, column_changed,
  // item_moved, new_subitem, new_update), displayOrder 10..50. Each
  // registers an activation + deactivation hook in its
  // triggers/<event>/index.ts → registerActivation("monday", <type>, ...),
  // so the trigger-meta-activation-invariant test is satisfied without an
  // exemption.
  ...MONDAY_TRIGGER_METAS,
  // Dropbox (DROPBOX-5) — 1 webhook trigger (`new_file`). App-level
  // webhook (one URL in the App Console) + per-account cursor
  // reconciliation. The activation hook seeds a list_folder cursor
  // (registerActivation("dropbox", "new_file", ...)), satisfying the
  // trigger-meta-activation-invariant test without an exemption — no
  // remote create_webhook (the app webhook is shared-infra, doesn't
  // expire, and needs no per-workflow subscription).
  ...DROPBOX_TRIGGER_METAS,
  // Facebook (FACEBOOK-5) — 2 app-level webhook triggers (new_post,
  // new_comment), displayOrder 10..20. ONE URL in the Meta App Dashboard;
  // each Page is subscribed at activate time via subscribed_apps
  // (registerActivation("facebook", <type>, …)), so the
  // trigger-meta-activation-invariant test is satisfied without an exemption.
  // Deactivation is reference-count-safe (shared page-level subscription).
  ...FACEBOOK_TRIGGER_METAS,
  // Shopify (SHOPIFY-META-2) — 1 consolidated webhook trigger
  // (`webhook_received`, 8-topic allowlist). Activation hook registered in
  // integrations/shopify/triggers/webhookReceived/index.ts →
  // registerActivation("shopify", "webhook_received", activate), so the
  // trigger-meta-activation-invariant test is satisfied without an exemption.
  ...SHOPIFY_TRIGGER_METAS,
  // Microsoft Excel (EXCEL-META-3) — 5 polling triggers (new_row,
  // updated_row, new_table_row, updated_table_row, new_worksheet),
  // displayOrder 10..50. Each registers an activation hook in its
  // triggers/<event>/index.ts → registerActivation("microsoft-excel",
  // <type>, ...), so the trigger-meta-activation-invariant test is
  // satisfied without an exemption.
  ...MICROSOFT_EXCEL_TRIGGER_METAS,
  // Airtable (AIRTABLE-META-3) — 1 webhook trigger (`record_changed`,
  // consolidated per-base subscription; workflows branch on
  // payload.eventType). Activation registered in
  // integrations/airtable/triggers/recordChanged/index.ts →
  // registerActivation("airtable","record_changed",...), so the
  // trigger-meta-activation-invariant test passes without an exemption.
  ...AIRTABLE_TRIGGER_METAS,
  // Trello (TRELLO-META-3) — 6 per-board webhook triggers (new_card,
  // card_updated, card_moved, comment_added, member_changed,
  // card_archived). Each registers an activation hook in its
  // integrations/trello/triggers/<event>/index.ts →
  // registerActivation("trello", <type>, ...), so the
  // trigger-meta-activation-invariant test passes without an exemption.
  ...TRELLO_TRIGGER_METAS,
  // Microsoft OneDrive (ONEDRIVE-META-3) — 1 whole-drive webhook trigger
  // (file_changed; empty fields). Activation registered in
  // integrations/microsoft-onedrive/triggers/fileChanged/index.ts →
  // registerActivation("microsoft-onedrive","file_changed",...), so the
  // trigger-meta-activation-invariant test passes without an exemption.
  ...MICROSOFT_ONEDRIVE_TRIGGER_METAS,
  // Microsoft Teams (TEAMS-META-3) — 1 per-(team,channel) webhook trigger
  // (new_channel_message). Activation registered in
  // integrations/microsoft-teams/triggers/newChannelMessage/index.ts →
  // registerActivation("microsoft-teams","new_channel_message",...), so the
  // trigger-meta-activation-invariant test passes without an exemption.
  ...MICROSOFT_TEAMS_TRIGGER_METAS,
  // Google Calendar (GCAL-META-2) — 1 watch-based webhook trigger
  // (event_changed; single calendarId field). Activation registered in
  // integrations/google-calendar/triggers/eventChanged/index.ts →
  // registerActivation("google-calendar","event_changed",...), so the
  // trigger-meta-activation-invariant test passes without an exemption.
  ...GOOGLE_CALENDAR_TRIGGER_METAS,
  // Google Drive (GDRIVE-META-2) — 1 watch-based webhook trigger
  // (file_changed; fileId watch-target + folderId post-fetch filter, both
  // → google-drive:folders). Activation registered in
  // integrations/google-drive/triggers/fileChanged/index.ts →
  // registerActivation("google-drive","file_changed",...), so the
  // trigger-meta-activation-invariant test passes without an exemption.
  ...GOOGLE_DRIVE_TRIGGER_METAS,
  // Microsoft Outlook Calendar (OUTLOOK-CAL-META-2 — final launch-gap
  // provider) — 1 Graph-subscription webhook trigger (event_changed;
  // fields:[]; no per-workflow filtering). Activation registered in
  // integrations/microsoft-outlook-calendar/triggers/eventChanged/index.ts
  // → registerActivation("microsoft-outlook-calendar","event_changed",...),
  // so the trigger-meta-activation-invariant test passes without an
  // exemption.
  ...MICROSOFT_OUTLOOK_CALENDAR_TRIGGER_METAS,
  // Stripe (STRIPE-TRIGGER-META-2 — closes PROVIDER-AUDIT-1's single
  // launch blocker) — 1 consolidated webhook trigger (event_received;
  // enabledEvents combobox+multiple+required with 18 static options from
  // STRIPE_ALLOWED_EVENT_TYPES). Activation registered in
  // integrations/stripe/triggers/eventReceived/index.ts →
  // registerActivation("stripe","event_received",...), so the
  // trigger-meta-activation-invariant test passes without an exemption.
  ...STRIPE_TRIGGER_METAS,
  // Asana (ASANA-1) — 2 project-scoped webhook triggers. Activation +
  // deactivation registered in integrations/asana/triggers/<event>/index.ts,
  // so the trigger-meta-activation-invariant test passes without an
  // exemption.
  ...ASANA_TRIGGER_METAS,
  // Typeform (TYPEFORM-1) — 1 form-scoped webhook trigger. Activation +
  // deactivation registered in
  // integrations/typeform/triggers/newResponseInForm/index.ts, so the
  // trigger-meta-activation-invariant test passes without an exemption.
  ...TYPEFORM_TRIGGER_METAS,
  // Calendly (CALENDLY-1) — 2 user-scoped webhook triggers. Activation +
  // deactivation registered in
  // integrations/calendly/triggers/<event>/index.ts, so the
  // trigger-meta-activation-invariant test passes without an exemption.
  ...CALENDLY_TRIGGER_METAS,
];
