/**
 * @jest-environment node
 *
 * gmail/triggers/newAttachment trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockMarkSeen = jest.fn();
const mockRefreshAndRetry = jest.fn();
const mockUsersHistoryList = jest.fn();
const mockUsersMessagesGet = jest.fn();
const mockUsersGetProfile = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();
const mockEnqueueRun = jest.fn();

jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/gmail/api/usersHistoryList", () => ({
  usersHistoryList: (...args: unknown[]) => mockUsersHistoryList(...args),
  HistoryListStaleCursorError: class extends Error {},
}));

jest.mock("@/integrations/gmail/api/usersMessagesGet", () => ({
  usersMessagesGet: (...args: unknown[]) => mockUsersMessagesGet(...args),
}));

jest.mock("@/integrations/gmail/api/usersGetProfile", () => ({
  usersGetProfile: (...args: unknown[]) => mockUsersGetProfile(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueueRun(...args),
}));

import { checkAndMarkSeenAttachment } from "@/integrations/gmail/triggers/newAttachment/dedup";
import { checkAndMarkSeen } from "@/integrations/gmail/triggers/newEmail/dedup";
import { checkAndMarkSeenLabeled } from "@/integrations/gmail/triggers/newLabeledEmail/dedup";
import { extractAttachmentMetadata } from "@/integrations/gmail/triggers/newAttachment/extractAttachmentMetadata";
import type { GmailMessagePart, UsersMessagesGetResult } from "@/integrations/gmail/api/usersMessagesGet";
import "@/integrations/gmail/triggers/newAttachment";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findPollingHandler } from "@/services/triggers/pollingRegistry";
import { GmailNewAttachmentConfigSchema } from "@/integrations/gmail/triggers/newAttachment/schema";
import { matchesAttachmentSource, gmailNewAttachmentPollingHandler } from "@/integrations/gmail/triggers/newAttachment/poll";
import type { MessageEvent } from "@/integrations/gmail/triggers/newEmail/extractMessageEvents";
import { buildAttachmentTriggerEvent } from "@/integrations/gmail/triggers/newAttachment/messageHydration";
import { TriggerEventSchema } from "@/contracts/triggerEvent";
import type { AttachmentMeta } from "@/integrations/gmail/triggers/newAttachment/extractAttachmentMetadata";

// ---------------------------------------------------------------------------
// Merged from the former dedup.test.ts
// Tests for the polling-side dedup wrapper for new_attachment.
// Pins the per-trigger dedup-key prefix (`attachment:`) — so the same
// Gmail message id can flow through all three Gmail polling triggers
// (`new_email`, `new_labeled_email`, `new_attachment`) without
// colliding in `webhook_event_dedup`.
// ---------------------------------------------------------------------------
describe("dedup (lifecycle)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former extractAttachmentMetadata.test.ts
// Tests for the Gmail new_attachment MIME-tree walk helper.
// Pins the per-trigger metadata-extraction contract from Gmail 2.3
// plan §6 "Walk function for attachments". Pure helper — no mocks,
// no DB, no fetch.
// ---------------------------------------------------------------------------
describe("extractAttachmentMetadata (lifecycle)", () => {

function makeMessage(parts?: readonly GmailMessagePart[]): UsersMessagesGetResult {
  return {
    id: "msg-1",
    threadId: "thr-1",
    labelIds: [],
    snippet: "",
    internalDate: "0",
    sizeEstimate: 0,
    payload: {
      mimeType: parts ? "multipart/mixed" : "text/plain",
      headers: [],
      parts,
    },
  };
}

describe("extractAttachmentMetadata", () => {
  it("returns [] when payload.parts is undefined (metadata-only response)", () => {
    expect(extractAttachmentMetadata(makeMessage())).toEqual([]);
  });

  it("returns [] when payload.parts is an empty array", () => {
    expect(extractAttachmentMetadata(makeMessage([]))).toEqual([]);
  });

  it("ignores parts without a filename (inline / body parts)", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "text/plain",
          filename: "",
          body: { attachmentId: "att-1", size: 100 },
        },
      ]),
    );
    expect(result).toEqual([]);
  });

  it("ignores parts without a body.attachmentId", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "application/pdf",
          filename: "report.pdf",
          body: { size: 100 }, // no attachmentId
        },
      ]),
    );
    expect(result).toEqual([]);
  });

  it("ignores parts with missing body entirely", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "application/pdf",
          filename: "report.pdf",
        },
      ]),
    );
    expect(result).toEqual([]);
  });

  it("extracts a single top-level attachment", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "application/pdf",
          filename: "report.pdf",
          body: { attachmentId: "att-1", size: 4096 },
        },
      ]),
    );
    expect(result).toEqual([
      {
        attachmentId: "att-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096,
      },
    ]);
  });

  it("walks nested multipart structures and extracts deep attachments", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "multipart/alternative",
          filename: "",
          parts: [
            { mimeType: "text/plain", filename: "" },
            { mimeType: "text/html", filename: "" },
          ],
        },
        {
          mimeType: "multipart/mixed",
          filename: "",
          parts: [
            {
              mimeType: "application/pdf",
              filename: "deep.pdf",
              body: { attachmentId: "att-deep", size: 2048 },
            },
          ],
        },
      ]),
    );
    expect(result).toEqual([
      {
        attachmentId: "att-deep",
        filename: "deep.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
      },
    ]);
  });

  it("extracts multiple attachments in a single message", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "application/pdf",
          filename: "a.pdf",
          body: { attachmentId: "att-a", size: 100 },
        },
        {
          mimeType: "image/png",
          filename: "b.png",
          body: { attachmentId: "att-b", size: 200 },
        },
      ]),
    );
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.attachmentId)).toEqual(["att-a", "att-b"]);
  });

  it("ignores inline images (no filename) even when they have an attachmentId", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "image/png",
          filename: "", // inline image — no user-visible name
          body: { attachmentId: "inline-1", size: 500 },
        },
        {
          mimeType: "application/pdf",
          filename: "real.pdf",
          body: { attachmentId: "att-real", size: 100 },
        },
      ]),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe("real.pdf");
  });

  it("treats missing body.size as 0 (Gmail occasionally omits)", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          mimeType: "application/pdf",
          filename: "no-size.pdf",
          body: { attachmentId: "att-1" },
        },
      ]),
    );
    expect(result).toEqual([
      {
        attachmentId: "att-1",
        filename: "no-size.pdf",
        mimeType: "application/pdf",
        sizeBytes: 0,
      },
    ]);
  });

  it("treats missing part.mimeType as empty string", () => {
    const result = extractAttachmentMetadata(
      makeMessage([
        {
          filename: "unknown.bin",
          body: { attachmentId: "att-1", size: 10 },
        },
      ]),
    );
    expect(result[0]!.mimeType).toBe("");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former index.test.ts
// Module-init registration assertions for the Gmail new_attachment
// polling trigger. Importing the index module fires its side-effect
// registrations:
// - registerActivation("gmail", "new_attachment", activate)
// - registerPollingHandler(gmailNewAttachmentPollingHandler)
// Same Jest caching convention as the existing newEmail / newLabeledEmail
// index.test.ts — import once, assert across the test suite.
// ---------------------------------------------------------------------------
describe("index (lifecycle)", () => {

const triggerRow = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "gmail",
  eventType: "new_attachment",
  nodeId: "n1",
  config: {},
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Gmail new_attachment module-init registration", () => {
  it("registers an activation handler under (gmail, new_attachment)", () => {
    expect(findActivation("gmail", "new_attachment")).not.toBeNull();
  });

  it("registers a polling handler that canHandle this provider+event", () => {
    const handler = findPollingHandler(triggerRow);
    expect(handler).not.toBeNull();
    expect(handler?.id).toBe("gmail/new_attachment");
  });

  it("polling handler does NOT match new_email rows (event-type isolation)", () => {
    const newEmailRow = { ...triggerRow, eventType: "new_email" };
    const handler = findPollingHandler(newEmailRow);
    expect(handler?.id).not.toBe("gmail/new_attachment");
  });

  it("polling handler does NOT match new_labeled_email rows (event-type isolation)", () => {
    const newLabeledRow = { ...triggerRow, eventType: "new_labeled_email" };
    const handler = findPollingHandler(newLabeledRow);
    expect(handler?.id).not.toBe("gmail/new_attachment");
  });

  it("polling handler does NOT match other providers' rows (provider isolation)", () => {
    const otherProviderRow = {
      ...triggerRow,
      provider: "microsoft-outlook",
      eventType: "new_attachment",
    };
    const handler = findPollingHandler(otherProviderRow);
    expect(handler).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Tests for the Gmail new_attachment config schema. Pins the fire-on-
// any-attachment minimal contract from Gmail 2.3 plan §13.2 and §13.5
// (V1's optional filters `fileType` / `from` / `minSize` deferred).
// ---------------------------------------------------------------------------

describe("GmailNewAttachmentConfigSchema", () => {
  it("accepts an empty config (no user-set filter fields in this version)", () => {
    const r = GmailNewAttachmentConfigSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts the polling-state fields", () => {
    const r = GmailNewAttachmentConfigSchema.safeParse({
      pollingEnabled: true,
      snapshot: {
        historyId: "12345",
        capturedAt: "2026-05-14T12:00:00Z",
      },
      polling: { lastPolledAt: "2026-05-14T12:01:00Z" },
    });
    expect(r.success).toBe(true);
  });

  // V1 fields intentionally NOT ported in this commit

  it("rejects V1 `fileType` filter (deferred per Gmail 2.3 decision 13.5)", () => {
    expect(
      GmailNewAttachmentConfigSchema.safeParse({
        fileType: "pdf",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `from` filter (deferred per Gmail 2.3 decision 13.5)", () => {
    expect(
      GmailNewAttachmentConfigSchema.safeParse({
        from: "alice@example.com",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `minSize` filter (deferred per Gmail 2.3 decision 13.5)", () => {
    expect(
      GmailNewAttachmentConfigSchema.safeParse({
        minSize: 1024,
      }).success,
    ).toBe(false);
  });

  it("rejects newEmail-trigger config fields that don't belong here", () => {
    for (const dropped of [
      "subject",
      "subjectExactMatch",
      "hasAttachment",
      "labelIds",
      "aiContentFilter",
    ]) {
      const r = GmailNewAttachmentConfigSchema.safeParse({
        [dropped]: "value",
      });
      expect(r.success).toBe(false);
    }
  });

  it("rejects new_labeled_email's `labelId` field", () => {
    expect(
      GmailNewAttachmentConfigSchema.safeParse({
        labelId: "Label_5",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields generally (strict mode)", () => {
    expect(
      GmailNewAttachmentConfigSchema.safeParse({
        xCustom: "v",
      }).success,
    ).toBe(false);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former matchesAttachmentSource.test.ts
// Tests for the new_attachment poll handler's `matchesAttachmentSource`
// predicate. This predicate is the load-bearing filter that
// distinguishes which tagged events from `extractMessageEvents`
// should hydrate-and-inspect:
// - MUST be `source === "messagesAdded"` (labelsAdded events do NOT
// fire — a label change isn't a new-attachment event).
// - Defensive `messages` events are skipped.
// The "does this message have attachments" check happens AFTER
// hydration, via `extractAttachmentMetadata`.
// ---------------------------------------------------------------------------
describe("matchesAttachmentSource (lifecycle)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former messageHydration.test.ts
// Tests for the Gmail new_attachment hydration builder.
// Mirrors newEmail / newLabeledEmail messageHydration tests, plus the
// attachment-specific payload field assertions (`attachments`,
// `attachmentCount`) and the metadata-only invariant from Gmail 2.3
// plan §13.2: no FileRef, no bytes / base64 / content / data at the
// trigger boundary.
// ---------------------------------------------------------------------------
describe("messageHydration (lifecycle)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former poll.test.ts
// End-to-end behavior tests for the Gmail new_attachment poll handler.
// Mocks the I/O dependencies (history.list, messages.get, dedup repo,
// integrations repo, enqueueRun) and exercises the full per-tick flow.
// Pins the contract from Gmail 2.3 plan §6:
// - messagesAdded events with attachments → fire (enqueueRun called).
// - messagesAdded events WITHOUT attachments → DO NOT fire.
// - labelsAdded events → ignored (not a "new attachment" event).
// - defensive `messages` events → ignored.
// - Mixed history pages emit ONLY the attachment-bearing
// messagesAdded events.
// - The hydrate call uses `format: "full"` (needed for payload.parts).
// - Cross-tick dedup wraps each message via `attachment:<id>` key.
// ---------------------------------------------------------------------------
describe("poll (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersHistoryList.mockReset();
  mockUsersMessagesGet.mockReset();
  mockUsersGetProfile.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
  mockEnqueueRun.mockReset();
  mockMarkSeen.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});

  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) =>
      i.apiCall("tok"),
  );
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    provider: "gmail",
    providerAccountId: "alice@example.com",
  });
  mockMarkSeen.mockResolvedValue({ fresh: true });
  mockUpdateConfig.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "gmail",
  eventType: "new_attachment",
  nodeId: "n1",
  config: {
    pollingEnabled: true,
    snapshot: { historyId: "100", capturedAt: "2026-05-14T12:00:00Z" },
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
} as const;

function messageWithAttachment(id: string) {
  return {
    id,
    threadId: `thr-${id}`,
    labelIds: ["INBOX"],
    snippet: "",
    internalDate: "0",
    sizeEstimate: 4096,
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "alice@example.com" },
        { name: "Subject", value: "Doc attached" },
      ],
      parts: [
        {
          mimeType: "application/pdf",
          filename: "report.pdf",
          body: { attachmentId: `att-${id}`, size: 2048 },
        },
      ],
    },
  };
}

function messageWithoutAttachment(id: string) {
  return {
    id,
    threadId: `thr-${id}`,
    labelIds: ["INBOX"],
    snippet: "",
    internalDate: "0",
    sizeEstimate: 1024,
    payload: {
      mimeType: "text/plain",
      headers: [{ name: "From", value: "bob@example.com" }],
      parts: undefined,
    },
  };
}

describe("Gmail new_attachment poll — fire / skip behavior", () => {
  it("fires (enqueueRun called) when a messagesAdded message has an attachment", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-A" } }] }],
    });
    mockUsersMessagesGet.mockResolvedValueOnce(messageWithAttachment("msg-A"));

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      accountId: "acct-test",
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const arg = mockEnqueueRun.mock.calls[0]![0];
    expect(arg.workflowId).toBe("wf-1");
    expect(arg.event.eventType).toBe("new_attachment");
    expect(arg.event.eventId).toBe("attachment:msg-A");
    expect(arg.event.payload.attachmentCount).toBe(1);
  });

  it("does NOT fire when a messagesAdded message has no attachments", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-B" } }] }],
    });
    mockUsersMessagesGet.mockResolvedValueOnce(messageWithoutAttachment("msg-B"));

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      accountId: "acct-test",
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("ignores labelsAdded events (does not hydrate or fire)", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [
        {
          id: "h1",
          labelsAdded: [
            {
              message: { id: "msg-L" },
              labelIds: ["Label_5"],
            },
          ],
        },
      ],
    });

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      accountId: "acct-test",
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockUsersMessagesGet).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("ignores defensive `messages` events (does not hydrate or fire)", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [{ id: "h1", messages: [{ id: "msg-D" }] }],
    });

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      accountId: "acct-test",
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockUsersMessagesGet).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("mixed history page → emits only attachment-bearing messagesAdded events", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [
        {
          id: "h1",
          messagesAdded: [
            { message: { id: "with-att" } },
            { message: { id: "no-att" } },
          ],
          labelsAdded: [
            { message: { id: "labeled" }, labelIds: ["Label_5"] },
          ],
          messages: [{ id: "defensive" }],
        },
      ],
    });
    // Map message id → response. The first one has an attachment;
    // the second does not. The labelsAdded / defensive ids should
    // never be hydrated.
    mockUsersMessagesGet.mockImplementation(
      async (i: { messageId: string }) => {
        if (i.messageId === "with-att") return messageWithAttachment("with-att");
        if (i.messageId === "no-att") return messageWithoutAttachment("no-att");
        throw new Error(`Unexpected hydrate for ${i.messageId}`);
      },
    );

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      accountId: "acct-test",
      userRole: "owner",
      now: Date.now(),
    });

    const hydrated = mockUsersMessagesGet.mock.calls.map(
      (c) => (c[0] as { messageId: string }).messageId,
    );
    expect(hydrated.sort()).toEqual(["no-att", "with-att"].sort());
    expect(mockUsersMessagesGet).toHaveBeenCalledTimes(2);

    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const arg = mockEnqueueRun.mock.calls[0]![0];
    expect(arg.event.eventId).toBe("attachment:with-att");
  });
});

describe("Gmail new_attachment poll — wiring details", () => {
  it("hydrates with `format: \"full\"` (required for payload.parts)", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-A" } }] }],
    });
    mockUsersMessagesGet.mockResolvedValueOnce(messageWithAttachment("msg-A"));

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      accountId: "acct-test",
      userRole: "owner",
      now: Date.now(),
    });

    const arg = mockUsersMessagesGet.mock.calls[0]![0];
    expect(arg.format).toBe("full");
    expect(arg.messageId).toBe("msg-A");
  });

  it("dedup wraps each hydrated message with the `attachment:` prefix", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-A" } }] }],
    });
    mockUsersMessagesGet.mockResolvedValueOnce(messageWithAttachment("msg-A"));

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      accountId: "acct-test",
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockMarkSeen).toHaveBeenCalledWith("gmail", "attachment:msg-A");
  });

  it("dedup miss (fresh=false) short-circuits hydration", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-A" } }] }],
    });
    mockMarkSeen.mockReset();
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      accountId: "acct-test",
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockUsersMessagesGet).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("canHandle is provider+eventType-scoped", () => {
    expect(
      gmailNewAttachmentPollingHandler.canHandle(baseTrigger),
    ).toBe(true);
    expect(
      gmailNewAttachmentPollingHandler.canHandle({
        ...baseTrigger,
        eventType: "new_email",
      }),
    ).toBe(false);
    expect(
      gmailNewAttachmentPollingHandler.canHandle({
        ...baseTrigger,
        provider: "microsoft-outlook",
      }),
    ).toBe(false);
  });

  it("does nothing when snapshot is missing (defensive log + return)", async () => {
    await gmailNewAttachmentPollingHandler.poll({
      trigger: { ...baseTrigger, config: { pollingEnabled: true } },
      accountId: "acct-test",
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockUsersHistoryList).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });
});

});
