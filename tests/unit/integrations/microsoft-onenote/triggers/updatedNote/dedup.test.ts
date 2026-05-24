/**
 * @jest-environment node
 *
 * Slice 3.ONENOTE-5 — OneNote updated_note dedup wrapper.
 *
 * Pinned contracts:
 *   - buildEventId returns `${pageId}:${lastModifiedDateTime}`
 *     (composite key — distinct from new_note's `${pageId}:created`
 *     so the two triggers don't suppress each other).
 *   - markSeen → fresh round-trips.
 *   - markSeen throw → outage:true + fresh:false (fail-closed).
 */

const mockMarkSeen = jest.fn();
jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

import {
  buildEventId,
  checkAndMarkSeen,
} from "@/integrations/microsoft-onenote/triggers/updatedNote/dedup";

beforeEach(() => {
  mockMarkSeen.mockReset();
});

describe("updated_note dedup — buildEventId composite key", () => {
  it("composes pageId + lastModifiedDateTime", () => {
    expect(buildEventId("p-1", "2026-05-23T12:20:00Z")).toBe(
      "p-1:2026-05-23T12:20:00Z",
    );
  });

  it("distinct from new_note's `${pageId}:created` namespace", () => {
    const updatedKey = buildEventId("p-1", "2026-05-23T12:20:00Z");
    const newKey = "p-1:created";
    expect(updatedKey).not.toBe(newKey);
  });
});

describe("updated_note dedup — checkAndMarkSeen", () => {
  it("calls markSeen with provider=microsoft-onenote + composite eventId", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    const result = await checkAndMarkSeen("p-1", "2026-05-23T12:20:00Z");
    expect(result).toEqual({ fresh: true, outage: false });
    expect(mockMarkSeen).toHaveBeenCalledWith(
      "microsoft-onenote",
      "p-1:2026-05-23T12:20:00Z",
    );
  });

  it("fresh=false round-trips", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    const result = await checkAndMarkSeen("p-2", "2026-05-23T12:25:00Z");
    expect(result).toEqual({ fresh: false, outage: false });
  });

  it("markSeen throw → outage:true + fresh:false (fail-closed)", async () => {
    mockMarkSeen.mockRejectedValueOnce(new Error("dedup db down"));
    const result = await checkAndMarkSeen("p-3", "2026-05-23T12:30:00Z");
    expect(result).toEqual({ fresh: false, outage: true });
  });
});
