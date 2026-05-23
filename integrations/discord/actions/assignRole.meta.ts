import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `discord:assign_role`.
 *
 * Mirrors `assignRole.schema.ts` (3 fields). Required: `guildId`,
 * `userId`, `roleId`. Field names preserve V1 camelCase verbatim.
 *
 * **`userId` is the target member's Discord id** (the user
 * RECEIVING the role) — distinct from the workflow author's
 * ChainReact user id. V1 chose this field name; V2 preserves it per
 * Slice 3.DISCORD-1 §3.1. Documented in `assignRole.schema.ts`.
 *
 * Pickers:
 *   - `guildId` → `discord:guilds`.
 *   - `userId` → `discord:members` (deps: ["guildId"]).
 *   - `roleId` → `discord:roles` (deps: ["guildId"]). Resolver drops
 *     `@everyone` and `managed` roles (un-assignable). Hierarchy
 *     filtering ("only roles below the bot's top role") is
 *     intentionally deferred — Discord enforces it at runtime with
 *     a 403; documented limitation in `discord/options/roles.ts`.
 *
 * Outputs mirror `assignRole.ts:return`. `userId` is marked
 * `sensitive: true` per the Slice 3.DISCORD-1 §5.1 audit
 * recommendation — the EVENT of a specific user being assigned a
 * specific role is privileged information (could leak workflow
 * structure). `success` / `guildId` / `roleId` / `timestamp` are
 * non-sensitive.
 *
 * Risk: medium. Reversible via a future `remove_role` action (not
 * yet ported per D-DC3). Roles may grant elevated permissions —
 * description warns authors. Discord-side role hierarchy + bot
 * permissions still gate the actual assignment.
 */
export const discordAssignRoleMeta: ActionMeta = {
  key: "discord:assign_role",
  provider: "discord",
  type: "assign_role",
  displayName: "Assign Role",
  description:
    "Assign a Discord role to a member. **May grant elevated permissions** (admin / mod roles) — scope the Role picker carefully. Discord's role hierarchy still applies: the bot can only assign roles below its own highest role; assigning above fails with a 403 from Discord.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "guildId",
      label: "Server",
      description: "Discord server. Drives the member + role pickers.",
      type: "combobox",
      optionsSource: "discord:guilds",
      required: true,
      placeholder: "Search servers…",
    },
    {
      name: "userId",
      label: "Member",
      description:
        "Discord member who will receive the role. Picker sourced from `discord:members`; gated on Server.",
      type: "combobox",
      optionsSource: "discord:members",
      dependsOn: "guildId",
      required: true,
      placeholder: "Select Server first",
    },
    {
      name: "roleId",
      label: "Role",
      description:
        "Role to assign. Picker sourced from `discord:roles`; gated on Server. `@everyone` and integration-managed roles (booster, bot integrations) are excluded. **Discord blocks assigning a role higher than the bot's own highest role** — hierarchy filtering is enforced at runtime, not in this picker.",
      type: "combobox",
      optionsSource: "discord:roles",
      dependsOn: "guildId",
      required: true,
      placeholder: "Select Server first",
    },
  ],
  outputs: [
    {
      name: "success",
      type: "boolean",
      description: "Always true on resolve (any Discord-side failure throws). Included for symmetry with V1's output shape.",
    },
    {
      name: "guildId",
      type: "string",
      description: "Discord server id (echoed from input).",
    },
    {
      name: "userId",
      type: "string",
      description:
        "Target Discord member id (echoed from input). Marked sensitive — the EVENT of a specific user being assigned a specific role is privileged information per Slice 3.DISCORD-1 §5.1.",
      sensitive: true,
    },
    {
      name: "roleId",
      type: "string",
      description: "Discord role id (echoed from input).",
    },
    {
      name: "timestamp",
      type: "string",
      description: "ISO-8601 timestamp of the assignment.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Adds a role to a Discord member. May grant elevated permissions — scope the Role picker carefully. Discord's role hierarchy still gates assignment at the API layer.",
};
