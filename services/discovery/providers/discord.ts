import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Discord discovery sub-registry — Slice 3.DISCORD-4 (actions) +
 * Slice 3.DISCORD-6 (slash_command trigger) +
 * Slice 3.DISCORD-7 (new_message polling trigger).
 *
 * Per-provider extraction of the Discord meta imports — mirrors the
 * `services/discovery/providers/mailchimp.ts` pattern. Central
 * registry validation (`ActionMetaSchema.parse` +
 * `TriggerMetaSchema.parse` + duplicate-key rejection) still happens
 * in `services/discovery/_registry.ts` — this file is purely an
 * import grouping.
 *
 * **Coverage:** 5 actions, **2 triggers** (`slash_command`,
 * `new_message`).
 *
 * **Trigger architecture decisions** (per
 * `docs/slices/phase-3/discord-trigger-architecture-plan.md`):
 *   - `slash_command` (DISCORD-6) — webhook trigger via Discord's
 *     Interactions Endpoint URL (Ed25519-signed HTTP POST). NOT a
 *     gateway dependency — V1 also served slash commands over HTTP.
 *     Activation registers one guild-scoped command via Discord's
 *     `POST /applications/{app_id}/guilds/{guild_id}/commands`;
 *     deactivation deletes it.
 *   - `new_message` (this slice) — polling trigger over
 *     `GET /channels/{id}/messages?after={id}` at ~5 min cadence.
 *     Loses V1's sub-second latency but ships without gateway
 *     infrastructure. Bot's MESSAGE_CONTENT privileged intent
 *     (Discord Developer Portal) required for `content` to arrive
 *     populated.
 *   - `member_join` — deferred with a hard architectural blocker:
 *     Discord's REST `GET /guilds/{id}/members` sorts by user id (not
 *     join time); audit log doesn't record joins; Application Webhooks
 *     don't cover `GUILD_MEMBER_ADD`. Tracked as
 *     `DISCORD-N-member-join` with named revisit conditions.
 *
 * **Coverage flip rationale:** the meta-coverage structural test
 * (`tests/structure/discovery-meta-coverage.test.ts`) only enforces
 * action ↔ handler 1:1 coverage; trigger coverage is not enforced
 * (precedent: Stripe). DISCORD-4 flipped `discord` into
 * `COVERED_PROVIDERS` with zero triggers; DISCORD-6/7 keep it in
 * COVERED and grow `DISCORD_TRIGGER_METAS`.
 */

import { discordAssignRoleMeta } from "@/integrations/discord/actions/assignRole.meta";
import { discordDeleteMessageMeta } from "@/integrations/discord/actions/deleteMessage.meta";
import { discordEditMessageMeta } from "@/integrations/discord/actions/editMessage.meta";
import { discordFetchMessagesMeta } from "@/integrations/discord/actions/fetchMessages.meta";
import { discordSendMessageMeta } from "@/integrations/discord/actions/sendMessage.meta";
import { discordSlashCommandTriggerMeta } from "@/integrations/discord/triggers/slashCommand/slashCommand.meta";
import { discordNewMessageTriggerMeta } from "@/integrations/discord/triggers/newMessage/newMessage.meta";

/**
 * Discord action metas in displayOrder (10..50). Matches the runtime
 * handler registration order in
 * `services/execution/handlers/_registry.ts` (Slice 3.DISCORD-2).
 */
export const DISCORD_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  discordSendMessageMeta,
  discordEditMessageMeta,
  discordDeleteMessageMeta,
  discordFetchMessagesMeta,
  discordAssignRoleMeta,
];

/**
 * Discord trigger metas in displayOrder:
 *   - 10: `slash_command` (DISCORD-6, webhook)
 *   - 20: `new_message`   (DISCORD-7, polling)
 *
 * `member_join` deferred per the architecture plan (Discord REST has
 * no join-time-indexed endpoint).
 */
export const DISCORD_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  discordSlashCommandTriggerMeta,
  discordNewMessageTriggerMeta,
];
