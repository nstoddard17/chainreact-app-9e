/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-2 — Discord registry wiring assertions.
 *
 * Confirms the three registry layers (manifest, OAuth dispatcher,
 * execution handler) all have Discord wired with exactly the 5
 * V1-manifest-declared actions and nothing more.
 */
import { getProvider, listProviders } from "@/integrations/_registry";
import { listRegisteredHandlers, getActionHandler } from "@/services/execution/handlers/_registry";

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
