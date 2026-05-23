import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Discord discovery sub-registry — Slice 3.DISCORD-4 (actions) +
 * Slice 3.DISCORD-6 (slash_command trigger).
 *
 * Per-provider extraction of the Discord meta imports — mirrors the
 * `services/discovery/providers/mailchimp.ts` pattern. Central
 * registry validation (`ActionMetaSchema.parse` +
 * `TriggerMetaSchema.parse` + duplicate-key rejection) still happens
 * in `services/discovery/_registry.ts` — this file is purely an
 * import grouping.
 *
 * **Coverage:** 5 actions, **1 trigger** (`slash_command`).
 *
 * **Trigger architecture decisions** (per
 * `docs/slices/phase-3/discord-trigger-architecture-plan.md`):
 *   - `slash_command` (this slice) — webhook trigger via Discord's
 *     Interactions Endpoint URL (Ed25519-signed HTTP POST). NOT a
 *     gateway dependency — V1 also served slash commands over HTTP.
 *     Activation registers one guild-scoped command via Discord's
 *     `POST /applications/{app_id}/guilds/{guild_id}/commands`;
 *     deactivation deletes it.
 *   - `new_message` — slated for DISCORD-7 as a polling trigger over
 *     `GET /channels/{id}/messages?after={id}`. Loses V1's sub-second
 *     latency (5-min polling cadence) but ships without gateway
 *     infrastructure. Not in this slice.
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
 * `COVERED_PROVIDERS` with zero triggers; DISCORD-6 keeps it in
 * COVERED and adds one trigger meta to `DISCORD_TRIGGER_METAS`.
 */

import { discordAssignRoleMeta } from "@/integrations/discord/actions/assignRole.meta";
import { discordDeleteMessageMeta } from "@/integrations/discord/actions/deleteMessage.meta";
import { discordEditMessageMeta } from "@/integrations/discord/actions/editMessage.meta";
import { discordFetchMessagesMeta } from "@/integrations/discord/actions/fetchMessages.meta";
import { discordSendMessageMeta } from "@/integrations/discord/actions/sendMessage.meta";
import { discordSlashCommandTriggerMeta } from "@/integrations/discord/triggers/slashCommand/slashCommand.meta";

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
 * Discord trigger metas — `slash_command` only in this slice.
 * `new_message` + `member_join` land in follow-up slices per the
 * trigger-architecture plan.
 */
export const DISCORD_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  discordSlashCommandTriggerMeta,
];
