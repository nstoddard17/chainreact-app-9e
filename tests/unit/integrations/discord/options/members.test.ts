/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-3 — discord:members options resolver.
 */
const mockGuildMembersList = jest.fn();
jest.mock("@/integrations/_shared/discord/api/guilds", () => {
  const actual = jest.requireActual("@/integrations/_shared/discord/api/guilds");
  return {
    ...actual,
    guildMembersList: (...args: unknown[]) => mockGuildMembersList(...args),
  };
});

import { discordMembersResolver } from "@/integrations/discord/options/members";
import { NotFoundError } from "@/integrations/_shared/discord/errors";
import { makeCtx } from "./_testFixtures";

beforeEach(() => {
  mockGuildMembersList.mockReset();
});

describe("discordMembersResolver — shape", () => {
  it("declares requiredDeps=['guildId']", () => {
    expect(discordMembersResolver.source).toBe("discord:members");
    expect(discordMembersResolver.requiredDeps).toEqual(["guildId"]);
  });
});

describe("discordMembersResolver — label priority", () => {
  it("nick > global_name > username > user.id", async () => {
    mockGuildMembersList.mockResolvedValueOnce([
      { user: { id: "u1", username: "alice", global_name: "Alice" }, nick: "Boss" },
      { user: { id: "u2", username: "bob", global_name: "Bobby" } },
      { user: { id: "u3", username: "carol" } },
      { user: { id: "u4" } },
    ]);
    const result = await discordMembersResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items).toEqual([
      { value: "u1", label: "Boss", description: "alice" },
      { value: "u2", label: "Bobby", description: "bob" },
      { value: "u3", label: "carol" },
      { value: "u4", label: "u4" },
    ]);
  });

  it("does NOT duplicate username in description when label === username", async () => {
    mockGuildMembersList.mockResolvedValueOnce([
      { user: { id: "u1", username: "alice" } }, // no nick, no global_name
    ]);
    const result = await discordMembersResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items).toEqual([{ value: "u1", label: "alice" }]);
  });

  it("drops members with no user object", async () => {
    mockGuildMembersList.mockResolvedValueOnce([
      { nick: "ghost" }, // no user
      { user: { id: "u1", username: "alice" } },
    ]);
    const result = await discordMembersResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["u1"]);
  });
});

describe("discordMembersResolver — q filter + pagination", () => {
  it("case-insensitive q filter on label", async () => {
    mockGuildMembersList.mockResolvedValueOnce([
      { user: { id: "u1", username: "alice_admin" } },
      { user: { id: "u2", username: "bob" } },
      { user: { id: "u3", username: "alice_dev" } },
    ]);
    const result = await discordMembersResolver.resolve(
      makeCtx({ deps: { guildId: "g1" }, q: "ALICE" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["u1", "u3"]);
  });

  it("hasMore=true when wire returned full 1000-item page", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      user: { id: `u${i}`, username: `user${i}` },
    }));
    mockGuildMembersList.mockResolvedValueOnce(fullPage);
    const result = await discordMembersResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.hasMore).toBe(true);
  });

  it("calls guildMembersList with limit=1000", async () => {
    mockGuildMembersList.mockResolvedValueOnce([]);
    await discordMembersResolver.resolve(makeCtx({ deps: { guildId: "g1" } }));
    expect(mockGuildMembersList).toHaveBeenCalledWith({ guildId: "g1", limit: 1000 });
  });
});

describe("discordMembersResolver — errors", () => {
  it("throws MISSING_DEPENDENCY when guildId is missing", async () => {
    await expect(
      discordMembersResolver.resolve(makeCtx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("returns empty items on NotFoundError", async () => {
    mockGuildMembersList.mockRejectedValueOnce(new NotFoundError("guild g1 members"));
    const result = await discordMembersResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("throws INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      discordMembersResolver.resolve(
        makeCtx({ integration: null, deps: { guildId: "g1" } }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});
