import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { newMessageChannelFilter } from "./newMessageChannel/filter";
import { newDirectMessageFilter } from "./newDirectMessage/filter";
import { newGroupDirectMessageFilter } from "./newGroupDirectMessage/filter";
import { reactionAddedFilter } from "./reactionAdded/filter";
import { reactionRemovedFilter } from "./reactionRemoved/filter";

/**
 * Slack trigger filter registrations (Slack 2.1 Commit 8).
 *
 * Importing this module registers all 5 Slack message + reaction
 * filter implementations with the P-S2 trigger filter registry
 * (`core/triggers/filterRegistry.ts`). Registration is a side
 * effect — the module exports nothing additional callers need.
 *
 * Load sites:
 *   - integrations/_registry.ts (boot pipeline; lifecycle.ts side-
 *     effect-imports _registry).
 *   - app/api/webhooks/slack/route.ts (Slack-specific webhook
 *     receive path; ensures filters are populated before the
 *     dispatcher runs even on a cold serverless invocation that
 *     hasn't touched lifecycle).
 *
 * Multiple imports across the same module graph are safe — JS
 * module caching means registration runs exactly once per process.
 * Cross-process repeats (serverless instances) re-run module init,
 * which re-registers; the filterRegistry is per-process state.
 */

registerTriggerFilter(newMessageChannelFilter);
registerTriggerFilter(newDirectMessageFilter);
registerTriggerFilter(newGroupDirectMessageFilter);
registerTriggerFilter(reactionAddedFilter);
registerTriggerFilter(reactionRemovedFilter);

export {
  newMessageChannelFilter,
  newDirectMessageFilter,
  newGroupDirectMessageFilter,
  reactionAddedFilter,
  reactionRemovedFilter,
};
