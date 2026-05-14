/**
 * @jest-environment node
 *
 * Tests for the polling-side dedup wrapper for new_attachment.
 *
 * Pins the per-trigger dedup-key prefix (`attachment:`) — so the same
 * Gmail message id can flow through all three Gmail polling triggers
 * (`new_email`, `new_labeled_email`, `new_attachment`) without
 * colliding in `webhook_event_dedup`.
 */

const mockMarkSeen = jest.fn();
jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

import { checkAndMarkSeenAttachment } from "@/integrations/gmail/triggers/newAttachment/dedup";
import { checkAndMarkSeen } from "@/integrations/gmail/triggers/newEmail/dedup";
import { checkAndMarkSeenLabeled } from "@/integrations/gmail/triggers/newLabeledEmail/dedup";

beforeEach(() => {
  mockMarkSeen.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("checkAndMarkSeenAttachment — prefix behavior", () => {
  it("calls markSeen with provider 'gmail' and key `attachment:<messageId>`", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });

    await checkAndMarkSeenAttachment("msg-001");

    expect(mockMarkSeen).toHaveBeenCalledWith("gmail", "attachment:msg-001");
  });

  it("returns fresh=true on first sight", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    const result = await checkAndMarkSeenAttachment("msg-001");
    expect(result).toEqual({ fresh: true, outage: false });
  });

  it("returns fresh=false when already dedup'd", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    const result = await checkAndMarkSeenAttachment("msg-002");
    expect(result).toEqual({ fresh: false, outage: false });
  });

  it("fails closed on dedup outage", async () => {
    mockMarkSeen.mockRejectedValueOnce(new Error("connection refused"));
    const result = await checkAndMarkSeenAttachment("msg-003");
    expect(result).toEqual({ fresh: false, outage: true });
  });

  it("logs a structured warning on outage with the new_attachment trigger tag", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockMarkSeen.mockRejectedValueOnce(new Error("network"));

    await checkAndMarkSeenAttachment("msg-004");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(warnSpy.mock.calls[0]![0] as string);
    expect(logged).toMatchObject({
      event: "gmail.poll.dedup.outage",
      trigger: "new_attachment",
      messageId: "msg-004",
      error: "network",
    });
  });
});

describe("cross-trigger dedup isolation — all three triggers", () => {
  it("uses DIFFERENT dedup keys for the same Gmail message id across triggers", async () => {
    mockMarkSeen.mockResolvedValue({ fresh: true });

    await checkAndMarkSeen("shared-msg-id");
    await checkAndMarkSeenLabeled("shared-msg-id");
    await checkAndMarkSeenAttachment("shared-msg-id");

    expect(mockMarkSeen).toHaveBeenCalledTimes(3);
    expect(mockMarkSeen).toHaveBeenNthCalledWith(1, "gmail", "shared-msg-id");
    expect(mockMarkSeen).toHaveBeenNthCalledWith(
      2,
      "gmail",
      "labeled:shared-msg-id",
    );
    expect(mockMarkSeen).toHaveBeenNthCalledWith(
      3,
      "gmail",
      "attachment:shared-msg-id",
    );
  });

  it("attachment dedup key is isolated from new_email's bare key", async () => {
    mockMarkSeen.mockResolvedValue({ fresh: true });

    await checkAndMarkSeen("dup-msg");
    await checkAndMarkSeenAttachment("dup-msg");

    const keys = mockMarkSeen.mock.calls.map((c) => c[1]);
    expect(keys).toContain("dup-msg");
    expect(keys).toContain("attachment:dup-msg");
    expect(new Set(keys).size).toBe(2);
  });

  it("attachment dedup key is isolated from new_labeled_email's `labeled:` key", async () => {
    mockMarkSeen.mockResolvedValue({ fresh: true });

    await checkAndMarkSeenLabeled("dup-msg");
    await checkAndMarkSeenAttachment("dup-msg");

    const keys = mockMarkSeen.mock.calls.map((c) => c[1]);
    expect(keys).toContain("labeled:dup-msg");
    expect(keys).toContain("attachment:dup-msg");
    expect(new Set(keys).size).toBe(2);
  });
});
