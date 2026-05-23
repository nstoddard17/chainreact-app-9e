/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-7 — Discord new_message dedup wrapper.
 *
 * Pinned contracts:
 *   - Wraps `webhook_event_dedup` keyed on (provider="discord", messageId).
 *   - Fresh result → `{fresh:true, outage:false}`.
 *   - Repeat result → `{fresh:false, outage:false}`.
 *   - `markSeen` throw → fail CLOSED with `{fresh:false, outage:true}`
 *     so caller skips the message (rationale in dedup.ts header).
 */
const mockMarkSeen = jest.fn();
jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

import { checkAndMarkSeen } from "@/integrations/discord/triggers/newMessage/dedup";

beforeEach(() => {
  mockMarkSeen.mockReset();
});

describe("checkAndMarkSeen", () => {
  it("returns {fresh:true, outage:false} on first sighting", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    const result = await checkAndMarkSeen("msg-1");
    expect(result).toEqual({ fresh: true, outage: false });
    expect(mockMarkSeen).toHaveBeenCalledWith("discord", "msg-1");
  });

  it("returns {fresh:false, outage:false} on repeat sighting", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    const result = await checkAndMarkSeen("msg-1");
    expect(result).toEqual({ fresh: false, outage: false });
  });

  it("repeated polls of the same id stay non-fresh (regression guard)", async () => {
    mockMarkSeen
      .mockResolvedValueOnce({ fresh: true })
      .mockResolvedValueOnce({ fresh: false })
      .mockResolvedValueOnce({ fresh: false });
    expect(await checkAndMarkSeen("snow-1")).toEqual({ fresh: true, outage: false });
    expect(await checkAndMarkSeen("snow-1")).toEqual({ fresh: false, outage: false });
    expect(await checkAndMarkSeen("snow-1")).toEqual({ fresh: false, outage: false });
  });

  it("fails CLOSED (outage:true, fresh:false) when markSeen throws", async () => {
    mockMarkSeen.mockRejectedValueOnce(new Error("dedup table outage"));
    const result = await checkAndMarkSeen("msg-1");
    expect(result).toEqual({ fresh: false, outage: true });
  });

  it("scopes the dedup key to provider='discord' (no cross-provider collisions)", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    await checkAndMarkSeen("ambiguous-id");
    expect(mockMarkSeen).toHaveBeenCalledWith("discord", "ambiguous-id");
  });
});
