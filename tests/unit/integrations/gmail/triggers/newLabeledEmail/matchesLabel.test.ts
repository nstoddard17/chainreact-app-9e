/**
 * @jest-environment node
 *
 * Tests for the new_labeled_email poll handler's `matchesLabel`
 * predicate. The predicate is the load-bearing filter that
 * distinguishes which tagged events from `extractMessageEvents`
 * should fire the trigger:
 *
 *   - MUST be `source === "labelsAdded"` (messagesAdded and
 *     defensive `messages` events are skipped).
 *   - MUST include the workflow's configured labelId in
 *     `addedLabelIds`.
 *
 * Together these guarantees keep `new_labeled_email` from firing
 * on raw new-message arrivals (the `new_email` trigger's surface)
 * AND keep it from firing on labelsAdded events for unrelated
 * labels.
 */

import { matchesLabel } from "@/integrations/gmail/triggers/newLabeledEmail/poll";
import type { MessageEvent } from "@/integrations/gmail/triggers/newEmail/extractMessageEvents";

function ev(overrides: Partial<MessageEvent> & Pick<MessageEvent, "source">): MessageEvent {
  return {
    id: "msg-1",
    ...overrides,
  } as MessageEvent;
}

describe("matchesLabel", () => {
  it("returns true when source is labelsAdded AND addedLabelIds includes the configured labelId", () => {
    expect(
      matchesLabel(
        ev({ source: "labelsAdded", addedLabelIds: ["Label_5"] }),
        "Label_5",
      ),
    ).toBe(true);
  });

  it("returns true when addedLabelIds includes the configured labelId among other labels", () => {
    expect(
      matchesLabel(
        ev({
          source: "labelsAdded",
          addedLabelIds: ["INBOX", "Label_5", "IMPORTANT"],
        }),
        "Label_5",
      ),
    ).toBe(true);
  });

  it("returns false for labelsAdded events whose addedLabelIds does NOT include the configured labelId", () => {
    expect(
      matchesLabel(
        ev({
          source: "labelsAdded",
          addedLabelIds: ["INBOX", "IMPORTANT"],
        }),
        "Label_5",
      ),
    ).toBe(false);
  });

  it("returns false for messagesAdded events even when the message would carry the configured label", () => {
    // messagesAdded never has addedLabelIds — and even if Gmail
    // surprised us by including some, the predicate filters by
    // source first. This is the new_email-vs-new_labeled_email
    // separation contract.
    expect(
      matchesLabel(
        ev({ source: "messagesAdded" }),
        "Label_5",
      ),
    ).toBe(false);
  });

  it("returns false for defensive `messages` events", () => {
    expect(
      matchesLabel(ev({ source: "messages" }), "Label_5"),
    ).toBe(false);
  });

  it("returns false for labelsAdded events with undefined addedLabelIds (defensive)", () => {
    expect(
      matchesLabel(
        ev({ source: "labelsAdded" }), // no addedLabelIds field
        "Label_5",
      ),
    ).toBe(false);
  });

  it("returns false for labelsAdded events with empty addedLabelIds", () => {
    expect(
      matchesLabel(
        ev({ source: "labelsAdded", addedLabelIds: [] }),
        "Label_5",
      ),
    ).toBe(false);
  });

  it("treats labelId match as exact (no substring/prefix match)", () => {
    expect(
      matchesLabel(
        ev({
          source: "labelsAdded",
          addedLabelIds: ["Label_50", "Label_500"],
        }),
        "Label_5",
      ),
    ).toBe(false);
  });
});
