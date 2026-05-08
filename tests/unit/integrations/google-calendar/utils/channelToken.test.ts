/**
 * @jest-environment node
 */
import {
  buildChannelToken,
  verifyChannelToken,
} from "@/integrations/google-calendar/utils/channelToken";

beforeEach(() => {
  process.env.WATCH_CHANNEL_SECRET = "test-watch-channel-secret-32bytes";
});

afterEach(() => {
  delete process.env.WATCH_CHANNEL_SECRET;
});

describe("channelToken", () => {
  it("buildChannelToken is deterministic for the same channelId", () => {
    const t1 = buildChannelToken({ channelId: "chainreact-n1-abc" });
    const t2 = buildChannelToken({ channelId: "chainreact-n1-abc" });
    expect(t1).toBe(t2);
  });

  it("different channelIds produce different tokens", () => {
    const t1 = buildChannelToken({ channelId: "chainreact-n1-abc" });
    const t2 = buildChannelToken({ channelId: "chainreact-n1-xyz" });
    expect(t1).not.toBe(t2);
  });

  it("verify accepts the matching token", () => {
    const channelId = "chainreact-n1-abc";
    const token = buildChannelToken({ channelId });
    expect(verifyChannelToken({ channelId }, token)).toBe(true);
  });

  it("verify rejects a tampered token", () => {
    const channelId = "chainreact-n1-abc";
    const token = buildChannelToken({ channelId });
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifyChannelToken({ channelId }, tampered)).toBe(false);
  });

  it("verify rejects a token of different length without throwing", () => {
    expect(verifyChannelToken({ channelId: "x" }, "")).toBe(false);
    expect(verifyChannelToken({ channelId: "x" }, "short")).toBe(false);
  });

  it("verify rejects a token built for a different channelId", () => {
    const tokenForA = buildChannelToken({ channelId: "channel-A" });
    expect(verifyChannelToken({ channelId: "channel-B" }, tokenForA)).toBe(
      false,
    );
  });

  it("buildChannelToken throws when WATCH_CHANNEL_SECRET is missing", () => {
    delete process.env.WATCH_CHANNEL_SECRET;
    expect(() => buildChannelToken({ channelId: "x" })).toThrow(
      /WATCH_CHANNEL_SECRET/,
    );
  });
});
