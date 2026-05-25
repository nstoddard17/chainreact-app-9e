/**
 * @jest-environment node
 *
 * Tests for the polling-side dedup wrapper for new_labeled_email.
 *
 * Pins the per-trigger dedup-key prefix (`labeled:`) — so the same
 * Gmail message id can flow through both `new_email` AND
 * `new_labeled_email` without colliding in `webhook_event_dedup`.
 */

const mockMarkSeen = jest.fn();
jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

import { checkAndMarkSeenLabeled } from "@/integrations/gmail/triggers/newLabeledEmail/dedup";
import { checkAndMarkSeen } from "@/integrations/gmail/triggers/newEmail/dedup";

beforeEach(() => {
  mockMarkSeen.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("checkAndMarkSeenLabeled — prefix behavior", () => {
  it("calls markSeen with provider 'gmail' and key `labeled:<messageId>`", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });

    await checkAndMarkSeenLabeled("msg-001");

    expect(mockMarkSeen).toHaveBeenCalledWith("gmail", "labeled:msg-001");
  });

  it("returns fresh=true on first sight", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    const result = await checkAndMarkSeenLabeled("msg-001");
    expect(result).toEqual({ fresh: true, outage: false });
  });

  it("returns fresh=false when already dedup'd", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    const result = await checkAndMarkSeenLabeled("msg-002");
    expect(result).toEqual({ fresh: false, outage: false });
  });

  it("fails closed on dedup outage", async () => {
    mockMarkSeen.mockRejectedValueOnce(new Error("connection refused"));
    const result = await checkAndMarkSeenLabeled("msg-003");
    expect(result).toEqual({ fresh: false, outage: true });
  });

  it("logs a structured warning on outage with the new_labeled_email trigger tag", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockMarkSeen.mockRejectedValueOnce(new Error("network"));

    await checkAndMarkSeenLabeled("msg-004");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(warnSpy.mock.calls[0]![0] as string);
    expect(logged).toMatchObject({
      event: "gmail.poll.dedup.outage",
      trigger: "new_labeled_email",
      messageId: "msg-004",
      error: "network",
    });
  });
});

describe("cross-trigger dedup isolation — new_email vs new_labeled_email", () => {
  it("uses DIFFERENT dedup keys for the same Gmail message id (no collision)", async () => {
    mockMarkSeen.mockResolvedValue({ fresh: true });

    await checkAndMarkSeen("shared-msg-id");
    await checkAndMarkSeenLabeled("shared-msg-id");

    expect(mockMarkSeen).toHaveBeenCalledTimes(2);
    expect(mockMarkSeen).toHaveBeenNthCalledWith(1, "gmail", "shared-msg-id");
    expect(mockMarkSeen).toHaveBeenNthCalledWith(
      2,
      "gmail",
      "labeled:shared-msg-id",
    );
  });

  it("both triggers can mark the same id fresh independently (no shared state)", async () => {
    // Repo decides freshness; the wrappers just thread the result.
    // Because the keys differ, the repo treats them as independent
    // first-time-seen events.
    mockMarkSeen
      .mockResolvedValueOnce({ fresh: true })   // new_email sees "shared"
      .mockResolvedValueOnce({ fresh: true });  // new_labeled_email sees "labeled:shared"

    const a = await checkAndMarkSeen("shared");
    const b = await checkAndMarkSeenLabeled("shared");

    expect(a).toEqual({ fresh: true, outage: false });
    expect(b).toEqual({ fresh: true, outage: false });
  });
});
