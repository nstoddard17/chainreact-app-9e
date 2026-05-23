import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Discord discovery sub-registry — Slice 3.DISCORD-4.
 *
 * Per-provider extraction of the Discord meta imports — mirrors the
 * `services/discovery/providers/mailchimp.ts` pattern. Central
 * registry validation (`ActionMetaSchema.parse` +
 * `TriggerMetaSchema.parse` + duplicate-key rejection) still happens
 * in `services/discovery/_registry.ts` — this file is purely an
 * import grouping.
 *
 * **Coverage:** 5 actions, **0 triggers** (intentional — see below).
 *
 * **Discord triggers are intentionally deferred** per Slice
 * 3.DISCORD-1 §2.3 decision D-DC1:
 *   - All 3 V1 Discord triggers (`member_join`, `new_message`,
 *     `slash_command`) were powered by V1's persistent gateway
 *     WebSocket connection (`lib/integrations/discordGateway.ts`,
 *     1565 lines of long-lived socket infrastructure).
 *   - V2's trigger lifecycle contract recognizes only four
 *     activation modes: `webhook`, `polling`, `manual`, `scheduled`
 *     (see `contracts/triggerMeta.ts:TriggerActivationSchema`).
 *     There is no fifth mode for "long-lived process consumes a
 *     gateway socket" — adding one is a Phase-level infrastructure
 *     change, not a metadata slice.
 *   - Three accepted future paths (none ship in DISCORD-4):
 *     (a) replace gateway with Discord Application Webhooks
 *         (limited topic coverage; doesn't include MESSAGE_CREATE /
 *         GUILD_MEMBER_ADD — the events V1's triggers use);
 *     (b) implement `new_message` as a polling trigger
 *         (loses sub-minute latency; "near real-time" only);
 *     (c) ship `slash_command` via Discord's interactions-endpoint
 *         webhook (requires application config + INTERACTIONS_PUBLIC_KEY
 *         env + slash command registration at activate time).
 *   - **The trigger decision is gated on a separate
 *     `DISCORD-N-triggers` arc.** This file exports an empty
 *     `DISCORD_TRIGGER_METAS` array so the central registry spread
 *     contract stays consistent across providers.
 *
 * **Coverage flip rationale:** the meta-coverage structural test
 * (`tests/structure/discovery-meta-coverage.test.ts`) only enforces
 * action ↔ handler 1:1 coverage; it does NOT enforce trigger
 * coverage (precedent set by Stripe — see test header comment at
 * line 45-46). Adding `discord` to COVERED_PROVIDERS with zero
 * trigger metas is consistent with the Stripe pattern and does not
 * require a new exemption mechanism.
 */

import { discordAssignRoleMeta } from "@/integrations/discord/actions/assignRole.meta";
import { discordDeleteMessageMeta } from "@/integrations/discord/actions/deleteMessage.meta";
import { discordEditMessageMeta } from "@/integrations/discord/actions/editMessage.meta";
import { discordFetchMessagesMeta } from "@/integrations/discord/actions/fetchMessages.meta";
import { discordSendMessageMeta } from "@/integrations/discord/actions/sendMessage.meta";

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
 * Discord trigger metas — intentionally empty. See file header for
 * the D-DC1 decision + the DISCORD-N-triggers gating arc.
 */
export const DISCORD_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [];
