import { ActionMetaSchema, type ActionMeta } from "@/contracts/actionMeta";
import { TriggerMetaSchema, type TriggerMeta } from "@/contracts/triggerMeta";

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

// Stripe action metadata (Slices 3.45 + 3.46 — full 16/16 coverage).
// Slice 3.45 shipped customer + payment lifecycle (8); Slice 3.46
// shipped subscriptions + commerce (8) and flipped Stripe into
// `COVERED_PROVIDERS` in tests/structure/discovery-meta-coverage.test.ts
// — 1:1 handler↔meta coverage is enforced from here on. Trigger meta
// (`stripe:event_received`) is deferred to a follow-up slice — see
// stripe-action-metadata-plan §3.
import { stripeCreateCustomerMeta } from "@/integrations/stripe/actions/createCustomer.meta";
import { stripeUpdateCustomerMeta } from "@/integrations/stripe/actions/updateCustomer.meta";
import { stripeFindCustomerMeta } from "@/integrations/stripe/actions/findCustomer.meta";
import { stripeCreatePaymentIntentMeta } from "@/integrations/stripe/actions/createPaymentIntent.meta";
import { stripeConfirmPaymentIntentMeta } from "@/integrations/stripe/actions/confirmPaymentIntent.meta";
import { stripeCapturePaymentIntentMeta } from "@/integrations/stripe/actions/capturePaymentIntent.meta";
import { stripeCreateRefundMeta } from "@/integrations/stripe/actions/createRefund.meta";
import { stripeFindPaymentIntentMeta } from "@/integrations/stripe/actions/findPaymentIntent.meta";
// Slice 3.46 — Stripe subscriptions + commerce surfaces (8 actions).
// Closes Stripe action coverage at 16/16; same slice flips Stripe into
// `COVERED_PROVIDERS` so 1:1 handler↔meta drift is enforced from here on.
import { stripeCreateSubscriptionMeta } from "@/integrations/stripe/actions/createSubscription.meta";
import { stripeUpdateSubscriptionMeta } from "@/integrations/stripe/actions/updateSubscription.meta";
import { stripeCancelSubscriptionMeta } from "@/integrations/stripe/actions/cancelSubscription.meta";
import { stripeFindSubscriptionMeta } from "@/integrations/stripe/actions/findSubscription.meta";
import { stripeCreateCheckoutSessionMeta } from "@/integrations/stripe/actions/createCheckoutSession.meta";
import { stripeCreatePaymentLinkMeta } from "@/integrations/stripe/actions/createPaymentLink.meta";
import { stripeCreateInvoiceMeta } from "@/integrations/stripe/actions/createInvoice.meta";
import { stripeGetPaymentsMeta } from "@/integrations/stripe/actions/getPayments.meta";

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

// Discord (Slice 3.DISCORD-4 + 3.DISCORD-6) — 5 actions + 1 trigger
// (`slash_command`, webhook activation via Interactions Endpoint URL).
// See providers/discord.ts + DISCORD-5 architecture doc.
import {
  DISCORD_ACTION_METAS,
  DISCORD_TRIGGER_METAS,
} from "./providers/discord";

// Google Docs (Slice 3.GDOCS-4) — 5 actions, 0 triggers. Trigger
// metas (`new_document` + `document_updated`, both via Drive
// files.watch push channel filtered by Docs mimeType) ship in
// GDOCS-5. Intentional staged provider arc — see
// providers/google-docs.ts header + GDOCS-1 §3.5 D-GD2.
import {
  GOOGLE_DOCS_ACTION_METAS,
  GOOGLE_DOCS_TRIGGER_METAS,
} from "./providers/google-docs";

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

const ALL_ACTION_META: ReadonlyArray<ActionMeta> = [
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
  // Stripe customer + payment lifecycle (Slice 3.45 — 8 of 16).
  // Money-moving actions; every meta carries unit-anchored
  // descriptions (DOLLARS vs CENTS) per the metadata plan §8.
  // `metadata` fields use `keyvalue` (Record<string,string> contract
  // fit); enums use `select` with static options. Ordered to match
  // displayOrder (10..80).
  stripeCreateCustomerMeta,
  stripeUpdateCustomerMeta,
  stripeFindCustomerMeta,
  stripeCreatePaymentIntentMeta,
  stripeConfirmPaymentIntentMeta,
  stripeCapturePaymentIntentMeta,
  stripeCreateRefundMeta,
  stripeFindPaymentIntentMeta,
  // Stripe subscriptions + commerce surfaces (Slice 3.46 — closes
  // Stripe at 16/16). Same slice flips Stripe into `COVERED_PROVIDERS`
  // in tests/structure/discovery-meta-coverage.test.ts so the 1:1
  // handler↔meta invariant is enforced from here on.
  // Money/subscription-changing actions; descriptions explicitly call
  // out money-moving / destructive / cancellation-risk semantics.
  // Nested objects (`lineItems`, `automaticTax`, `afterCompletion`)
  // use textarea paste-JSON (mirrors `slack:post_interactive_blocks.blocks`
  // and the Notion paste-JSON pattern). Enums (`mode`, `payment_behavior`,
  // `proration_behavior`, `collection_method`) use `select` with static
  // options and NO defaultValue per Q11. Ordered to match displayOrder
  // (90..160).
  stripeCreateSubscriptionMeta,
  stripeUpdateSubscriptionMeta,
  stripeCancelSubscriptionMeta,
  stripeFindSubscriptionMeta,
  stripeCreateCheckoutSessionMeta,
  stripeCreatePaymentLinkMeta,
  stripeCreateInvoiceMeta,
  stripeGetPaymentsMeta,
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
  // Google Docs (Slice 3.GDOCS-4) — 5 actions in displayOrder 10..50.
  // COVERED_PROVIDERS flip lands in the same slice. Triggers
  // (new_document / document_updated via Drive files.watch) ship in
  // GDOCS-5 — see providers/google-docs.ts header.
  ...GOOGLE_DOCS_ACTION_METAS,
];

