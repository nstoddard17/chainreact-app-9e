/**
 * @jest-environment node
 *
 * Pure smoke-channel selection for the Slack write fixtures. A channel is usable when
 * the bot is already a member (post + history work) OR it is PUBLIC (the fixture's
 * join_channel setup makes the bot a member). Private non-member channels are excluded.
 */
import {
  pickSlackSmokeChannel,
  pickSlackSmokeUserIds,
  extractSlackMessageState,
  extractSlackChannelState,
} from "@/tests/smoke-actions/writeHarnessDeps/slack";

const ch = (o: Record<string, unknown>) => o;

describe("pickSlackSmokeChannel", () => {
  it("prefers a smoke-named channel the bot is already a member of (no join needed)", () => {
    const channels = [
      ch({ id: "C_PUB", name: "test-auto", is_member: false, is_private: false }),
      ch({ id: "C_MEM", name: "smoke-run", is_member: true, is_private: false }),
    ];
    expect(pickSlackSmokeChannel(channels)).toEqual({ channelId: "C_MEM", channelName: "smoke-run" });
  });

  it("falls back to a PUBLIC smoke-named channel the bot can self-join", () => {
    const channels = [ch({ id: "C_PUB", name: "test-automation", is_member: false, is_private: false })];
    expect(pickSlackSmokeChannel(channels)).toEqual({ channelId: "C_PUB", channelName: "test-automation" });
  });

  it("excludes a PRIVATE channel the bot is not a member of (cannot self-join)", () => {
    const channels = [ch({ id: "C_PRIV", name: "test-private", is_member: false, is_private: true })];
    expect(pickSlackSmokeChannel(channels)).toBeNull();
  });

  it("never picks a non-smoke-named channel", () => {
    const channels = [ch({ id: "C_RAND", name: "general", is_member: true, is_private: false })];
    expect(pickSlackSmokeChannel(channels)).toBeNull();
  });

  it("never picks an ARCHIVED channel (a smoke-created crsmoke channel cannot be posted to)", () => {
    const channels = [
      ch({ id: "C_ARCH", name: "crsmoke-x-cc", is_member: true, is_private: false, is_archived: true }),
      ch({ id: "C_LIVE", name: "smoke-live", is_member: true, is_private: false }),
    ];
    expect(pickSlackSmokeChannel(channels)).toEqual({ channelId: "C_LIVE", channelName: "smoke-live" });
  });

  it("honors a pinned id when that channel is usable", () => {
    const channels = [
      ch({ id: "C_PIN", name: "anything", is_member: true, is_private: false }),
      ch({ id: "C_OTHER", name: "smoke", is_member: true, is_private: false }),
    ];
    expect(pickSlackSmokeChannel(channels, "C_PIN")).toEqual({ channelId: "C_PIN", channelName: "anything" });
  });

  it("rejects a pinned id that is a private non-member channel", () => {
    const channels = [ch({ id: "C_PIN", name: "smoke", is_member: false, is_private: true })];
    expect(pickSlackSmokeChannel(channels, "C_PIN")).toBeNull();
  });
});

describe("extractSlackMessageState", () => {
  const msgs = [
    ch({ ts: "1.1", text: "crsmoke-x-updated", reactions: [{ name: "white_check_mark", count: 1 }] }),
    ch({ ts: "2.2", text: "someone else", reactions: [{ name: "eyes" }] }),
  ];

  it("returns the target message's current text + reaction names", () => {
    expect(extractSlackMessageState(msgs, "1.1")).toEqual({
      found: true,
      text: "crsmoke-x-updated",
      reactions: ["white_check_mark"],
    });
  });

  it("reads reactions ONLY from the matched message (not the whole window)", () => {
    // ts 2.2 has `eyes`, not white_check_mark — proves per-message precision.
    expect(extractSlackMessageState(msgs, "2.2").reactions).toEqual(["eyes"]);
  });

  it("reports not found (empty state) when the ts is absent", () => {
    expect(extractSlackMessageState(msgs, "9.9")).toEqual({ found: false, text: "", reactions: [] });
  });

  it("treats a message with no reactions field as an empty reaction list", () => {
    const m = [ch({ ts: "3.3", text: "crsmoke-x-react" })];
    expect(extractSlackMessageState(m, "3.3")).toEqual({ found: true, text: "crsmoke-x-react", reactions: [] });
  });
});

describe("extractSlackChannelState", () => {
  const channels = [
    ch({
      id: "C_A",
      name: "crsmoke-x-after",
      is_archived: true,
      is_member: true,
      topic: { value: "crsmoke-x-topicset here" },
      purpose: { value: "crsmoke-x-purposeset here" },
    }),
    ch({ id: "C_B", name: "general" }),
  ];

  it("flattens the target channel's name/topic/purpose/is_archived/is_member by id", () => {
    expect(extractSlackChannelState(channels, "C_A")).toEqual({
      found: true,
      name: "crsmoke-x-after",
      topic: "crsmoke-x-topicset here",
      purpose: "crsmoke-x-purposeset here",
      is_archived: true,
      is_member: true,
    });
  });

  it("defaults missing topic/purpose to empty strings and is_archived/is_member to false", () => {
    expect(extractSlackChannelState(channels, "C_B")).toEqual({
      found: true,
      name: "general",
      topic: "",
      purpose: "",
      is_archived: false,
      is_member: false,
    });
  });

  it("reports not found when the id is absent", () => {
    expect(extractSlackChannelState(channels, "C_ZZZ")).toEqual({
      found: false,
      name: "",
      topic: "",
      purpose: "",
      is_archived: false,
      is_member: false,
    });
  });
});

describe("pickSlackSmokeUserIds", () => {
  it("keeps real human members and drops bots, Slackbot, and deleted users", () => {
    const members = [
      { id: "USLACKBOT", name: "slackbot" },
      { id: "UBOT1", name: "app", is_bot: true },
      { id: "UDEL", name: "gone", deleted: true },
      { id: "UHUMAN1", name: "alice" },
      { id: "UHUMAN2", name: "bob" },
    ];
    expect(pickSlackSmokeUserIds(members)).toEqual(["UHUMAN1", "UHUMAN2"]);
  });

  it("returns an empty list when no eligible human exists", () => {
    const members = [
      { id: "USLACKBOT", name: "slackbot" },
      { id: "UBOT1", name: "app", is_bot: true },
    ];
    expect(pickSlackSmokeUserIds(members)).toEqual([]);
  });
});
