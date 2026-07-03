/**
 * @jest-environment node
 *
 * Pure smoke-channel selection for the Slack write fixtures. A channel is usable when
 * the bot is already a member (post + history work) OR it is PUBLIC (the fixture's
 * join_channel setup makes the bot a member). Private non-member channels are excluded.
 */
import { pickSlackSmokeChannel } from "@/tests/smoke-actions/writeHarnessDeps/slack";

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
