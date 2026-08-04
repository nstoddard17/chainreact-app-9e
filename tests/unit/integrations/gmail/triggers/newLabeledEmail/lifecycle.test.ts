/**
 * @jest-environment node
 *
 * gmail/triggers/newLabeledEmail trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockMarkSeen = jest.fn();

jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

import { checkAndMarkSeenLabeled } from "@/integrations/gmail/triggers/newLabeledEmail/dedup";
import { checkAndMarkSeen } from "@/integrations/gmail/triggers/newEmail/dedup";
import "@/integrations/gmail/triggers/newLabeledEmail";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findPollingHandler } from "@/services/triggers/pollingRegistry";
import { GmailNewLabeledEmailConfigSchema } from "@/integrations/gmail/triggers/newLabeledEmail/schema";
import { matchesLabel } from "@/integrations/gmail/triggers/newLabeledEmail/poll";
import type { MessageEvent } from "@/integrations/gmail/triggers/newEmail/extractMessageEvents";
import { buildLabeledTriggerEvent } from "@/integrations/gmail/triggers/newLabeledEmail/messageHydration";
import { TriggerEventSchema } from "@/contracts/triggerEvent";
import type { UsersMessagesGetResult } from "@/integrations/gmail/api/usersMessagesGet";

// ---------------------------------------------------------------------------
// Merged from the former dedup.test.ts
// Tests for the polling-side dedup wrapper for new_labeled_email.
// Pins the per-trigger dedup-key prefix (`labeled:`) — so the same
// Gmail message id can flow through both `new_email` AND
// `new_labeled_email` without colliding in `webhook_event_dedup`.
// ---------------------------------------------------------------------------
describe("dedup (lifecycle)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former index.test.ts
// Module-init registration assertions for the Gmail
// new_labeled_email polling trigger. Importing the index module
// fires its side-effect registrations:
// - registerActivation("gmail", "new_labeled_email", activate)
// - registerPollingHandler(gmailNewLabeledEmailPollingHandler)
// Same Jest caching convention as the existing OneDrive
// fileChanged/index.test.ts — import once, assert across the test
// suite.
// ---------------------------------------------------------------------------
describe("index (lifecycle)", () => {

const triggerRow = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "gmail",
  eventType: "new_labeled_email",
  nodeId: "n1",
  config: { labelId: "Label_5" },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Gmail new_labeled_email module-init registration", () => {
  it("registers an activation handler under (gmail, new_labeled_email)", () => {
    expect(findActivation("gmail", "new_labeled_email")).not.toBeNull();
  });

  it("registers a polling handler that canHandle this provider+event", () => {
    const handler = findPollingHandler(triggerRow);
    expect(handler).not.toBeNull();
    expect(handler?.id).toBe("gmail/new_labeled_email");
  });

  it("polling handler does NOT match new_email rows (event-type isolation)", () => {
    const newEmailRow = { ...triggerRow, eventType: "new_email" };
    const handler = findPollingHandler(newEmailRow);
    expect(handler?.id).not.toBe("gmail/new_labeled_email");
  });

  it("polling handler does NOT match other providers' rows (provider isolation)", () => {
    const otherProviderRow = {
      ...triggerRow,
      provider: "microsoft-outlook",
      eventType: "new_labeled_email",
    };
    const handler = findPollingHandler(otherProviderRow);
    expect(handler).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Tests for the Gmail new_labeled_email config schema. Pins the
// minimal-labelId-only contract from Gmail 2.3 plan §13.3.
// ---------------------------------------------------------------------------

describe("GmailNewLabeledEmailConfigSchema", () => {
  it("accepts a minimal valid config (labelId only)", () => {
    const r = GmailNewLabeledEmailConfigSchema.safeParse({
      labelId: "Label_5",
    });
    expect(r.success).toBe(true);
  });

  it("accepts the polling-state fields alongside labelId", () => {
    const r = GmailNewLabeledEmailConfigSchema.safeParse({
      labelId: "Label_5",
      pollingEnabled: true,
      snapshot: {
        historyId: "12345",
        capturedAt: "2026-05-12T12:00:00Z",
      },
      polling: { lastPolledAt: "2026-05-12T12:01:00Z" },
    });
    expect(r.success).toBe(true);
  });

  it("rejects when labelId is missing", () => {
    expect(
      GmailNewLabeledEmailConfigSchema.safeParse({}).success,
    ).toBe(false);
  });

  it("rejects when labelId is empty string", () => {
    expect(
      GmailNewLabeledEmailConfigSchema.safeParse({ labelId: "" }).success,
    ).toBe(false);
  });

  // V1 fields intentionally NOT ported in this commit

  it("rejects V1 `from` filter (deferred per Gmail 2.3 decision 13.3)", () => {
    expect(
      GmailNewLabeledEmailConfigSchema.safeParse({
        labelId: "Label_5",
        from: "alice@example.com",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `includeReplies` toggle (deferred per Gmail 2.3 decision 13.3)", () => {
    expect(
      GmailNewLabeledEmailConfigSchema.safeParse({
        labelId: "Label_5",
        includeReplies: true,
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
      const r = GmailNewLabeledEmailConfigSchema.safeParse({
        labelId: "Label_5",
        [dropped]: "value",
      });
      expect(r.success).toBe(false);
    }
  });

  it("rejects unknown fields generally (strict mode)", () => {
    expect(
      GmailNewLabeledEmailConfigSchema.safeParse({
        labelId: "Label_5",
        xCustom: "v",
      }).success,
    ).toBe(false);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former matchesLabel.test.ts
// Tests for the new_labeled_email poll handler's `matchesLabel`
// predicate. The predicate is the load-bearing filter that
// distinguishes which tagged events from `extractMessageEvents`
// should fire the trigger:
// - MUST be `source === "labelsAdded"` (messagesAdded and
// defensive `messages` events are skipped).
// - MUST include the workflow's configured labelId in
// `addedLabelIds`.
// Together these guarantees keep `new_labeled_email` from firing
// on raw new-message arrivals (the `new_email` trigger's surface)
// AND keep it from firing on labelsAdded events for unrelated
// labels.
// ---------------------------------------------------------------------------
describe("matchesLabel (lifecycle)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former messageHydration.test.ts
// Tests for the Gmail new_labeled_email hydration builder.
// Mirrors newEmail's messageHydration tests, plus two label-specific
// payload field assertions (`labelAppliedId`, `labelsAdded`) per
// Gmail 2.3 plan §5.
// ---------------------------------------------------------------------------
describe("messageHydration (lifecycle)", () => {

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
    expect(event.providerAccountId).toBe("alice@example.com");
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

});
