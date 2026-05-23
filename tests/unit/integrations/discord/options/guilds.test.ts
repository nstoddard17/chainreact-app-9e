/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-3 — discord:guilds options resolver.
 */
const mockBotGuildsList = jest.fn();
jest.mock("@/integrations/_shared/discord/api/guilds", () => {
  const actual = jest.requireActual("@/integrations/_shared/discord/api/guilds");
  return {
    ...actual,
    botGuildsList: (...args: unknown[]) => mockBotGuildsList(...args),
  };
});

import { discordGuildsResolver } from "@/integrations/discord/options/guilds";
import {
  DiscordApiError,
  DiscordBotTokenMissingError,
} from "@/integrations/_shared/discord/errors";
import { OptionsResolverError } from "@/services/options/types";
import { makeCtx } from "./_testFixtures";

beforeEach(() => {
  mockBotGuildsList.mockReset();
});

describe("discordGuildsResolver — shape", () => {
  it("declares no requiredDeps (top-level picker)", () => {
    expect(discordGuildsResolver.source).toBe("discord:guilds");
    expect(discordGuildsResolver.provider).toBe("discord");
    expect(discordGuildsResolver.requiresIntegration).toBe(true);
    expect(discordGuildsResolver.requiredDeps).toBeUndefined();
  });
});

describe("discordGuildsResolver — happy path", () => {
  it("maps guilds to {value=id, label=name}", async () => {
    mockBotGuildsList.mockResolvedValueOnce([
      { id: "g1", name: "ChainReact HQ" },
      { id: "g2", name: "Workflow Builders" },
    ]);
    const result = await discordGuildsResolver.resolve(makeCtx());
    expect(result.items).toEqual([
      { value: "g1", label: "ChainReact HQ" },
      { value: "g2", label: "Workflow Builders" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("calls botGuildsList with limit=200", async () => {
    mockBotGuildsList.mockResolvedValueOnce([]);
    await discordGuildsResolver.resolve(makeCtx());
    expect(mockBotGuildsList).toHaveBeenCalledWith({ limit: 200 });
  });

  it("falls back to id when guild name is empty", async () => {
    mockBotGuildsList.mockResolvedValueOnce([{ id: "g1", name: "" }]);
    const result = await discordGuildsResolver.resolve(makeCtx());
    expect(result.items).toEqual([{ value: "g1", label: "g1" }]);
  });

  it("drops guilds with missing id", async () => {
    mockBotGuildsList.mockResolvedValueOnce([
      { id: "", name: "no-id" },
      { id: "g1", name: "ok" },
    ]);
    const result = await discordGuildsResolver.resolve(makeCtx());
    expect(result.items).toEqual([{ value: "g1", label: "ok" }]);
  });

  it("applies case-insensitive q filter on label", async () => {
    mockBotGuildsList.mockResolvedValueOnce([
      { id: "g1", name: "Alpha Server" },
      { id: "g2", name: "Beta Server" },
      { id: "g3", name: "Gamma" },
    ]);
    const result = await discordGuildsResolver.resolve(makeCtx({ q: "SERVER" }));
    expect(result.items.map((i) => i.value)).toEqual(["g1", "g2"]);
  });

  it("hasMore=true when wire returned full 200-item page", async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({ id: `g${i}`, name: `G${i}` }));
    mockBotGuildsList.mockResolvedValueOnce(fullPage);
    const result = await discordGuildsResolver.resolve(makeCtx());
    expect(result.hasMore).toBe(true);
  });
});

describe("discordGuildsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null", async () => {
    await expect(
      discordGuildsResolver.resolve(makeCtx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockBotGuildsList).not.toHaveBeenCalled();
  });

  it("maps DiscordBotTokenMissingError → PROVIDER_ERROR (admin-facing wording)", async () => {
    mockBotGuildsList.mockRejectedValueOnce(new DiscordBotTokenMissingError());
    const promise = discordGuildsResolver.resolve(makeCtx());
    await expect(promise).rejects.toBeInstanceOf(OptionsResolverError);
    await expect(promise).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    await expect(promise).rejects.toThrow(/admin/i);
  });

  it("maps DiscordApiError 401 → PROVIDER_ERROR with bot-token-invalid wording", async () => {
    mockBotGuildsList.mockRejectedValueOnce(
      new DiscordApiError(401, 0, "401: Unauthorized"),
    );
    const promise = discordGuildsResolver.resolve(makeCtx());
    await expect(promise).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    await expect(promise).rejects.toThrow(/bot token is invalid/i);
  });

  it("maps DiscordApiError 403 → PROVIDER_ERROR with bot-permission wording", async () => {
    mockBotGuildsList.mockRejectedValueOnce(
      new DiscordApiError(403, 50001, "Missing Access"),
    );
    const promise = discordGuildsResolver.resolve(makeCtx());
    await expect(promise).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    await expect(promise).rejects.toThrow(/lacks access to servers/i);
  });

  it("maps generic errors → PROVIDER_ERROR with generic wording (no secret leakage)", async () => {
    mockBotGuildsList.mockRejectedValueOnce(
      new Error("ECONNRESET: bot-token-deadbeef leaked"),
    );
    let caught: unknown;
    try {
      await discordGuildsResolver.resolve(makeCtx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error & { code?: string };
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toContain("bot-token-deadbeef");
  });
});
