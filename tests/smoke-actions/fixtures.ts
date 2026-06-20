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

export const ALL_SMOKE_FIXTURES: readonly ActionSmokeFixture[] = [
  nativeFormatTransformer,
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
];
