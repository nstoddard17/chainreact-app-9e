import type { TriggerEvent } from "@/contracts/triggerEvent";
import { hashPayload } from "@/core/workflows/idempotency";

/**
 * Convert a Discord interactions POST body into V2's canonical
 * `TriggerEvent` — Slice 3.DISCORD-6.
 *
 * Discord's INTERACTION_CREATE HTTP payload (interaction type 2 =
 * `APPLICATION_COMMAND`):
 *
 *   {
 *     id: "<interaction snowflake>",          // dedup key
 *     application_id: "<app snowflake>",
 *     type: 2,                                 // APPLICATION_COMMAND
 *     data: {
 *       id: "<command snowflake>",
 *       name: "<command name>",
 *       type: 1,                               // CHAT_INPUT (slash)
 *       options?: [{ name, type, value }, ...] // arguments
 *     },
 *     guild_id: "<guild snowflake>",
 *     channel_id: "<channel snowflake>",
 *     channel?: { id, name?, ... },
 *     member?: {                               // guild-context invoker
 *       user: { id, username, global_name?, discriminator?, ... },
 *       roles: ["..."],
 *       joined_at: "...",
 *     },
 *     user?: { ... },                          // DM-context invoker
 *     token: "...",                            // interaction reply token
 *     version: 1,
 *   }
 *
 * V2 normalizes the interaction-specific shape into a flat payload the
 * variable picker can consume cleanly:
 *
 *   - `eventId`: the interaction id (guaranteed unique per request by
 *     Discord). Drives `(provider, eventId)` dedup.
 *   - `occurredAt`: ISO-8601. Discord doesn't send a timestamp on
 *     interactions; V2 uses `now()` at receive time.
 *   - `accountId`: the guild id. Slash commands are guild-scoped at
 *     V2; per-guild dispatch fan-out + activation are keyed off this.
 *   - `payload`: the flattened, ergonomic view + a raw `interaction`
 *     escape hatch for fields V2 doesn't surface yet.
 *
 * **Sensitive output handling.** The DISCORD-1 audit §5.2 marks
 * `userId` / `userName` / `options` as sensitive in the slash-command
 * trigger meta. This normalize function does NOT redact — it surfaces
 * everything; the run-detail API + variable picker preview consult the
 * meta's `sensitive: true` flags at render time. **The interaction
 * reply token is intentionally NOT surfaced** — it's a write-permission
 * credential (used to call Discord's `interactions/{id}/{token}/callback`
 * endpoint to reply to the user), not a workflow-author-readable value.
 * The receive route is responsible for sending the deferred ACK; the
 * workflow author has no reason to see the token.
 */

export const DISCORD_TRIGGER_EVENT_TYPE = "slash_command";

interface InteractionOption {
  name?: unknown;
  type?: unknown;
  value?: unknown;
}

interface InteractionDataShape {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  options?: unknown;
}

interface InteractionMemberShape {
  user?: {
    id?: unknown;
    username?: unknown;
    global_name?: unknown;
    discriminator?: unknown;
  };
}

interface InteractionUserShape {
  id?: unknown;
  username?: unknown;
  global_name?: unknown;
  discriminator?: unknown;
}

interface InteractionChannelShape {
  id?: unknown;
  name?: unknown;
}

interface InteractionPayloadShape {
  id?: unknown;
  application_id?: unknown;
  type?: unknown;
  data?: InteractionDataShape;
  guild_id?: unknown;
  channel_id?: unknown;
  channel?: InteractionChannelShape;
  member?: InteractionMemberShape;
  user?: InteractionUserShape;
  version?: unknown;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function extractInvokerUser(
  body: InteractionPayloadShape,
): { id: string | null; username: string | null } {
  const memberUser = body.member?.user;
  if (memberUser) {
    return {
      id: stringOrNull(memberUser.id),
      username: stringOrNull(memberUser.username),
    };
  }
  if (body.user) {
    return {
      id: stringOrNull(body.user.id),
      username: stringOrNull(body.user.username),
    };
  }
  return { id: null, username: null };
}

/**
 * Reduce the option tree to a flat `{name: value}` record for ergonomic
 * `{{trigger.payload.options.<arg>}}` access. Discord's option type
 * codes (3=string, 4=integer, 5=boolean, 6=user, 7=channel, 8=role,
 * 9=mentionable, 10=number, 11=attachment) all surface `value` as a
 * scalar — we forward verbatim. Subcommand-group / subcommand
 * options (1 / 2) carry NESTED options instead of `value`; V2 v1
 * surfaces only top-level options. The raw `interaction.data.options`
 * stays available for workflows that need the nested shape.
 */
function flattenOptions(raw: unknown): Record<string, unknown> {
  if (!Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const opt of raw) {
    if (opt === null || typeof opt !== "object") continue;
    const o = opt as InteractionOption;
    const name = stringOrNull(o.name);
    if (!name) continue;
    if ("value" in o && o.value !== undefined) {
      out[name] = o.value;
    }
  }
  return out;
}

export interface NormalizeSlashCommandInput {
  /** Parsed interaction body (`type: 2` APPLICATION_COMMAND). */
  body: Record<string, unknown>;
}

export function normalizeSlashCommand(
  input: NormalizeSlashCommandInput,
): TriggerEvent {
  const body = input.body as InteractionPayloadShape;
  // `body.id` (the interaction snowflake) is the dedup key and is guaranteed
  // unique per request by Discord. The fallback is purely defensive: derive a
  // DETERMINISTIC id from the payload content (NOT a clock) so a replay of the
  // same event hashes to the same eventId and still dedups — `Date.now()` here
  // would mint a fresh id per call and silently break replay dedup.
  const interactionId =
    stringOrNull(body.id) ?? `discord-interaction-${hashPayload(body)}`;
  const guildId = stringOrNull(body.guild_id);
  const channelId = stringOrNull(body.channel_id) ?? stringOrNull(body.channel?.id);
  const channelName = stringOrNull(body.channel?.name);
  const data = body.data ?? {};
  const commandId = stringOrNull(data.id);
  const commandName = stringOrNull(data.name);
  const optionsFlat = flattenOptions(data.options);
  const invoker = extractInvokerUser(body);

  return {
    provider: "discord",
    eventType: DISCORD_TRIGGER_EVENT_TYPE,
    eventId: interactionId,
    occurredAt: new Date().toISOString(),
    // providerAccountId: guild id where the command was invoked. Slash commands
    // are guild-scoped; `null` should never happen for an APPLICATION_COMMAND
    // interaction with type=2, but fall back to "unknown" so the
    // TriggerEvent contract's non-empty-string requirement holds.
    providerAccountId: guildId ?? "unknown",
    payload: {
      interactionId,
      commandId,
      commandName,
      guildId,
      channelId,
      channelName,
      userId: invoker.id,
      userName: invoker.username,
      options: optionsFlat,
      // Forward the raw interaction body for workflows that need fields
      // V2 didn't surface above (subcommand-group nesting, locale,
      // resolved entities, etc.). The interaction reply `token` is
      // STRIPPED from the raw body to keep it out of variable pickers
      // — see normalize header.
      interaction: stripToken(body as unknown as Record<string, unknown>),
    },
  };
}

/**
 * Return a shallow copy of the interaction body with the reply `token`
 * field removed. The `token` is a write-permission credential and must
 * not leak into the variable picker / run detail API. All other fields
 * pass through unchanged.
 */
function stripToken(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "token") continue;
    copy[k] = v;
  }
  return copy;
}
