/**
 * Action smoke harness — hand-maintained fixture inventory.
 *
 * Explicit imports (same convention as services/execution/handlers/
 * _handlerInventory.ts): adding a fixture means adding the import + an
 * ALL_SMOKE_FIXTURES entry, so a reviewer sees in the diff exactly which actions
 * a slice covers. No filesystem auto-discovery here — the offline CLI does the
 * fs scan for inventory; the Jest harness runs this curated, typed list.
 */
import type { ActionSmokeFixture } from "./contract";
import nativeFormatTransformer from "@/tests/fixtures/action-smoke/native/format_transformer";
// SMOKE-ACTIONS-17 — native logic actions (3 pure-executing + 1 env-gated http).
import nativeDelay from "@/tests/fixtures/action-smoke/native/delay";
import nativeIfThenCondition from "@/tests/fixtures/action-smoke/native/if_then_condition";
import nativeRouter from "@/tests/fixtures/action-smoke/native/router";
import nativeHttpRequest from "@/tests/fixtures/action-smoke/native/http_request";
import slackListChannels from "@/tests/fixtures/action-smoke/slack/list_channels";
import slackSendChannelMessage from "@/tests/fixtures/action-smoke/slack/send_channel_message";
import slackDeleteMessage from "@/tests/fixtures/action-smoke/slack/delete_message";
import slackUpdateMessage from "@/tests/fixtures/action-smoke/slack/update_message";
import slackAddReaction from "@/tests/fixtures/action-smoke/slack/add_reaction";
import slackRemoveReaction from "@/tests/fixtures/action-smoke/slack/remove_reaction";
import slackCreateChannel from "@/tests/fixtures/action-smoke/slack/create_channel";
import slackRenameChannel from "@/tests/fixtures/action-smoke/slack/rename_channel";
import slackSetChannelTopic from "@/tests/fixtures/action-smoke/slack/set_channel_topic";
import slackSetChannelPurpose from "@/tests/fixtures/action-smoke/slack/set_channel_purpose";
import slackArchiveChannel from "@/tests/fixtures/action-smoke/slack/archive_channel";
import slackJoinChannel from "@/tests/fixtures/action-smoke/slack/join_channel";
import slackLeaveChannel from "@/tests/fixtures/action-smoke/slack/leave_channel";
import slackUnarchiveChannel from "@/tests/fixtures/action-smoke/slack/unarchive_channel";
import slackInviteUsersToChannel from "@/tests/fixtures/action-smoke/slack/invite_users_to_channel";
import slackRemoveUserFromChannel from "@/tests/fixtures/action-smoke/slack/remove_user_from_channel";
import slackScheduleMessage from "@/tests/fixtures/action-smoke/slack/schedule_message";
import slackCancelScheduledMessage from "@/tests/fixtures/action-smoke/slack/cancel_scheduled_message";
import slackSendDirectMessage from "@/tests/fixtures/action-smoke/slack/send_direct_message";
import slackPostInteractiveBlocks from "@/tests/fixtures/action-smoke/slack/post_interactive_blocks";
import slackUploadFile from "@/tests/fixtures/action-smoke/slack/upload_file";
import slackDownloadFile from "@/tests/fixtures/action-smoke/slack/download_file";
import slackPinMessage from "@/tests/fixtures/action-smoke/slack/pin_message";
import slackUnpinMessage from "@/tests/fixtures/action-smoke/slack/unpin_message";
// SMOKE-ACTIONS-5 — read-only coverage batch (4 providers).
import slackListUsers from "@/tests/fixtures/action-smoke/slack/list_users";
import slackGetChannelInfo from "@/tests/fixtures/action-smoke/slack/get_channel_info";
import airtableGetBaseSchema from "@/tests/fixtures/action-smoke/airtable/get_base_schema";
import sheetsGetMetadata from "@/tests/fixtures/action-smoke/google-sheets/get_sheet_metadata";
import driveListFiles from "@/tests/fixtures/action-smoke/google-drive/list_files";
// SMOKE-ACTIONS-6 — Slack-only read-only batch.
import slackGetUserInfo from "@/tests/fixtures/action-smoke/slack/get_user_info";
import slackGetMessages from "@/tests/fixtures/action-smoke/slack/get_messages";
import slackListScheduledMessages from "@/tests/fixtures/action-smoke/slack/list_scheduled_messages";
import slackGetThreadMessages from "@/tests/fixtures/action-smoke/slack/get_thread_messages";
import slackGetFileInfo from "@/tests/fixtures/action-smoke/slack/get_file_info";
// SMOKE-ACTIONS-7 — Airtable-only read-only batch.
import airtableGetTableSchema from "@/tests/fixtures/action-smoke/airtable/get_table_schema";
import airtableListRecords from "@/tests/fixtures/action-smoke/airtable/list_records";
import airtableFindRecord from "@/tests/fixtures/action-smoke/airtable/find_record";
import airtableGetRecord from "@/tests/fixtures/action-smoke/airtable/get_record";
// SMOKE-ACTIONS-8 — Google Sheets-only read-only batch.
import sheetsReadRows from "@/tests/fixtures/action-smoke/google-sheets/read_rows";
import sheetsGetCellValue from "@/tests/fixtures/action-smoke/google-sheets/get_cell_value";
import sheetsFindRow from "@/tests/fixtures/action-smoke/google-sheets/find_row";
// SMOKE-ACTIONS-9 — Google Drive read-only batch (new read actions).
import driveGetFileMetadata from "@/tests/fixtures/action-smoke/google-drive/get_file_metadata";
import driveSearchFiles from "@/tests/fixtures/action-smoke/google-drive/search_files";
// SMOKE-ACTIONS-10 — Gmail read-only batch (search + 2 new read actions).
import gmailListLabels from "@/tests/fixtures/action-smoke/gmail/list_labels";
import gmailGetProfile from "@/tests/fixtures/action-smoke/gmail/get_profile";
import gmailSearchEmails from "@/tests/fixtures/action-smoke/gmail/search_emails";
import gmailCreateDraft from "@/tests/fixtures/action-smoke/gmail/create_draft";
import gmailCreateLabel from "@/tests/fixtures/action-smoke/gmail/create_label";
import gmailAddLabel from "@/tests/fixtures/action-smoke/gmail/add_label";
import gmailRemoveLabel from "@/tests/fixtures/action-smoke/gmail/remove_label";
import gmailMarkAsUnread from "@/tests/fixtures/action-smoke/gmail/mark_as_unread";
import gmailMarkAsRead from "@/tests/fixtures/action-smoke/gmail/mark_as_read";
import gmailArchiveEmail from "@/tests/fixtures/action-smoke/gmail/archive_email";
import gmailDeleteEmail from "@/tests/fixtures/action-smoke/gmail/delete_email";
import gmailSendEmail from "@/tests/fixtures/action-smoke/gmail/send_email";
import gmailReplyToEmail from "@/tests/fixtures/action-smoke/gmail/reply_to_email";
import gmailCreateDraftReply from "@/tests/fixtures/action-smoke/gmail/create_draft_reply";
import gmailGetAttachment from "@/tests/fixtures/action-smoke/gmail/get_attachment";
// SMOKE-ACTIONS-11 — Microsoft Outlook mail read-only batch (fetch + 2 new read actions).
import outlookListFolders from "@/tests/fixtures/action-smoke/microsoft-outlook/list_folders";
import outlookGetProfile from "@/tests/fixtures/action-smoke/microsoft-outlook/get_profile";
import outlookFetchEmails from "@/tests/fixtures/action-smoke/microsoft-outlook/fetch_emails";
// SMOKE-ACTIONS-12 — Notion read-only batch (fixture-only; existing read actions).
import notionSearch from "@/tests/fixtures/action-smoke/notion/search";
import notionListUsers from "@/tests/fixtures/action-smoke/notion/list_users";
import notionQueryDatabase from "@/tests/fixtures/action-smoke/notion/query_database";
import notionGetPage from "@/tests/fixtures/action-smoke/notion/get_page";
import notionGetBlock from "@/tests/fixtures/action-smoke/notion/get_block";
import notionGetBlockChildren from "@/tests/fixtures/action-smoke/notion/get_block_children";
// SMOKE-ACTIONS-13 — Microsoft Excel read-only batch (fixture-only; existing read actions).
import excelGetWorkbooks from "@/tests/fixtures/action-smoke/microsoft-excel/get_workbooks";
import excelGetWorksheets from "@/tests/fixtures/action-smoke/microsoft-excel/get_worksheets";
// SMOKE-ACTIONS-14 — Microsoft Excel read-only batch (new range/table read actions).
import excelReadRange from "@/tests/fixtures/action-smoke/microsoft-excel/read_range";
import excelExportSheet from "@/tests/fixtures/action-smoke/microsoft-excel/export_sheet";
import excelReadTableRows from "@/tests/fixtures/action-smoke/microsoft-excel/read_table_rows";
import excelFindRow from "@/tests/fixtures/action-smoke/microsoft-excel/find_row";
// SMOKE-ACTIONS-15 — Microsoft Teams read-only batch (fixture-only; existing read actions).
import teamsGetChannelDetails from "@/tests/fixtures/action-smoke/microsoft-teams/get_channel_details";
import teamsGetTeamMembers from "@/tests/fixtures/action-smoke/microsoft-teams/get_team_members";
// SMOKE-ACTIONS-16 — Microsoft Teams read-only batch (new list actions).
import teamsListTeams from "@/tests/fixtures/action-smoke/microsoft-teams/list_teams";
import teamsListChannels from "@/tests/fixtures/action-smoke/microsoft-teams/list_channels";
import teamsListChannelMessages from "@/tests/fixtures/action-smoke/microsoft-teams/list_channel_messages";
// SMOKE-ACTIONS-18 — Tier-2 zero-coverage provider read batch (12 providers) +
// Notion leftover reads. All read-only, liveSafe, env-gated (SKIP when the
// provider connection / selector env is unset).
import mondayGetBoard from "@/tests/fixtures/action-smoke/monday/get_board";
import mondayGetItem from "@/tests/fixtures/action-smoke/monday/get_item";
import mondayGetUser from "@/tests/fixtures/action-smoke/monday/get_user";
import mondayListBoards from "@/tests/fixtures/action-smoke/monday/list_boards";
import mondayListGroups from "@/tests/fixtures/action-smoke/monday/list_groups";
import mondayListItems from "@/tests/fixtures/action-smoke/monday/list_items";
import mondayListSubitems from "@/tests/fixtures/action-smoke/monday/list_subitems";
import mondayListUpdates from "@/tests/fixtures/action-smoke/monday/list_updates";
import mondayListUsers from "@/tests/fixtures/action-smoke/monday/list_users";
import mondaySearchItems from "@/tests/fixtures/action-smoke/monday/search_items";
import hubspotGetCompanies from "@/tests/fixtures/action-smoke/hubspot/get_companies";
import hubspotGetContacts from "@/tests/fixtures/action-smoke/hubspot/get_contacts";
import hubspotGetDeals from "@/tests/fixtures/action-smoke/hubspot/get_deals";
import hubspotGetLineItems from "@/tests/fixtures/action-smoke/hubspot/get_line_items";
import hubspotGetOwners from "@/tests/fixtures/action-smoke/hubspot/get_owners";
import hubspotGetProducts from "@/tests/fixtures/action-smoke/hubspot/get_products";
import hubspotGetTickets from "@/tests/fixtures/action-smoke/hubspot/get_tickets";
import onenoteGetNotebookDetails from "@/tests/fixtures/action-smoke/microsoft-onenote/get_notebook_details";
import onenoteGetPageContent from "@/tests/fixtures/action-smoke/microsoft-onenote/get_page_content";
import onenoteGetSectionDetails from "@/tests/fixtures/action-smoke/microsoft-onenote/get_section_details";
import onenoteListNotebooks from "@/tests/fixtures/action-smoke/microsoft-onenote/list_notebooks";
import onenoteListPages from "@/tests/fixtures/action-smoke/microsoft-onenote/list_pages";
import onenoteListSections from "@/tests/fixtures/action-smoke/microsoft-onenote/list_sections";
import onenoteCreatePage from "@/tests/fixtures/action-smoke/microsoft-onenote/create_page";
import onenoteUpdatePage from "@/tests/fixtures/action-smoke/microsoft-onenote/update_page";
import onenoteDeletePage from "@/tests/fixtures/action-smoke/microsoft-onenote/delete_page";
import onenoteCopyPage from "@/tests/fixtures/action-smoke/microsoft-onenote/copy_page";
// SMOKE-WRITE-36 — Microsoft Excel write (smoke-owned workbook via OneDrive upload).
import excelCreateWorksheet from "@/tests/fixtures/action-smoke/microsoft-excel/create_worksheet";
// SMOKE-WRITE-37 — Microsoft Excel rename_worksheet (same bootstrap).
import excelRenameWorksheet from "@/tests/fixtures/action-smoke/microsoft-excel/rename_worksheet";
// SMOKE-WRITE-38 — Microsoft Excel delete_worksheet (same bootstrap; seeds a 2nd sheet).
import excelDeleteWorksheet from "@/tests/fixtures/action-smoke/microsoft-excel/delete_worksheet";
// SMOKE-WRITE-39 — Microsoft Excel add_row (same bootstrap; appends to empty Sheet1).
import excelAddRow from "@/tests/fixtures/action-smoke/microsoft-excel/add_row";
// SMOKE-WRITE-40 — Microsoft Excel update_row (same bootstrap; seeds header + data row).
import excelUpdateRow from "@/tests/fixtures/action-smoke/microsoft-excel/update_row";
// SMOKE-WRITE-41 — Microsoft Excel delete_row (same bootstrap; seeds 3 rows, proves shift).
import excelDeleteRow from "@/tests/fixtures/action-smoke/microsoft-excel/delete_row";
// SMOKE-WRITE-42 — Microsoft Excel add_table_row (table-bearing bootstrap workbook).
import excelAddTableRow from "@/tests/fixtures/action-smoke/microsoft-excel/add_table_row";
// SMOKE-WRITE-43 — Microsoft Outlook create_draft_email (smoke-owned draft, never sent).
import outlookCreateDraftEmail from "@/tests/fixtures/action-smoke/microsoft-outlook/create_draft_email";
// SMOKE-WRITE-OUTLOOK-MAIL — Outlook mail finisher batch (send/reply/forward via the
// find_messages marker-poll seam since Graph mail mutations return no id; categories/
// move/trash on smoke-owned drafts; get_attachment stages a dev-test-staged seed).
import outlookSendEmail from "@/tests/fixtures/action-smoke/microsoft-outlook/send_email";
import outlookReplyToEmail from "@/tests/fixtures/action-smoke/microsoft-outlook/reply_to_email";
import outlookForwardEmail from "@/tests/fixtures/action-smoke/microsoft-outlook/forward_email";
import outlookAddCategories from "@/tests/fixtures/action-smoke/microsoft-outlook/add_categories";
import outlookMoveEmail from "@/tests/fixtures/action-smoke/microsoft-outlook/move_email";
import outlookDeleteEmail from "@/tests/fixtures/action-smoke/microsoft-outlook/delete_email";
import outlookGetAttachment from "@/tests/fixtures/action-smoke/microsoft-outlook/get_attachment";
// SMOKE-WRITE-TEAMS — Teams message finisher batch (channel send/reply + chat send;
// verified by the per-message body seam since the registered list read is header-only;
// no registered Teams message delete -> marked message artifacts left).
import teamsSendChannelMessage from "@/tests/fixtures/action-smoke/microsoft-teams/send_channel_message";
import teamsReplyToChannelMessage from "@/tests/fixtures/action-smoke/microsoft-teams/reply_to_channel_message";
import teamsSendChatMessage from "@/tests/fixtures/action-smoke/microsoft-teams/send_chat_message";
// SMOKE-WRITE-FINISHERS — small connected-provider finisher sweep (gdocs export/
// share, onenote notebook/section, notion database, trello board/list).
import gdocsExportDocument from "@/tests/fixtures/action-smoke/google-docs/export_document";
import gdocsShareDocument from "@/tests/fixtures/action-smoke/google-docs/share_document";
import onenoteCreateNotebook from "@/tests/fixtures/action-smoke/microsoft-onenote/create_notebook";
import onenoteCreateSection from "@/tests/fixtures/action-smoke/microsoft-onenote/create_section";
import notionCreateDatabase from "@/tests/fixtures/action-smoke/notion/create_database";
import trelloCreateBoard from "@/tests/fixtures/action-smoke/trello/create_board";
import trelloCreateList from "@/tests/fixtures/action-smoke/trello/create_list";
// SMOKE-WRITE-SHOPIFY — Shopify write lifecycle batch on the partner_test store
// (products/variants/customers left as marked artifacts — no registered deletes;
// orders cancelled where Shopify permits; inventory on a dev-test-staged tracked
// item). All verifies via the shopify per-resource state seams (no read actions).
import shopifyCreateProduct from "@/tests/fixtures/action-smoke/shopify/create_product";
import shopifyUpdateProduct from "@/tests/fixtures/action-smoke/shopify/update_product";
import shopifyCreateProductVariant from "@/tests/fixtures/action-smoke/shopify/create_product_variant";
import shopifyUpdateProductVariant from "@/tests/fixtures/action-smoke/shopify/update_product_variant";
import shopifyCreateCustomer from "@/tests/fixtures/action-smoke/shopify/create_customer";
import shopifyUpdateCustomer from "@/tests/fixtures/action-smoke/shopify/update_customer";
import shopifyCreateOrder from "@/tests/fixtures/action-smoke/shopify/create_order";
import shopifyUpdateOrderStatus from "@/tests/fixtures/action-smoke/shopify/update_order_status";
import shopifyAddOrderNote from "@/tests/fixtures/action-smoke/shopify/add_order_note";
import shopifyCreateFulfillment from "@/tests/fixtures/action-smoke/shopify/create_fulfillment";
import shopifyUpdateInventory from "@/tests/fixtures/action-smoke/shopify/update_inventory";
// SMOKE-WRITE-GITHUB — GitHub write batch on self-owned crsmoke resources only
// (repo/issue/comment/branch/PR/gist). create_repository + create_gist stand alone;
// issue/comment/branch/PR target ONE dev-test-staged shared crsmoke repo. No
// registered deletes -> every artifact is honestly left (no delete_repo scope). All
// verifies via the github per-resource state seams (GitHub registers no read actions).
import githubCreateRepository from "@/tests/fixtures/action-smoke/github/create_repository";
import githubCreateIssue from "@/tests/fixtures/action-smoke/github/create_issue";
import githubAddComment from "@/tests/fixtures/action-smoke/github/add_comment";
import githubCreateBranch from "@/tests/fixtures/action-smoke/github/create_branch";
import githubCreatePullRequest from "@/tests/fixtures/action-smoke/github/create_pull_request";
import githubCreateGist from "@/tests/fixtures/action-smoke/github/create_gist";
// SMOKE-WRITE-FACEBOOK — Facebook post/page lifecycle batch on the connected smoke
// Page only (never a personal timeline; messenger out of scope). Text posts +
// comment + photo are created, read back via the facebook per-object state seams,
// and deleted via the registered delete_post (DELETE /{id}); delete_post proves its
// own deletion. upload_video is a best-effort attempt (synthetic MP4 may be rejected).
import facebookCreatePost from "@/tests/fixtures/action-smoke/facebook/create_post";
import facebookUpdatePost from "@/tests/fixtures/action-smoke/facebook/update_post";
import facebookDeletePost from "@/tests/fixtures/action-smoke/facebook/delete_post";
import facebookCommentOnPost from "@/tests/fixtures/action-smoke/facebook/comment_on_post";
import facebookUploadPhoto from "@/tests/fixtures/action-smoke/facebook/upload_photo";
import facebookUploadVideo from "@/tests/fixtures/action-smoke/facebook/upload_video";
import gaFindConversion from "@/tests/fixtures/action-smoke/google-analytics/find_conversion";
import gaGetRealtimeData from "@/tests/fixtures/action-smoke/google-analytics/get_realtime_data";
import gaRunPivotReport from "@/tests/fixtures/action-smoke/google-analytics/run_pivot_report";
import gaRunReport from "@/tests/fixtures/action-smoke/google-analytics/run_report";
import dropboxGetFileMetadata from "@/tests/fixtures/action-smoke/dropbox/get_file_metadata";
import dropboxListFolder from "@/tests/fixtures/action-smoke/dropbox/list_folder";
import dropboxSearchFiles from "@/tests/fixtures/action-smoke/dropbox/search_files";
import onedriveGetFile from "@/tests/fixtures/action-smoke/microsoft-onedrive/get_file";
import onedriveListItems from "@/tests/fixtures/action-smoke/microsoft-onedrive/list_items";
import mailchimpGetCampaign from "@/tests/fixtures/action-smoke/mailchimp/get_campaign";
import mailchimpGetCampaignStats from "@/tests/fixtures/action-smoke/mailchimp/get_campaign_stats";
import mailchimpGetSubscriber from "@/tests/fixtures/action-smoke/mailchimp/get_subscriber";
import mailchimpGetSubscribers from "@/tests/fixtures/action-smoke/mailchimp/get_subscribers";
import stripeFindCustomer from "@/tests/fixtures/action-smoke/stripe/find_customer";
import stripeFindPaymentIntent from "@/tests/fixtures/action-smoke/stripe/find_payment_intent";
import stripeFindSubscription from "@/tests/fixtures/action-smoke/stripe/find_subscription";
import stripeGetPayments from "@/tests/fixtures/action-smoke/stripe/get_payments";
import discordFetchMessages from "@/tests/fixtures/action-smoke/discord/fetch_messages";
import facebookGetPageInsights from "@/tests/fixtures/action-smoke/facebook/get_page_insights";
import gcalListEvents from "@/tests/fixtures/action-smoke/google-calendar/list_events";
import gdocsGetDocument from "@/tests/fixtures/action-smoke/google-docs/get_document";
import outlookCalListEvents from "@/tests/fixtures/action-smoke/microsoft-outlook-calendar/list_events";
import notionGetUser from "@/tests/fixtures/action-smoke/notion/get_user";
import notionListComments from "@/tests/fixtures/action-smoke/notion/list_comments";
// SMOKE-WRITE — mutating pilots (separate list; run via the write harness, NOT
// the read runner, so registering them never changes read/native smoke behavior).
import airtableCreateRecord from "@/tests/fixtures/action-smoke/airtable/create_record";
import airtableUpdateRecord from "@/tests/fixtures/action-smoke/airtable/update_record";
import airtableDeleteRecord from "@/tests/fixtures/action-smoke/airtable/delete_record";
import airtableCreateMultipleRecords from "@/tests/fixtures/action-smoke/airtable/create_multiple_records";
import airtableUpdateMultipleRecords from "@/tests/fixtures/action-smoke/airtable/update_multiple_records";
import airtableAddAttachment from "@/tests/fixtures/action-smoke/airtable/add_attachment";
import gdriveCreateFolder from "@/tests/fixtures/action-smoke/google-drive/create_folder";
import gdriveUploadFile from "@/tests/fixtures/action-smoke/google-drive/upload_file";
import gdriveDeleteFile from "@/tests/fixtures/action-smoke/google-drive/delete_file";
import gdriveMoveFile from "@/tests/fixtures/action-smoke/google-drive/move_file";
import dropboxCreateFolder from "@/tests/fixtures/action-smoke/dropbox/create_folder";
import dropboxDeleteFile from "@/tests/fixtures/action-smoke/dropbox/delete_file";
import dropboxUploadFile from "@/tests/fixtures/action-smoke/dropbox/upload_file";
import dropboxCopyFile from "@/tests/fixtures/action-smoke/dropbox/copy_file";
import dropboxMoveFile from "@/tests/fixtures/action-smoke/dropbox/move_file";
import onedriveCreateFolder from "@/tests/fixtures/action-smoke/microsoft-onedrive/create_folder";
import onedriveDeleteItem from "@/tests/fixtures/action-smoke/microsoft-onedrive/delete_item";
import onedriveUploadFile from "@/tests/fixtures/action-smoke/microsoft-onedrive/upload_file";
import onedriveMoveItem from "@/tests/fixtures/action-smoke/microsoft-onedrive/move_item";
import onedriveCopyItem from "@/tests/fixtures/action-smoke/microsoft-onedrive/copy_item";
import gcalCreateEvent from "@/tests/fixtures/action-smoke/google-calendar/create_event";
import gcalUpdateEvent from "@/tests/fixtures/action-smoke/google-calendar/update_event";
import gcalDeleteEvent from "@/tests/fixtures/action-smoke/google-calendar/delete_event";
// SMOKE-WRITE-45 — Google Calendar add_attendees (chains off certified create/delete_event).
import gcalAddAttendees from "@/tests/fixtures/action-smoke/google-calendar/add_attendees";
import gdocsCreateDocument from "@/tests/fixtures/action-smoke/google-docs/create_document";
import gdocsUpdateDocument from "@/tests/fixtures/action-smoke/google-docs/update_document";
import gsheetsCreateSpreadsheet from "@/tests/fixtures/action-smoke/google-sheets/create_spreadsheet";
import gsheetsUpdateCell from "@/tests/fixtures/action-smoke/google-sheets/update_cell";
import gsheetsAppendRow from "@/tests/fixtures/action-smoke/google-sheets/append_row";
import gsheetsUpdateRow from "@/tests/fixtures/action-smoke/google-sheets/update_row";
import gsheetsClearRange from "@/tests/fixtures/action-smoke/google-sheets/clear_range";
import gsheetsFormatRange from "@/tests/fixtures/action-smoke/google-sheets/format_range";
import gsheetsBatchUpdate from "@/tests/fixtures/action-smoke/google-sheets/batch_update";
import gsheetsDeleteRow from "@/tests/fixtures/action-smoke/google-sheets/delete_row";
import outlookCalCreateEvent from "@/tests/fixtures/action-smoke/microsoft-outlook-calendar/create_event";
import outlookCalUpdateEvent from "@/tests/fixtures/action-smoke/microsoft-outlook-calendar/update_event";
import outlookCalDeleteEvent from "@/tests/fixtures/action-smoke/microsoft-outlook-calendar/delete_event";
// SMOKE-WRITE-46 — Outlook Calendar add_attendees (chains off certified create/delete_event).
import outlookCalAddAttendees from "@/tests/fixtures/action-smoke/microsoft-outlook-calendar/add_attendees";
import notionCreatePage from "@/tests/fixtures/action-smoke/notion/create_page";
import notionUpdatePage from "@/tests/fixtures/action-smoke/notion/update_page";
import notionAppendBlockChildren from "@/tests/fixtures/action-smoke/notion/append_block_children";
import notionCreateComment from "@/tests/fixtures/action-smoke/notion/create_comment";
import notionCreateDatabaseEntry from "@/tests/fixtures/action-smoke/notion/create_database_entry";
import notionArchivePage from "@/tests/fixtures/action-smoke/notion/archive_page";
import notionRestorePage from "@/tests/fixtures/action-smoke/notion/restore_page";
import trelloCreateCard from "@/tests/fixtures/action-smoke/trello/create_card";
import trelloUpdateCard from "@/tests/fixtures/action-smoke/trello/update_card";
import trelloAddComment from "@/tests/fixtures/action-smoke/trello/add_comment";
import trelloAddLabelToCard from "@/tests/fixtures/action-smoke/trello/add_label_to_card";
import trelloMoveCard from "@/tests/fixtures/action-smoke/trello/move_card";
import trelloArchiveCard from "@/tests/fixtures/action-smoke/trello/archive_card";
import mondayCreateItem from "@/tests/fixtures/action-smoke/monday/create_item";
import mondayUpdateItem from "@/tests/fixtures/action-smoke/monday/update_item";
import mondayCreateUpdate from "@/tests/fixtures/action-smoke/monday/create_update";
import mondayCreateSubitem from "@/tests/fixtures/action-smoke/monday/create_subitem";
import mondayDeleteItem from "@/tests/fixtures/action-smoke/monday/delete_item";
import mondayMoveItem from "@/tests/fixtures/action-smoke/monday/move_item";
import mondayArchiveItem from "@/tests/fixtures/action-smoke/monday/archive_item";
import mondayDuplicateItem from "@/tests/fixtures/action-smoke/monday/duplicate_item";
// SMOKE-WRITE-MONDAY-BOARDS — Monday board/file finisher batch (create_board /
// duplicate_board / create_group / add_column / add_file / download_file), all on
// per-run smoke-owned crsmoke- boards; no registered board delete -> artifacts left.
import mondayCreateBoard from "@/tests/fixtures/action-smoke/monday/create_board";
import mondayDuplicateBoard from "@/tests/fixtures/action-smoke/monday/duplicate_board";
import mondayCreateGroup from "@/tests/fixtures/action-smoke/monday/create_group";
import mondayAddColumn from "@/tests/fixtures/action-smoke/monday/add_column";
import mondayAddFile from "@/tests/fixtures/action-smoke/monday/add_file";
import mondayDownloadFile from "@/tests/fixtures/action-smoke/monday/download_file";
// SMOKE-WRITE-HUBSPOT-CRM — HubSpot CRM lifecycle batch (contact/company/deal
// create+update; verify via the GET-by-id smoke seam, no delete action exists).
import hubspotCreateContact from "@/tests/fixtures/action-smoke/hubspot/create_contact";
import hubspotUpdateContact from "@/tests/fixtures/action-smoke/hubspot/update_contact";
import hubspotCreateCompany from "@/tests/fixtures/action-smoke/hubspot/create_company";
import hubspotUpdateCompany from "@/tests/fixtures/action-smoke/hubspot/update_company";
import hubspotCreateDeal from "@/tests/fixtures/action-smoke/hubspot/create_deal";
import hubspotUpdateDeal from "@/tests/fixtures/action-smoke/hubspot/update_deal";
// SMOKE-WRITE-HUBSPOT-ENGAGE — HubSpot engagement/object batch (note/task/ticket/
// product; verify via the GET-by-id smoke seam, no delete action exists).
import hubspotCreateNote from "@/tests/fixtures/action-smoke/hubspot/create_note";
import hubspotCreateTask from "@/tests/fixtures/action-smoke/hubspot/create_task";
import hubspotCreateTicket from "@/tests/fixtures/action-smoke/hubspot/create_ticket";
import hubspotUpdateTicket from "@/tests/fixtures/action-smoke/hubspot/update_ticket";
import hubspotCreateProduct from "@/tests/fixtures/action-smoke/hubspot/create_product";
import hubspotUpdateProduct from "@/tests/fixtures/action-smoke/hubspot/update_product";
// SMOKE-WRITE-HUBSPOT-LINEITEM — line-item lifecycle on a STAGED parent deal;
// first HubSpot flows with REAL delete cleanup (remove_line_item).
import hubspotCreateLineItem from "@/tests/fixtures/action-smoke/hubspot/create_line_item";
import hubspotUpdateLineItem from "@/tests/fixtures/action-smoke/hubspot/update_line_item";
import hubspotRemoveLineItem from "@/tests/fixtures/action-smoke/hubspot/remove_line_item";
// SMOKE-WRITE-HUBSPOT-CALLMEET — call + meeting engagement records (GET-by-id
// seam verify; no delete action exists -> artifact left).
import hubspotCreateCall from "@/tests/fixtures/action-smoke/hubspot/create_call";
import hubspotCreateMeeting from "@/tests/fixtures/action-smoke/hubspot/create_meeting";
// SMOKE-WRITE-HUBSPOT-LIST — list-membership finisher on a staged MANUAL smoke
// list + staged marker contact (membership added, verified, removed).
import hubspotAddContactToList from "@/tests/fixtures/action-smoke/hubspot/add_contact_to_list";
import hubspotRemoveFromList from "@/tests/fixtures/action-smoke/hubspot/remove_from_list";
// SMOKE-WRITE-MAILCHIMP-SUB — subscriber lifecycle on a discovered audience with
// plus-addressed owner-mailbox emails; every member torn down by
// remove_subscriber delete_permanent (unique per-run addresses).
import mailchimpAddSubscriber from "@/tests/fixtures/action-smoke/mailchimp/add_subscriber";
import mailchimpUpdateSubscriber from "@/tests/fixtures/action-smoke/mailchimp/update_subscriber";
import mailchimpUnsubscribeSubscriber from "@/tests/fixtures/action-smoke/mailchimp/unsubscribe_subscriber";
import mailchimpAddTag from "@/tests/fixtures/action-smoke/mailchimp/add_tag";
import mailchimpRemoveTag from "@/tests/fixtures/action-smoke/mailchimp/remove_tag";
import mailchimpRemoveSubscriber from "@/tests/fixtures/action-smoke/mailchimp/remove_subscriber";
// SMOKE-WRITE-MAILCHIMP-FINISH — notes/events clean via member deletion;
// audience/segment have no registered delete (artifact left, marker-named).
import mailchimpAddNote from "@/tests/fixtures/action-smoke/mailchimp/add_note";
import mailchimpCreateCustomEvent from "@/tests/fixtures/action-smoke/mailchimp/create_custom_event";
import mailchimpCreateAudience from "@/tests/fixtures/action-smoke/mailchimp/create_audience";
import mailchimpCreateSegment from "@/tests/fixtures/action-smoke/mailchimp/create_segment";
// Slice 5.ASANA-1 — Asana first slice: 1 read + 4 writes (create/update/complete
// dispose via complete_task — no Asana delete action ships in this slice).
import asanaGetTask from "@/tests/fixtures/action-smoke/asana/get_task";
import asanaCreateTask from "@/tests/fixtures/action-smoke/asana/create_task";
import asanaUpdateTask from "@/tests/fixtures/action-smoke/asana/update_task";
import asanaCompleteTask from "@/tests/fixtures/action-smoke/asana/complete_task";
import asanaAddCommentToTask from "@/tests/fixtures/action-smoke/asana/add_comment_to_task";
// ASANA-2 — 1 read (list page) + 1 write (create_subtask, disposes via
// complete_task like the ASANA-1 writes).
import asanaListTasksInProject from "@/tests/fixtures/action-smoke/asana/list_tasks_in_project";
import asanaCreateSubtask from "@/tests/fixtures/action-smoke/asana/create_subtask";

