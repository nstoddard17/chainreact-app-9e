/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-2 — Discord provider manifest invariants.
 */
import { discordManifest } from "@/integrations/discord/manifest";
import { ProviderManifestSchema } from "@/contracts/integration";

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

  it("DOES NOT enable webhookTrigger (Discord triggers deferred per D-DC1)", () => {
    expect(discordManifest.capabilities.webhookTrigger).toBe(false);
  });

  it("DOES NOT enable pollingTrigger (deferred per D-DC1)", () => {
    expect(discordManifest.capabilities.pollingTrigger).toBe(false);
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