const ALL_TRIGGER_META: ReadonlyArray<TriggerMeta> = [
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
  ...DISCORD_TRIGGER_METAS,
  // Google Docs (Slice 3.GDOCS-4) — currently empty. GDOCS-5 will
  // populate this with `new_document` + `document_updated` (both via
  // Drive files.watch push channel filtered by Docs mimeType). Spread
  // pre-emptively so the GDOCS-5 PR is purely additive on the central
  // registry side (no central spread edit needed there).
  ...GOOGLE_DOCS_TRIGGER_METAS,
];

// Validate each meta against its contract at module load. parse() throws on
// any malformed meta; loading any importer of this module fails the build
// with the exact path / message from Zod.
for (const meta of ALL_ACTION_META) {
  ActionMetaSchema.parse(meta);
}
for (const meta of ALL_TRIGGER_META) {
  TriggerMetaSchema.parse(meta);
}

// Build keyed lookups, rejecting duplicates at module load.
const actionByKey: ReadonlyMap<string, ActionMeta> = (() => {
  const m = new Map<string, ActionMeta>();
  for (const meta of ALL_ACTION_META) {
    if (m.has(meta.key)) {
      throw new Error(
        `Duplicate action meta registered for key '${meta.key}'.`,
      );
    }
    m.set(meta.key, meta);
  }
  return m;
})();

const triggerByKey: ReadonlyMap<string, TriggerMeta> = (() => {
  const m = new Map<string, TriggerMeta>();
  for (const meta of ALL_TRIGGER_META) {
    if (m.has(meta.key)) {
      throw new Error(
        `Duplicate trigger meta registered for key '${meta.key}'.`,
      );
    }
    m.set(meta.key, meta);
  }
  return m;
})();

// ─── Public accessors ────────────────────────────────────────────────────────

/**
 * Stable ordering helper: (displayOrder asc, displayName asc). Used by
 * every listing accessor so route responses and lib/api consumers see
 * deterministic shapes — important for snapshot tests + AI agents that
 * reason about ordering.
 */
function compareMeta<T extends { displayName: string; displayOrder: number | null }>(
  a: T,
  b: T,
): number {
  const ao = a.displayOrder;
  const bo = b.displayOrder;
  if (ao !== null && bo !== null && ao !== bo) return ao - bo;
  if (ao !== null && bo === null) return -1;
  if (ao === null && bo !== null) return 1;
  return a.displayName.localeCompare(b.displayName);
}

/**
 * All action metas across every provider, sorted by displayOrder then
 * displayName. Use when you need the full catalog (admin tools, AI
 * planner, structural tests). For per-provider listings prefer
 * `listActionMetasForProvider`.
 */
export function listAllActionMetas(): readonly ActionMeta[] {
  return [...ALL_ACTION_META].sort(compareMeta);
}

/**
 * All trigger metas across every provider, sorted by displayOrder then
 * displayName.
 */
export function listAllTriggerMetas(): readonly TriggerMeta[] {
  return [...ALL_TRIGGER_META].sort(compareMeta);
}

export function listActionMetasForProvider(
  provider: string,
): readonly ActionMeta[] {
  return ALL_ACTION_META
    .filter((m) => m.provider === provider)
    .sort(compareMeta);
}

export function listTriggerMetasForProvider(
  provider: string,
): readonly TriggerMeta[] {
  return ALL_TRIGGER_META
    .filter((m) => m.provider === provider)
    .sort(compareMeta);
}

export function getActionMeta(key: string): ActionMeta | undefined {
  return actionByKey.get(key);
}

export function getTriggerMeta(key: string): TriggerMeta | undefined {
  return triggerByKey.get(key);
}

/**
 * Returns the set of provider ids that have at least one action OR
 * trigger meta registered. Used by the providers index route to filter
 * the provider-manifest list to "providers the builder can fully
 * surface today."
 */
export function listProvidersWithMetadata(): readonly string[] {
  const set = new Set<string>();
  for (const m of ALL_ACTION_META) set.add(m.provider);
  for (const m of ALL_TRIGGER_META) set.add(m.provider);
  return [...set].sort();
}
