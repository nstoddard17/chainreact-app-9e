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
];
