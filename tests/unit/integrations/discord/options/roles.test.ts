/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-3 — discord:roles options resolver.
 */
const mockGuildRolesList = jest.fn();
jest.mock("@/integrations/_shared/discord/api/guilds", () => {
  const actual = jest.requireActual("@/integrations/_shared/discord/api/guilds");
  return {
    ...actual,
    guildRolesList: (...args: unknown[]) => mockGuildRolesList(...args),
  };
});

import { discordRolesResolver } from "@/integrations/discord/options/roles";
import { NotFoundError } from "@/integrations/_shared/discord/errors";
import { makeCtx } from "./_testFixtures";

beforeEach(() => {
  mockGuildRolesList.mockReset();
});

describe("discordRolesResolver — shape", () => {
  it("declares requiredDeps=['guildId']", () => {
    expect(discordRolesResolver.source).toBe("discord:roles");
    expect(discordRolesResolver.requiredDeps).toEqual(["guildId"]);
  });
});

describe("discordRolesResolver — filtering", () => {
  it("drops @everyone (id === guildId)", async () => {
    mockGuildRolesList.mockResolvedValueOnce([
      { id: "g1", name: "@everyone", position: 0 },
      { id: "r1", name: "Member", position: 1 },
    ]);
    const result = await discordRolesResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r1"]);
  });

  it("drops managed roles (bot integrations / boosters)", async () => {
    mockGuildRolesList.mockResolvedValueOnce([
      { id: "r1", name: "Member", position: 1 },
      { id: "bot-integration", name: "ChainReact Bot", position: 5, managed: true },
      { id: "booster", name: "Server Booster", position: 10, managed: true },
    ]);
    const result = await discordRolesResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r1"]);
  });

  it("sorts by position descending (highest first)", async () => {
    mockGuildRolesList.mockResolvedValueOnce([
      { id: "r1", name: "Member", position: 1 },
      { id: "r3", name: "Admin", position: 10 },
      { id: "r2", name: "Mod", position: 5 },
    ]);
    const result = await discordRolesResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r3", "r2", "r1"]);
  });

  it("drops roles missing required fields (no id / no name)", async () => {
    mockGuildRolesList.mockResolvedValueOnce([
      { id: "", name: "no-id" },
      { id: "r1", name: "" },
      { id: "r2", name: "Valid", position: 1 },
    ]);
    const result = await discordRolesResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r2"]);
  });

  it("case-insensitive q filter on label", async () => {
    mockGuildRolesList.mockResolvedValueOnce([
      { id: "r1", name: "Admin", position: 10 },
      { id: "r2", name: "Mod", position: 5 },
      { id: "r3", name: "Moderator", position: 4 },
    ]);
    const result = await discordRolesResolver.resolve(
      makeCtx({ deps: { guildId: "g1" }, q: "MOD" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r2", "r3"]);
  });
});

describe("discordRolesResolver — errors", () => {
  it("throws MISSING_DEPENDENCY when guildId missing", async () => {
    await expect(
      discordRolesResolver.resolve(makeCtx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("returns empty items on NotFoundError", async () => {
    mockGuildRolesList.mockRejectedValueOnce(new NotFoundError("guild g1"));
    const result = await discordRolesResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("throws INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      discordRolesResolver.resolve(
        makeCtx({ integration: null, deps: { guildId: "g1" } }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});
