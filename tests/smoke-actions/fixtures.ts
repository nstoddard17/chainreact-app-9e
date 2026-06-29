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
// SMOKE-ACTIONS-11 — Microsoft Outlook mail read-only batch (fetch + 2 new read actions).
import outlookListFolders from "@/tests/fixtures/action-smoke/microsoft-outlook/list_folders";
import outlookGetProfile from "@/tests/fixtures/action-smoke/microsoft-outlook/get_profile";
import outlookFetchEmails from "@/tests/fixtures/action-smoke/microsoft-outlook/fetch_emails";
// SMOKE-ACTIONS-12 — Notion read-only batch (fixture-only; existing read actions).
import notionSearch from "@/tests/fixtures/action-smoke/notion/search";
import notionListUsers from "@/tests/fixtures/action-smoke/notion/list_users";
import notionQueryDatabase from "@/tests/fixtures/action-smoke/notion/query_database";
import notionGetPage from "@/tests/fixtures/action-smoke/notion/get_page";
// SMOKE-ACTIONS-13 — Microsoft Excel read-only batch (fixture-only; existing read actions).
import excelGetWorkbooks from "@/tests/fixtures/action-smoke/microsoft-excel/get_workbooks";
import excelGetWorksheets from "@/tests/fixtures/action-smoke/microsoft-excel/get_worksheets";
// SMOKE-ACTIONS-14 — Microsoft Excel read-only batch (new range/table read actions).
import excelReadRange from "@/tests/fixtures/action-smoke/microsoft-excel/read_range";
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

export const ALL_SMOKE_FIXTURES: readonly ActionSmokeFixture[] = [
  nativeFormatTransformer,
  nativeDelay,
  nativeIfThenCondition,
  nativeRouter,
  nativeHttpRequest,
  slackListChannels,
  slackSendChannelMessage,
  slackDeleteMessage,
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
  excelGetWorkbooks,
  excelGetWorksheets,
  excelReadRange,
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
  outlookCalCreateEvent,
  outlookCalUpdateEvent,
  outlookCalDeleteEvent,
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
];

/** Read + write fixtures — for inventory / validation / certification parity. */
export const ALL_FIXTURES_FOR_INVENTORY: readonly ActionSmokeFixture[] = [
  ...ALL_SMOKE_FIXTURES,
  ...WRITE_SMOKE_FIXTURES,
];
