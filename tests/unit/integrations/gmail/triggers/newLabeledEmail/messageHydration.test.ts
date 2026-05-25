/**
 * @jest-environment node
 *
 * Tests for the Gmail new_labeled_email hydration builder.
 *
 * Mirrors newEmail's messageHydration tests, plus two label-specific
 * payload field assertions (`labelAppliedId`, `labelsAdded`) per
 * Gmail 2.3 plan §5.
 */

import { buildLabeledTriggerEvent } from "@/integrations/gmail/triggers/newLabeledEmail/messageHydration";
import { TriggerEventSchema } from "@/contracts/triggerEvent";
import type { UsersMessagesGetResult } from "@/integrations/gmail/api/usersMessagesGet";

function makeMessage(
  overrides: Partial<UsersMessagesGetResult> = {},
): UsersMessagesGetResult {
  return {
    id: "msg-123",
    threadId: "thr-456",
    labelIds: ["INBOX", "Label_5"],
    snippet: "snippet text",
    internalDate: String(Date.UTC(2026, 4, 12, 12, 0, 0)),
    sizeEstimate: 2048,
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "alice@example.com" },
        { name: "To", value: "me@example.com" },
        { name: "Subject", value: "Hi" },
        { name: "Date", value: "Mon, 12 May 2026 12:00:00 +0000" },
        { name: "Message-ID", value: "<orig@example.com>" },
      ],
      ...(overrides.payload ?? {}),
    },
    ...overrides,
  };
}

describe("buildLabeledTriggerEvent", () => {
  it("returns a TriggerEvent that passes the contract schema", () => {
    const event = buildLabeledTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage(),
      labelAppliedId: "Label_5",
      labelsAdded: ["Label_5"],
    });
    expect(() => TriggerEventSchema.parse(event)).not.toThrow();
  });

  it("provider is 'gmail' and eventType is 'new_labeled_email'", () => {
    const event = buildLabeledTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage(),
      labelAppliedId: "Label_5",
      labelsAdded: ["Label_5"],
    });
    expect(event.provider).toBe("gmail");
    expect(event.eventType).toBe("new_labeled_email");
  });

  it("eventId is prefixed with `labeled:` to mirror the dedup-key convention", () => {
    const event = buildLabeledTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage({ id: "abc123" }),
      labelAppliedId: "Label_5",
      labelsAdded: ["Label_5"],
    });
    expect(event.eventId).toBe("labeled:abc123");
  });

  it("accountId is the email address (manifest accountIdField=email)", () => {
    const event = buildLabeledTriggerEvent({
      emailAddress: "alice@example.com",
      message: makeMessage(),
      labelAppliedId: "Label_5",
      labelsAdded: ["Label_5"],
    });
    expect(event.accountId).toBe("alice@example.com");
  });

  it("occurredAt is internalDate as ISO 8601", () => {
    const event = buildLabeledTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage({
        internalDate: String(Date.UTC(2026, 4, 12, 12, 0, 0)),
      }),
      labelAppliedId: "Label_5",
      labelsAdded: ["Label_5"],
    });
    expect(event.occurredAt).toBe("2026-05-12T12:00:00.000Z");
  });

  it("payload includes labelAppliedId echoing the workflow's configured label", () => {
    const event = buildLabeledTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage(),
      labelAppliedId: "Label_42",
      labelsAdded: ["Label_42", "INBOX"],
    });
    expect(event.payload).toMatchObject({ labelAppliedId: "Label_42" });
  });

  it("payload preserves the FULL labelsAdded list from the originating history entry", () => {
    const event = buildLabeledTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage(),
      labelAppliedId: "Label_5",
      labelsAdded: ["Label_5", "INBOX", "IMPORTANT"],
    });
    expect(event.payload).toMatchObject({
      labelsAdded: ["Label_5", "INBOX", "IMPORTANT"],
    });
  });

  it("payload carries existing newEmail metadata fields (headers, labelIds, snippet, etc.)", () => {
    const event = buildLabeledTriggerEvent({
      emailAddress: "me@example.com",
      message: makeMessage(),
      labelAppliedId: "Label_5",
      labelsAdded: ["Label_5"],
    });
    expect(event.payload).toMatchObject({
      id: "msg-123",
      threadId: "thr-456",
      labelIds: ["INBOX", "Label_5"],
      snippet: "snippet text",
      from: "alice@example.com",
      to: "me@example.com",
      subject: "Hi",
      date: "Mon, 12 May 2026 12:00:00 +0000",
      messageId: "<orig@example.com>",
    });
  });

  it("hasAttachments is multipart/mixed heuristic (matches new_email)", () => {
    const eventWith = buildLabeledTriggerEvent({
      emailAddress: "u@x.com",
      message: makeMessage({
        payload: {
          mimeType: "multipart/mixed",
          headers: [{ name: "Subject", value: "S" }],
        },
      }),
      labelAppliedId: "Label_5",
      labelsAdded: ["Label_5"],
    });
    expect(eventWith.payload.hasAttachments).toBe(true);

    const eventWithout = buildLabeledTriggerEvent({
      emailAddress: "u@x.com",
      message: makeMessage({
        payload: {
          mimeType: "text/plain",
          headers: [{ name: "Subject", value: "S" }],
        },
      }),
      labelAppliedId: "Label_5",
      labelsAdded: ["Label_5"],
    });
    expect(eventWithout.payload.hasAttachments).toBe(false);
  });
});
