/**
 * @jest-environment node
 *
 * Tests for the new_attachment poll handler's `matchesAttachmentSource`
 * predicate. This predicate is the load-bearing filter that
 * distinguishes which tagged events from `extractMessageEvents`
 * should hydrate-and-inspect:
 *
 *   - MUST be `source === "messagesAdded"` (labelsAdded events do NOT
 *     fire — a label change isn't a new-attachment event).
 *   - Defensive `messages` events are skipped.
 *
 * The "does this message have attachments" check happens AFTER
 * hydration, via `extractAttachmentMetadata`.
 */

import { matchesAttachmentSource } from "@/integrations/gmail/triggers/newAttachment/poll";
import type { MessageEvent } from "@/integrations/gmail/triggers/newEmail/extractMessageEvents";

function ev(source: MessageEvent["source"], addedLabelIds?: string[]): MessageEvent {
  return {
    id: "msg-1",
    source,
    ...(addedLabelIds ? { addedLabelIds } : {}),
  };
}

describe("matchesAttachmentSource", () => {
  it("returns true for messagesAdded events", () => {
    expect(matchesAttachmentSource(ev("messagesAdded"))).toBe(true);
  });

  it("returns false for labelsAdded events (label changes are not new-attachment events)", () => {
    expect(matchesAttachmentSource(ev("labelsAdded", ["Label_5"]))).toBe(false);
  });

  it("returns false for defensive `messages` events", () => {
    expect(matchesAttachmentSource(ev("messages"))).toBe(false);
  });

  it("does not consider addedLabelIds when source is messagesAdded", () => {
    // messagesAdded events never carry addedLabelIds in practice, but
    // the predicate must still return true based on source alone.
    expect(
      matchesAttachmentSource(ev("messagesAdded", ["INBOX"])),
    ).toBe(true);
  });
});
