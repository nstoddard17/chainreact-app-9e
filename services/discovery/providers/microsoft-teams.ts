import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Microsoft Teams discovery sub-registry — Slice 4.TEAMS-META-3.
 *
 * Per-provider extraction of the Teams meta imports so the central
 * `services/discovery/_registry.ts` stays manageable (same pattern as
 * `providers/microsoft-onedrive.ts` / `providers/trello.ts` /
 * `providers/airtable.ts`). The central registry spreads
 * `MICROSOFT_TEAMS_ACTION_METAS` / `MICROSOFT_TEAMS_TRIGGER_METAS`;
 * module-load validation + duplicate-key rejection happen centrally — this
 * file is import grouping only.
 *
 * **Coverage:** 8 actions + 1 webhook trigger. Field names are camelCase to
 * mirror the Teams runtime Zod schemas 1:1 (drift fails the meta-coverage
 * structural test now that `microsoft-teams` is in `COVERED_PROVIDERS`).
 *
 * Picker wiring (resolvers from TEAMS-META-2):
 *   - `teamId` → microsoft-teams:teams (no deps).
 *   - `channelId` → microsoft-teams:channels (dep `teamId`).
 * Every cascade is single-parent on `teamId` — and `teamId`/`channelId` are
 * already real schema fields, so **NO UI-scope additions** were needed
 * (Teams META-3 is pure metadata; no runtime/schema touch).
 *
 * **Risk:** message writes (`send_channel_message`,
 * `reply_to_channel_message`, `send_chat_message`) medium; reads
 * (`get_channel_details`, `get_team_members`) low. **No destructive action**
 * (no delete/archive in the surface) → no `isDestructive` /
 * `requiresConfirmation` anywhere.
 *
 * **Sensitive:** message `bodyContent` (writes + trigger) + trigger
 * `bodyPreview`; channel `email` (`get_channel_details`) + member `email`
 * (`get_team_members` nested). Ids / names / `webUrl` / dates are not marked.
 *
 * **Deferred/rejected resolvers (none referenced):** `microsoft-teams:chats`
 * (chatId typeable), `microsoft-teams:messages` (messageId typeable/
 * trigger-fed), `microsoft-teams:members` (no input consumer).
 *
 * The `new_channel_message` trigger registers its activation in
 * `triggers/newChannelMessage/index.ts` (loaded by
 * `integrations/_registry.ts`), so the trigger-meta-activation-invariant
 * passes without an exemption.
 */

import { microsoftTeamsSendChannelMessageMeta } from "@/integrations/microsoft-teams/actions/sendChannelMessage.meta";
import { microsoftTeamsReplyToChannelMessageMeta } from "@/integrations/microsoft-teams/actions/replyToChannelMessage.meta";
import { microsoftTeamsSendChatMessageMeta } from "@/integrations/microsoft-teams/actions/sendChatMessage.meta";
import { microsoftTeamsGetChannelDetailsMeta } from "@/integrations/microsoft-teams/actions/getChannelDetails.meta";
import { microsoftTeamsGetTeamMembersMeta } from "@/integrations/microsoft-teams/actions/getTeamMembers.meta";
import { microsoftTeamsListTeamsMeta } from "@/integrations/microsoft-teams/actions/listTeams.meta";
import { microsoftTeamsListChannelsMeta } from "@/integrations/microsoft-teams/actions/listChannels.meta";
import { microsoftTeamsListChannelMessagesMeta } from "@/integrations/microsoft-teams/actions/listChannelMessages.meta";

import { microsoftTeamsNewChannelMessageTriggerMeta } from "@/integrations/microsoft-teams/triggers/newChannelMessage/newChannelMessage.meta";

/** Teams action metas in displayOrder (10..80). */
export const MICROSOFT_TEAMS_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  microsoftTeamsSendChannelMessageMeta,
  microsoftTeamsReplyToChannelMessageMeta,
  microsoftTeamsSendChatMessageMeta,
  microsoftTeamsGetChannelDetailsMeta,
  microsoftTeamsGetTeamMembersMeta,
  // Slice 4.TEAMS-READ-2 — read-only list actions.
  microsoftTeamsListTeamsMeta,
  microsoftTeamsListChannelsMeta,
  microsoftTeamsListChannelMessagesMeta,
];

/** Teams trigger metas — 1 per-(team,channel) webhook trigger. */
export const MICROSOFT_TEAMS_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  microsoftTeamsNewChannelMessageTriggerMeta,
];
