/**
 * @jest-environment node
 *
 * Tests for the Gmail new_attachment hydration builder.
 *
 * Mirrors newEmail / newLabeledEmail messageHydration tests, plus the
 * attachment-specific payload field assertions (`attachments`,
 * `attachmentCount`) and the metadata-only invariant from Gmail 2.3
 * plan §13.2: no FileRef, no bytes / base64 / content / data at the
 * trigger boundary.
 */

import { buildAttachmentTriggerEvent } from "@/integrations/gmail/triggers/newAttachment/messageHydration";
import { TriggerEventSchema } from "@/contracts/triggerEvent";
import type { UsersMessagesGetResult } from "@/integrations/gmail/api/usersMessagesGet";
import type { AttachmentMeta } from "@/integrations/gmail/triggers/newAttachment/extractAttachmentMetadata";

function makeMessage(
  overrides: Partial<UsersMessagesGetResult> = {},
): UsersMessagesGetResult {
  return {
    id: "msg-123",
    threadId: "thr-456",
    labelIds: ["INBOX"],
    snippet: "snippet text",
    internalDate: String(Date.UTC(2026, 4, 12, 12, 0, 0)),
    sizeEstimate: 4096,
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "alice@example.com" },
        { name: "To", value: "me@example.com" },
        { name: "Subject", value: "Doc attached" },
        { name: "Date", value: "Mon, 12 May 2026 12:00:00 +0000" },
        { name: "Message-ID", value: "<orig@example.com>" },
      ],
      ...(overrides.payload ?? {}),
    },
    ...overrides,
  };
}

const oneAttachment: AttachmentMeta[] = [
  {
    attachmentId: "att-1",
    filename: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
  },
];

describe("buildAttachmentTriggerEvent", () => {
  it("returns a TriggerEvent that passes the contract schema", () => {
    const event = buildAttachmentTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage(),
      attachments: oneAttachment,
    });
    expect(() => TriggerEventSchema.parse(event)).not.toThrow();
  });

  it("provider is 'gmail' and eventType is 'new_attachment'", () => {
    const event = buildAttachmentTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage(),
      attachments: oneAttachment,
    });
    expect(event.provider).toBe("gmail");
    expect(event.eventType).toBe("new_attachment");
  });

  it("eventId is prefixed with `attachment:` to mirror the dedup-key convention", () => {
    const event = buildAttachmentTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage({ id: "abc123" }),
      attachments: oneAttachment,
    });
    expect(event.eventId).toBe("attachment:abc123");
  });

  it("accountId is the email address (manifest accountIdField=email)", () => {
    const event = buildAttachmentTriggerEvent({
      emailAddress: "alice@example.com",
      message: makeMessage(),
      attachments: oneAttachment,
    });
    expect(event.providerAccountId).toBe("alice@example.com");
  });

  it("occurredAt is internalDate as ISO 8601", () => {
    const event = buildAttachmentTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage({
        internalDate: String(Date.UTC(2026, 4, 12, 12, 0, 0)),
      }),
      attachments: oneAttachment,
    });
    expect(event.occurredAt).toBe("2026-05-12T12:00:00.000Z");
  });

  it("payload includes the attachments array verbatim", () => {
    const event = buildAttachmentTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage(),
      attachments: oneAttachment,
    });
    expect(event.payload.attachments).toEqual(oneAttachment);
  });

  it("payload.attachmentCount equals attachments.length", () => {
    const two: AttachmentMeta[] = [
      ...oneAttachment,
      {
        attachmentId: "att-2",
        filename: "b.png",
        mimeType: "image/png",
        sizeBytes: 500,
      },
    ];
    const event = buildAttachmentTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage(),
      attachments: two,
    });
    expect(event.payload.attachmentCount).toBe(2);
  });

  it("payload carries existing Gmail metadata fields (headers, labelIds, snippet, etc.)", () => {
    const event = buildAttachmentTriggerEvent({
      emailAddress: "me@example.com",
      message: makeMessage(),
      attachments: oneAttachment,
    });
    expect(event.payload).toMatchObject({
      id: "msg-123",
      threadId: "thr-456",
      labelIds: ["INBOX"],
      snippet: "snippet text",
      from: "alice@example.com",
      to: "me@example.com",
      subject: "Doc attached",
      date: "Mon, 12 May 2026 12:00:00 +0000",
      messageId: "<orig@example.com>",
    });
  });

  it("hasAttachments is multipart/mixed heuristic (matches new_email)", () => {
    const eventWith = buildAttachmentTriggerEvent({
      emailAddress: "u@x.com",
      message: makeMessage({
        payload: {
          mimeType: "multipart/mixed",
          headers: [{ name: "Subject", value: "S" }],
        },
      }),
      attachments: oneAttachment,
    });
    expect(eventWith.payload.hasAttachments).toBe(true);
  });

  describe("metadata-only invariant — no bytes / FileRef / content / data", () => {
    it("payload has no `data` field at the top level", () => {
      const event = buildAttachmentTriggerEvent({
        emailAddress: "u@x.com",
        message: makeMessage(),
        attachments: oneAttachment,
      });
      expect(event.payload).not.toHaveProperty("data");
    });

    it("payload has no `base64` field", () => {
      const event = buildAttachmentTriggerEvent({
        emailAddress: "u@x.com",
        message: makeMessage(),
        attachments: oneAttachment,
      });
      expect(event.payload).not.toHaveProperty("base64");
    });

    it("payload has no `bytes` field", () => {
      const event = buildAttachmentTriggerEvent({
        emailAddress: "u@x.com",
        message: makeMessage(),
        attachments: oneAttachment,
      });
      expect(event.payload).not.toHaveProperty("bytes");
    });

    it("payload has no `content` field", () => {
      const event = buildAttachmentTriggerEvent({
        emailAddress: "u@x.com",
        message: makeMessage(),
        attachments: oneAttachment,
      });
      expect(event.payload).not.toHaveProperty("content");
    });

    it("payload has no `fileRef` field", () => {
      const event = buildAttachmentTriggerEvent({
        emailAddress: "u@x.com",
        message: makeMessage(),
        attachments: oneAttachment,
      });
      expect(event.payload).not.toHaveProperty("fileRef");
      expect(event.payload).not.toHaveProperty("FileRef");
    });

    it("per-attachment objects expose only metadata keys", () => {
      const event = buildAttachmentTriggerEvent({
        emailAddress: "u@x.com",
        message: makeMessage(),
        attachments: oneAttachment,
      });
      const attachments = event.payload.attachments as AttachmentMeta[];
      expect(Object.keys(attachments[0]!).sort()).toEqual(
        ["attachmentId", "filename", "mimeType", "sizeBytes"].sort(),
      );
    });
  });
});
