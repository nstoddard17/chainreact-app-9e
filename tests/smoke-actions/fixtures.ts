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

export const ALL_SMOKE_FIXTURES: readonly ActionSmokeFixture[] = [
  nativeFormatTransformer,
  slackListChannels,
  slackSendChannelMessage,
  slackDeleteMessage,
];
