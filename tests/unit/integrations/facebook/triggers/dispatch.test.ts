/**
 * @jest-environment node
 *
 * Tests for `integrations/facebook/triggers/_shared/dispatch.ts` —
 * Slice 3.FACEBOOK-5. Page-payload fan-out into the provider-agnostic
 * dispatcher; non-page ignored; edits/likes skipped.
 */
const mockDispatchTriggerEvent = jest.fn();

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...a: unknown[]) => mockDispatchTriggerEvent(...a),
}));

import { dispatchFacebookPagePayload } from "@/integrations/facebook/triggers/_shared/dispatch";

beforeEach(() => {
  mockDispatchTriggerEvent.mockReset();
  mockDispatchTriggerEvent.mockResolvedValue({
    matched: 1,
    enqueued: 1,
    duplicate: false,
    dedupOutage: false,
  });
});

describe("dispatchFacebookPagePayload", () => {
  it("ignores a non-page object (quiet ack, no dispatch)", async () => {
    const summary = await dispatchFacebookPagePayload({ object: "user", entry: [] });
    expect(summary.ignored).toBe(true);
    expect(mockDispatchTriggerEvent).not.toHaveBeenCalled();
  });

  it("dispatches one event per qualifying feed change (post + comment)", async () => {
    const summary = await dispatchFacebookPagePayload({
      object: "page",
      entry: [
        {
          id: "page-1",
          time: 1700000000,
          changes: [
            { field: "feed", value: { item: "status", verb: "add", post_id: "p_1", message: "hi" } },
            { field: "feed", value: { item: "comment", verb: "add", comment_id: "c_1", post_id: "p_1" } },
          ],
        },
      ],
    });
    expect(summary.ignored).toBe(false);
    expect(summary.changes).toBe(2);
    expect(mockDispatchTriggerEvent).toHaveBeenCalledTimes(2);
    const types = mockDispatchTriggerEvent.mock.calls.map((c) => (c[0] as { eventType: string }).eventType);
    expect(types.sort()).toEqual(["new_comment", "new_post"]);
    expect(summary.enqueued).toBe(2);
  });

  it("skips edits / removes / likes (verb !== add, or non-post/comment items)", async () => {
    const summary = await dispatchFacebookPagePayload({
      object: "page",
      entry: [
        {
          id: "page-1",
          changes: [
            { field: "feed", value: { item: "status", verb: "edited", post_id: "p_1" } },
            { field: "feed", value: { item: "status", verb: "remove", post_id: "p_1" } },
            { field: "feed", value: { item: "like", verb: "add" } },
            { field: "mention", value: { item: "status", verb: "add", post_id: "p_2" } },
          ],
        },
      ],
    });
    expect(summary.changes).toBe(0);
    expect(mockDispatchTriggerEvent).not.toHaveBeenCalled();
  });

  it("handles multiple page entries", async () => {
    const summary = await dispatchFacebookPagePayload({
      object: "page",
      entry: [
        { id: "page-1", changes: [{ field: "feed", value: { item: "photo", verb: "add", post_id: "p_1" } }] },
        { id: "page-2", changes: [{ field: "feed", value: { item: "video", verb: "add", post_id: "p_2" } }] },
      ],
    });
    expect(summary.entries).toBe(2);
    expect(summary.changes).toBe(2);
    expect(mockDispatchTriggerEvent).toHaveBeenCalledTimes(2);
  });

  it("skips entries with no usable pageId", async () => {
    const summary = await dispatchFacebookPagePayload({
      object: "page",
      entry: [{ id: "", changes: [{ field: "feed", value: { item: "status", verb: "add", post_id: "p_1" } }] }],
    });
    expect(summary.changes).toBe(0);
    expect(mockDispatchTriggerEvent).not.toHaveBeenCalled();
  });
});