export const ALL_SMOKE_FIXTURES: readonly ActionSmokeFixture[] = [
  nativeFormatTransformer,
  nativeDelay,
  nativeIfThenCondition,
  nativeRouter,
  nativeHttpRequest,
  slackListChannels,
  slackSendChannelMessage,
  slackListUsers,
  slackGetChannelInfo,
  airtableGetBaseSchema,
  sheetsGetMetadata,
  driveListFiles,
  slackGetUserInfo,
  slackGetMessages,
  slackListScheduledMessages,
  slackGetThreadMessages,
  slackGetFileInfo,
  airtableGetTableSchema,
  airtableListRecords,
  airtableFindRecord,
  airtableGetRecord,
  sheetsReadRows,
  sheetsGetCellValue,
  sheetsFindRow,
  driveGetFileMetadata,
  driveSearchFiles,
  gmailListLabels,
  gmailGetProfile,
  gmailSearchEmails,
  outlookListFolders,
  outlookGetProfile,
  outlookFetchEmails,
  notionSearch,
  notionListUsers,
  notionQueryDatabase,
  notionGetPage,
  notionGetBlock,
  notionGetBlockChildren,
  excelGetWorkbooks,
  excelGetWorksheets,
  excelReadRange,
  excelExportSheet,
  excelReadTableRows,
  excelFindRow,
  teamsGetChannelDetails,
  teamsGetTeamMembers,
  teamsListTeams,
  teamsListChannels,
  teamsListChannelMessages,
  // SMOKE-ACTIONS-18 — Tier-2 zero-coverage provider reads + Notion leftovers.
  mondayGetBoard,
  mondayGetItem,
  mondayGetUser,
  mondayListBoards,
  mondayListGroups,
  mondayListItems,
  mondayListSubitems,
  mondayListUpdates,
  mondayListUsers,
  mondaySearchItems,
  hubspotGetCompanies,
  hubspotGetContacts,
  hubspotGetDeals,
  hubspotGetLineItems,
  hubspotGetOwners,
  hubspotGetProducts,
  hubspotGetTickets,
  onenoteGetNotebookDetails,
  onenoteGetPageContent,
  onenoteGetSectionDetails,
  onenoteListNotebooks,
  onenoteListPages,
  onenoteListSections,
  gaFindConversion,
  gaGetRealtimeData,
  gaRunPivotReport,
  gaRunReport,
  dropboxGetFileMetadata,
  dropboxListFolder,
  dropboxSearchFiles,
  onedriveGetFile,
  onedriveListItems,
  mailchimpGetCampaign,
  mailchimpGetCampaignStats,
  mailchimpGetSubscriber,
  mailchimpGetSubscribers,
  stripeFindCustomer,
  stripeFindPaymentIntent,
  stripeFindSubscription,
  stripeGetPayments,
  discordFetchMessages,
  facebookGetPageInsights,
  gcalListEvents,
  gdocsGetDocument,
  outlookCalListEvents,
  notionGetUser,
  notionListComments,
  asanaGetTask,
  asanaListTasksInProject,
];

