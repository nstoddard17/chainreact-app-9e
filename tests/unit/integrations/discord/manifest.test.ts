/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-2 — Discord provider manifest invariants.
 */
import { discordManifest } from "@/integrations/discord/manifest";
import { ProviderManifestSchema } from "@/contracts/integration";

import { getProvider, listProviders } from "@/integrations/_registry";
import { listRegisteredHandlers, getActionHandler } from "@/services/execution/handlers/_registry";
describe("discord manifest — structural", () => {
  it("parses against ProviderManifestSchema", () => {
    expect(() => ProviderManifestSchema.parse(discordManifest)).not.toThrow();
  });

  it("uses lowercase id matching the folder name", () => {
    expect(discordManifest.id).toBe("discord");
  });

  it("declares Discord display name", () => {
    expect(discordManifest.displayName).toBe("Discord");
  });

  it("pins Discord REST API at v10", () => {
    expect(discordManifest.apiVersion).toBe("v10");
  });

  it("uses user-scoped tokens (per-user integration row)", () => {
    expect(discordManifest.tokenScope).toBe("user");
  });

  it("is refreshable — Discord identity OAuth returns refresh tokens", () => {
    expect(discordManifest.refreshable).toBe(true);
  });
});

describe("discord manifest — capabilities", () => {
  it("enables OAuth", () => {
    expect(discordManifest.capabilities.oauth).toBe(true);
  });

  it("enables actions (5 handlers ship in DISCORD-2)", () => {
    expect(discordManifest.capabilities.actions).toBe(true);
  });

  it("enables webhookTrigger now that DISCORD-6 shipped slash_command via Interactions Endpoint URL", () => {
    // Was `false` through DISCORD-2..DISCORD-5 (gateway-websocket
    // dependency made every V1 trigger incompatible with V2's webhook
    // contract). DISCORD-5 resolved the D-DC1 deferral with a per-
    // trigger architecture decision: slash_command ships as a webhook
    // trigger via Discord's HTTP-only interactions endpoint (Ed25519
    // signature, per-guild POST commands at activation, no gateway).
    expect(discordManifest.capabilities.webhookTrigger).toBe(true);
  });

  it("enables pollingTrigger now that DISCORD-7 shipped new_message via REST polling", () => {
    // Was `false` through DISCORD-2..6. DISCORD-7 adds the polling
    // trigger over GET /channels/{id}/messages?after={id} per the
    // DISCORD-5 architecture decision — V2-native polling instead of
    // V1's gateway websocket. ~5-min cadence vs V1's sub-second is
    // an accepted tradeoff (see newMessage.meta.ts description).
    expect(discordManifest.capabilities.pollingTrigger).toBe(true);
  });
});

describe("discord manifest — scopes", () => {
  it("requires identify + email + bot + guilds at minimum", () => {
    expect(discordManifest.scopes.required).toEqual(
      expect.arrayContaining(["identify", "email", "bot", "guilds"]),
    );
  });

  it("requires the `bot` scope (triggers inline server picker)", () => {
    expect(discordManifest.scopes.required).toContain("bot");
  });

  it("has no optional or deprecated scopes in DISCORD-2", () => {
    expect(discordManifest.scopes.optional).toEqual([]);
    expect(discordManifest.scopes.deprecated).toEqual([]);
  });
});

describe("discord manifest — health check", () => {
  it("uses a 4-hour health check interval (Slack/GitHub/Notion cohort)", () => {
    expect(discordManifest.healthCheckIntervalMs).toBe(4 * 60 * 60 * 1000);
  });
});

describe("discord manifest — secret-shape guards", () => {
  it("does NOT expose any token / secret as a manifest field", () => {
    // Defense-in-depth: ensure no future edit adds a token shape to the
    // manifest. The bot token is global env-only.
    const serialized = JSON.stringify(discordManifest).toLowerCase();
    expect(serialized).not.toMatch(/discord_bot_token/);
    expect(serialized).not.toMatch(/client_secret/);
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling _registry.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Slice 3.DISCORD-2 — Discord registry wiring assertions.
// Confirms the three registry layers (manifest, OAuth dispatcher,
// execution handler) all have Discord wired with exactly the 5
// V1-manifest-declared actions and nothing more.
// ---------------------------------------------------------------------------

describe("integrations/_registry — discord manifest", () => {
  it("is registered in the aggregated provider registry", () => {
    const m = getProvider("discord");
    expect(m).toBeDefined();
    expect(m?.id).toBe("discord");
  });

  it("appears exactly once in listProviders()", () => {
    const discords = listProviders().filter((p) => p.id === "discord");
    expect(discords).toHaveLength(1);
  });
});

describe("services/execution/handlers/_registry — discord handlers", () => {
  const EXPECTED_ACTIONS: ReadonlyArray<string> = [
    "send_message",
    "edit_message",
    "delete_message",
    "fetch_messages",
    "assign_role",
  ];

  it("registers exactly the 5 V1-manifest-declared actions (no more, no less)", () => {
    const discords = listRegisteredHandlers()
      .filter((h) => h.provider === "discord")
      .map((h) => h.type)
      .sort();
    const expectedSorted = [...EXPECTED_ACTIONS].sort();
    expect(discords).toEqual(expectedSorted);
  });

  it.each(EXPECTED_ACTIONS)(
    "exposes a handler function for discord:%s",
    (type) => {
      const handler = getActionHandler("discord", type);
      expect(typeof handler).toBe("function");
    },
  );

  it("does NOT register any deferred V1 handler (kick/ban/createChannel/etc.)", () => {
    // Slice 3.DISCORD-1 §7.2: the 18 unsurfaced V1 handlers are NOT
    // ported in this arc. Defense-in-depth structural test.
    const DEFERRED: ReadonlyArray<string> = [
      "create_channel",
      "edit_channel",
      "delete_channel",
      "list_channels",
      "create_category",
      "delete_category",
      "send_direct_message",
      "add_reaction",
      "remove_reaction",
      "fetch_guild_members",
      "list_roles",
      "create_role",
      "update_role",
      "delete_role",
      "remove_role",
      "kick_member",
      "ban_member",
      "unban_member",
    ];
    const discordTypes = new Set(
      listRegisteredHandlers().filter((h) => h.provider === "discord").map((h) => h.type),
    );
    for (const t of DEFERRED) {
      expect(discordTypes.has(t)).toBe(false);
    }
  });
});
