/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-3 — confirms all 6 Discord resolvers are registered
 * in services/options/_registry.ts with correct shape.
 */
import { getOptionsResolver, listOptionsResolvers } from "@/services/options/_registry";

const EXPECTED: ReadonlyArray<{
  source: string;
  provider: string;
  requiresIntegration: boolean;
  requiredDeps?: readonly string[];
}> = [
  { source: "discord:guilds", provider: "discord", requiresIntegration: true },
  { source: "discord:channels", provider: "discord", requiresIntegration: true, requiredDeps: ["guildId"] },
  { source: "discord:members", provider: "discord", requiresIntegration: true, requiredDeps: ["guildId"] },
  { source: "discord:bot_messages", provider: "discord", requiresIntegration: true, requiredDeps: ["channelId"] },
  { source: "discord:messages", provider: "discord", requiresIntegration: true, requiredDeps: ["channelId"] },
  { source: "discord:roles", provider: "discord", requiresIntegration: true, requiredDeps: ["guildId"] },
];

describe("Discord resolvers — registry wiring", () => {
  it.each(EXPECTED)("$source is registered with the right shape", (expected) => {
    const r = getOptionsResolver(expected.source);
    expect(r).toBeDefined();
    expect(r?.provider).toBe(expected.provider);
    expect(r?.requiresIntegration).toBe(expected.requiresIntegration);
    if (expected.requiredDeps) {
      expect(r?.requiredDeps).toEqual(expected.requiredDeps);
    } else {
      expect(r?.requiredDeps).toBeUndefined();
    }
  });

  it("dep names preserve V1 camelCase verbatim (no snake_case normalization)", () => {
    const channels = getOptionsResolver("discord:channels");
    expect(channels?.requiredDeps).toEqual(["guildId"]);
    expect(channels?.requiredDeps?.[0]).not.toBe("guild_id");

    const messages = getOptionsResolver("discord:messages");
    expect(messages?.requiredDeps).toEqual(["channelId"]);
    expect(messages?.requiredDeps?.[0]).not.toBe("channel_id");
  });

  it("exactly 6 Discord resolvers registered (no more, no less)", () => {
    const discords = listOptionsResolvers().filter((r) => r.provider === "discord");
    expect(discords).toHaveLength(6);
  });
});
