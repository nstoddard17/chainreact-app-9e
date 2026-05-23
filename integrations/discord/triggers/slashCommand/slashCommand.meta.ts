import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `discord:slash_command`.
 *
 * Webhook-activated trigger backed by Discord's Interactions Endpoint
 * URL. Activation registers ONE guild-scoped slash command with
 * Discord's `POST /applications/{app_id}/guilds/{guild_id}/commands`
 * endpoint at workflow-activate time; deactivation deletes that
 * command. The shared `/api/webhooks/discord` route receives every
 * `INTERACTION_CREATE` POST Discord makes to the deployment-wide
 * interactions endpoint and dispatches to the matching trigger row by
 * (guildId, commandName).
 *
 * **Sensitive-output flags** mirror the Slice 3.DISCORD-1 audit §5.2:
 *   - `userId` — Discord user id of the invoker. Marked sensitive.
 *   - `userName` — invoker's display name / username. Marked sensitive.
 *   - `options` — workflow-author-defined slash-command argument
 *     values; can carry workflow-author-supplied PII. Marked sensitive.
 *   - `interaction` — raw interaction body (reply `token` stripped at
 *     normalize). Marked sensitive — carries nested user / member /
 *     channel objects + raw option tree.
 *
 * **Activation creates a real Discord side effect.** Activating a
 * workflow with this trigger REGISTERS a real slash command in the
 * selected Discord server. Authors will see `/<commandName>` in the
 * server's command autocomplete immediately. Description copy
 * surfaces this so the side effect isn't surprising.
 *
 * **Single guild per workflow.** V2 v1 binds each slash-command
 * trigger to ONE guild (the `guildId` field). A workflow that needs
 * the same command in multiple servers needs to be duplicated — same
 * shape as Discord's own guild-scoped command model.
 */
export const discordSlashCommandTriggerMeta: TriggerMeta = {
  key: "discord:slash_command",
  provider: "discord",
  type: "slash_command",
  displayName: "Slash Command Used",
  description:
    "Fires when a user runs the configured slash command (`/<command>`) inside the selected Discord server. Activation registers a real slash command in your server — it will appear in Discord's command autocomplete immediately. Deactivating the workflow removes the command from Discord.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "guildId",
      label: "Server",
      description:
        "Discord server (guild) the slash command will be registered in. Picker sourced from `discord:guilds` — only servers where ChainReact's bot has been added appear. The bot needs the `applications.commands` OAuth scope on this server for activation to succeed.",
      type: "combobox",
      optionsSource: "discord:guilds",
      required: true,
      placeholder: "Search servers…",
    },
    {
      name: "commandName",
      label: "Command Name",
      description:
        "Slash-command name without the leading `/`. 1-32 chars, lowercase, letters / digits / dashes / underscores only (e.g. `report`, `ticket-create`). Re-activating with an existing name updates the existing command; changing the name creates a new one and the old one is cleaned up at deactivate time.",
      type: "text",
      required: true,
      placeholder: "report",
    },
    {
      name: "commandDescription",
      label: "Command Description",
      description:
        "Short description Discord shows next to the command in its autocomplete UI. 1-100 chars. Discord requires this — the registration will fail without it.",
      type: "text",
      required: true,
      placeholder: "Generate a status report",
    },
  ],
  payloadShape: [
    {
      name: "interactionId",
      type: "string",
      description: "Discord interaction id (snowflake). Globally unique per command invocation; used as the dedup key.",
    },
    {
      name: "commandId",
      type: "string",
      description: "Discord command id (snowflake) — the registration id, not the invocation id.",
    },
    {
      name: "commandName",
      type: "string",
      description: "Name of the slash command that fired (without the leading `/`).",
    },
    {
      name: "guildId",
      type: "string",
      description: "Discord server id where the command was invoked.",
    },
    {
      name: "channelId",
      type: "string",
      description: "Channel the command was invoked in.",
    },
    {
      name: "channelName",
      type: "string",
      description: "Human-readable channel name when Discord supplies it.",
    },
    {
      name: "userId",
      type: "string",
      description:
        "Discord user id of the command invoker. Marked sensitive — Discord user ids are semi-public, but the EVENT of invoking a workflow-author's command is privileged context.",
      sensitive: true,
    },
    {
      name: "userName",
      type: "string",
      description:
        "Display name / username of the invoker. Marked sensitive — PII.",
      sensitive: true,
    },
    {
      name: "options",
      type: "object",
      description:
        "Flat `{name: value}` record of the command's arguments. Marked sensitive — workflow-author-defined option values can carry arbitrary user-typed strings (passwords mistakenly typed in, PII, etc.).",
      sensitive: true,
    },
    {
      name: "interaction",
      type: "object",
      description:
        "Raw Discord interaction body (reply `token` stripped). Marked sensitive — contains nested user / member objects and the raw option tree. Use this when you need fields the flattened payload didn't surface (subcommand groups, resolved entities, locale).",
      sensitive: true,
    },
  ],
  displayOrder: 10,
};
