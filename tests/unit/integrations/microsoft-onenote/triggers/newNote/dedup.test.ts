/**
 * @jest-environment node
 *
 * Slice 3.ONENOTE-5 — OneNote new_note dedup wrapper.
 *
 * Pinned contracts:
 *   - buildEventId returns `${pageId}:created` exactly.
 *   - markSeen is called with provider="microsoft-onenote" + the
 *     composed eventId.
 *   - fresh:true round-trips through.
 *   - fresh:false round-trips through.
 *   - markSeen throw → outage:true, fresh:false (fail-closed).
 */

const mockMarkSeen = jest.fn();
jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

import {
  buildEventId,
  checkAndMarkSeen,
} from "@/integrations/microsoft-onenote/triggers/newNote/dedup";

beforeEach(() => {
  mockMarkSeen.mockReset();
});

describe("new_note dedup — buildEventId", () => {
  it("returns `${pageId}:created` namespace", () => {
    expect(buildEventId("p-1")).toBe("p-1:created");
    expect(buildEventId("0-ABCD1234")).toBe("0-ABCD1234:created");
  });
});

describe("new_note dedup — checkAndMarkSeen", () => {
  it("marks seen with provider=microsoft-onenote + composed eventId, fresh round-trips", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    const result = await checkAndMarkSeen("p-1");
    expect(result).toEqual({ fresh: true, outage: false });
    expect(mockMarkSeen).toHaveBeenCalledWith("microsoft-onenote", "p-1:created");
  });

  it("fresh=false round-trips (already processed in a prior tick)", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    const result = await checkAndMarkSeen("p-2");
    expect(result).toEqual({ fresh: false, outage: false });
  });

  it("markSeen throw → outage:true + fresh:false (fail-closed)", async () => {
    mockMarkSeen.mockRejectedValueOnce(new Error("dedup db down"));
    const result = await checkAndMarkSeen("p-3");
    expect(result).toEqual({ fresh: false, outage: true });
  });
});