/**
 * Mutating pilot fixtures, run ONLY through the write harness (writeRunner.ts).
 * Kept OUT of ALL_SMOKE_FIXTURES so the read live runner never executes them.
 * Each carries a `writeHarness` spec (setup -> execute -> verify -> cleanup).
 */
export const WRITE_SMOKE_FIXTURES: readonly ActionSmokeFixture[] = [
  airtableCreateRecord,
  airtableUpdateRecord,
  airtableDeleteRecord,
  airtableCreateMultipleRecords,
  airtableUpdateMultipleRecords,
  airtableAddAttachment,
  gdriveCreateFolder,
  gdriveUploadFile,
  gdriveDeleteFile,
  gdriveMoveFile,
  dropboxCreateFolder,
  dropboxDeleteFile,
  dropboxUploadFile,
  dropboxCopyFile,
  dropboxMoveFile,
  onedriveCreateFolder,
  onedriveDeleteItem,
  onedriveUploadFile,
  onedriveMoveItem,
  onedriveCopyItem,
  gcalCreateEvent,
  gcalUpdateEvent,
  gcalDeleteEvent,
  gcalAddAttendees,
  gdocsCreateDocument,
  gdocsUpdateDocument,
  gsheetsCreateSpreadsheet,
  gsheetsUpdateCell,
  gsheetsAppendRow,
  gsheetsUpdateRow,
  gsheetsClearRange,
  gsheetsFormatRange,
  gsheetsBatchUpdate,
  gsheetsDeleteRow,
  onenoteCreatePage,
  onenoteUpdatePage,
  onenoteDeletePage,
  onenoteCopyPage,
  excelCreateWorksheet,
  excelRenameWorksheet,
  excelDeleteWorksheet,
  excelAddRow,
  excelUpdateRow,
  excelDeleteRow,
  excelAddTableRow,
  outlookCreateDraftEmail,
  outlookSendEmail,
  outlookReplyToEmail,
  outlookForwardEmail,
  outlookAddCategories,
  outlookMoveEmail,
  outlookDeleteEmail,
  outlookGetAttachment,
  teamsSendChannelMessage,
  teamsReplyToChannelMessage,
  teamsSendChatMessage,
  gdocsExportDocument,
  gdocsShareDocument,
  onenoteCreateNotebook,
  onenoteCreateSection,
  notionCreateDatabase,
  trelloCreateBoard,
  trelloCreateList,
  shopifyCreateProduct,
  shopifyUpdateProduct,
  shopifyCreateProductVariant,
  shopifyUpdateProductVariant,
  shopifyCreateCustomer,
  shopifyUpdateCustomer,
  shopifyCreateOrder,
  shopifyUpdateOrderStatus,
  shopifyAddOrderNote,
  shopifyCreateFulfillment,
  shopifyUpdateInventory,
  githubCreateRepository,
  githubCreateIssue,
  githubAddComment,
  githubCreateBranch,
  githubCreatePullRequest,
  githubCreateGist,
  facebookCreatePost,
  facebookUpdatePost,
  facebookDeletePost,
  facebookCommentOnPost,
  facebookUploadPhoto,
  facebookUploadVideo,
  outlookCalCreateEvent,
  outlookCalUpdateEvent,
  outlookCalDeleteEvent,
  outlookCalAddAttendees,
  notionCreatePage,
  notionUpdatePage,
  notionAppendBlockChildren,
  notionCreateComment,
  notionCreateDatabaseEntry,
  notionArchivePage,
  notionRestorePage,
  trelloCreateCard,
  trelloUpdateCard,
  trelloAddComment,
  trelloAddLabelToCard,
  trelloMoveCard,
  trelloArchiveCard,
  mondayCreateItem,
  mondayUpdateItem,
  mondayCreateUpdate,
  mondayCreateSubitem,
  mondayDeleteItem,
  mondayMoveItem,
  mondayArchiveItem,
  mondayDuplicateItem,
  mondayCreateBoard,
  mondayDuplicateBoard,
  mondayCreateGroup,
  mondayAddColumn,
  mondayAddFile,
  mondayDownloadFile,
  slackDeleteMessage,
  slackUpdateMessage,
  slackAddReaction,
  slackRemoveReaction,
  slackCreateChannel,
  slackRenameChannel,
  slackSetChannelTopic,
  slackSetChannelPurpose,
  slackArchiveChannel,
  slackJoinChannel,
  slackLeaveChannel,
  slackUnarchiveChannel,
  slackInviteUsersToChannel,
  slackRemoveUserFromChannel,
  slackScheduleMessage,
  slackCancelScheduledMessage,
  slackSendDirectMessage,
  slackPostInteractiveBlocks,
  slackUploadFile,
  slackDownloadFile,
  slackPinMessage,
  slackUnpinMessage,
  gmailCreateDraft,
  gmailCreateLabel,
  gmailAddLabel,
  gmailRemoveLabel,
  gmailMarkAsUnread,
  gmailMarkAsRead,
  gmailArchiveEmail,
  gmailDeleteEmail,
  gmailSendEmail,
  gmailReplyToEmail,
  gmailCreateDraftReply,
  gmailGetAttachment,
  hubspotCreateContact,
  hubspotUpdateContact,
  hubspotCreateCompany,
  hubspotUpdateCompany,
  hubspotCreateDeal,
  hubspotUpdateDeal,
  hubspotCreateNote,
  hubspotCreateTask,
  hubspotCreateTicket,
  hubspotUpdateTicket,
  hubspotCreateProduct,
  hubspotUpdateProduct,
  hubspotCreateLineItem,
  hubspotUpdateLineItem,
  hubspotRemoveLineItem,
  hubspotCreateCall,
  hubspotCreateMeeting,
  hubspotAddContactToList,
  hubspotRemoveFromList,
  mailchimpAddSubscriber,
  mailchimpUpdateSubscriber,
  mailchimpUnsubscribeSubscriber,
  mailchimpAddTag,
  mailchimpRemoveTag,
  mailchimpRemoveSubscriber,
  mailchimpAddNote,
  mailchimpCreateCustomEvent,
  mailchimpCreateAudience,
  mailchimpCreateSegment,
  asanaCreateTask,
  asanaUpdateTask,
  asanaCompleteTask,
  asanaAddCommentToTask,
  asanaCreateSubtask,
];

/** Read + write fixtures — for inventory / validation / certification parity. */
export const ALL_FIXTURES_FOR_INVENTORY: readonly ActionSmokeFixture[] = [
  ...ALL_SMOKE_FIXTURES,
  ...WRITE_SMOKE_FIXTURES,
];
