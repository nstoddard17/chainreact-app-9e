/**
 * @jest-environment node
 *
 * gmail/triggers/newEmail trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockMarkSeen = jest.fn();

jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

import { checkAndMarkSeen } from "@/integrations/gmail/triggers/newEmail/dedup";
import { extractMessageEvents } from "@/integrations/gmail/triggers/newEmail/extractMessageEvents";
import type { GmailHistoryRecord } from "@/integrations/gmail/api/usersHistoryList";
import { matchesFilters } from "@/integrations/gmail/triggers/newEmail/filters";
import { GmailNewEmailConfigSchema } from "@/integrations/gmail/triggers/newEmail/schema";
import type { UsersMessagesGetResult } from "@/integrations/gmail/api/usersMessagesGet";
import { advanceCheckpoint } from "@/integrations/gmail/triggers/newEmail/historyState";
import { buildTriggerEvent } from "@/integrations/gmail/triggers/newEmail/messageHydration";
import { TriggerEventSchema } from "@/contracts/triggerEvent";

// ---------------------------------------------------------------------------
// Merged from the former dedup.test.ts
// Tests for the polling-side dedup wrapper.
// V1 used a per-process Map with a 5-minute TTL. V2 replaces that with the
// existing `webhook_event_dedup` table (Slice 2e plan §4 "Rewrite"). These
// tests pin the three outcomes — fresh / not-fresh / outage — and verify
// the fail-closed-on-outage policy that distinguishes polling from V1's
// fail-open webhook dispatcher.
// ---------------------------------------------------------------------------
describe("dedup (lifecycle)", () => {

beforeEach(() => {
  mockMarkSeen.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("checkAndMarkSeen", () => {
  it("returns fresh=true on first sight of a Gmail message id", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    const result = await checkAndMarkSeen("msg-001");
    expect(mockMarkSeen).toHaveBeenCalledWith("gmail", "msg-001");
    expect(result).toEqual({ fresh: true, outage: false });
  });

  it("returns fresh=false when the message id is already in the dedup table", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    const result = await checkAndMarkSeen("msg-002");
    expect(result).toEqual({ fresh: false, outage: false });
  });

  it("fails closed on dedup outage — caller skips the message rather than risk double-fire", async () => {
    mockMarkSeen.mockRejectedValueOnce(new Error("connection refused"));
    const result = await checkAndMarkSeen("msg-003");
    expect(result).toEqual({ fresh: false, outage: true });
  });

  it("logs a structured warning on outage so we can detect dedup-store regressions", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockMarkSeen.mockRejectedValueOnce(new Error("network"));
    await checkAndMarkSeen("msg-004");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(warnSpy.mock.calls[0]![0] as string);
    expect(logged).toMatchObject({
      event: "gmail.poll.dedup.outage",
      messageId: "msg-004",
      error: "network",
    });
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former extractMessageEvents.test.ts
// Tests for the Gmail extractMessageEvents helper extracted from
// poll.ts in Gmail 2.3 Commit 2.
// Two test concerns:
// 1. **Tagged-event correctness** — every history-record source is
// visited and tagged correctly, addedLabelIds preserved for
// labelsAdded events.
// 2. **`new_email` regression guard** — the new tagged shape, when
// mapped back to an id set via the same `Array.from(new Set(events
// .map(e => e.id)))` collapse used in poll.ts, MUST produce the
// same id set the pre-refactor flat `extractMessageIds` produced.
// This is the load-bearing assertion: nothing about new_email's
// id-surfacing behavior may change.
// ---------------------------------------------------------------------------
describe("extractMessageEvents (lifecycle)", () => {

// The pre-refactor flat helper. Reproduced verbatim here so the
// regression test compares the new tagged-then-collapsed flow
// against the exact old behavior. This local copy will go stale if
// the production helper diverges in some surprising way — that's
// the point: any divergence between (events → ids) and the legacy
// `string[]` flow lights up here.
function legacyExtractMessageIds(
  history: readonly GmailHistoryRecord[],
): string[] {
  const ids: string[] = [];
  for (const entry of history) {
    if (entry.messagesAdded) {
      for (const m of entry.messagesAdded) ids.push(m.message.id);
    }
    if (entry.labelsAdded) {
      for (const m of entry.labelsAdded) ids.push(m.message.id);
    }
    if (entry.messages) {
      for (const m of entry.messages) ids.push(m.id);
    }
  }
  return ids;
}

function flattenToUniqueIds(
  events: ReturnType<typeof extractMessageEvents>,
): string[] {
  // Mirrors poll.ts's `Array.from(new Set(collectedMessageIds))`
  // after collecting `ev.id` from each event.
  return Array.from(new Set(events.map((e) => e.id)));
}

function r(entry: GmailHistoryRecord): GmailHistoryRecord {
  return entry;
}

describe("extractMessageEvents — tagged event correctness", () => {
  it("returns [] for empty history", () => {
    expect(extractMessageEvents([])).toEqual([]);
  });

  it("returns [] for a history entry with no source fields", () => {
    expect(extractMessageEvents([r({ id: "h-1" })])).toEqual([]);
  });

  it("tags messagesAdded events with source='messagesAdded' (no addedLabelIds)", () => {
    const events = extractMessageEvents([
      r({
        id: "h-1",
        messagesAdded: [
          { message: { id: "msg-a", threadId: "thr-a" } },
          { message: { id: "msg-b", threadId: "thr-b" } },
        ],
      }),
    ]);
    expect(events).toEqual([
      { id: "msg-a", source: "messagesAdded" },
      { id: "msg-b", source: "messagesAdded" },
    ]);
  });

  it("tags labelsAdded events with source='labelsAdded' AND preserves addedLabelIds", () => {
    const events = extractMessageEvents([
      r({
        id: "h-1",
        labelsAdded: [
          {
            message: { id: "msg-x", threadId: "thr-x" },
            labelIds: ["INBOX", "Label_5"],
          },
        ],
      }),
    ]);
    expect(events).toEqual([
      {
        id: "msg-x",
        source: "labelsAdded",
        addedLabelIds: ["INBOX", "Label_5"],
      },
    ]);
  });

  it("tags multiple labelsAdded events independently with their own addedLabelIds", () => {
    const events = extractMessageEvents([
      r({
        id: "h-1",
        labelsAdded: [
          {
            message: { id: "msg-1", threadId: "thr-1" },
            labelIds: ["INBOX"],
          },
          {
            message: { id: "msg-2", threadId: "thr-2" },
            labelIds: ["Label_5", "IMPORTANT"],
          },
        ],
      }),
    ]);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      id: "msg-1",
      source: "labelsAdded",
      addedLabelIds: ["INBOX"],
    });
    expect(events[1]).toEqual({
      id: "msg-2",
      source: "labelsAdded",
      addedLabelIds: ["Label_5", "IMPORTANT"],
    });
  });

  it("tags defensive `messages` entries with source='messages' (no addedLabelIds)", () => {
    const events = extractMessageEvents([
      r({
        id: "h-1",
        messages: [
          { id: "msg-c", threadId: "thr-c" },
          { id: "msg-d", threadId: "thr-d" },
        ],
      }),
    ]);
    expect(events).toEqual([
      { id: "msg-c", source: "messages" },
      { id: "msg-d", source: "messages" },
    ]);
  });

  it("returns events in source order: messagesAdded → labelsAdded → messages per entry", () => {
    const events = extractMessageEvents([
      r({
        id: "h-1",
        messages: [{ id: "msg-c", threadId: "thr-c" }],
        labelsAdded: [
          {
            message: { id: "msg-b", threadId: "thr-b" },
            labelIds: ["L"],
          },
        ],
        messagesAdded: [{ message: { id: "msg-a", threadId: "thr-a" } }],
      }),
    ]);
    expect(events.map((e) => e.source)).toEqual([
      "messagesAdded",
      "labelsAdded",
      "messages",
    ]);
  });

  it("preserves history-entry walk order across multiple entries", () => {
    const events = extractMessageEvents([
      r({
        id: "h-1",
        messagesAdded: [{ message: { id: "m1", threadId: "t1" } }],
      }),
      r({
        id: "h-2",
        labelsAdded: [
          {
            message: { id: "m2", threadId: "t2" },
            labelIds: ["X"],
          },
        ],
      }),
      r({
        id: "h-3",
        messages: [{ id: "m3", threadId: "t3" }],
      }),
    ]);
    expect(events.map((e) => e.id)).toEqual(["m1", "m2", "m3"]);
    expect(events.map((e) => e.source)).toEqual([
      "messagesAdded",
      "labelsAdded",
      "messages",
    ]);
  });

  it("emits multiple events for the same message id when it appears in multiple sources", () => {
    // A message that was added AND had labels applied in the same
    // history window produces TWO events. Caller decides dedup
    // semantics; we don't collapse here — per-trigger handlers need
    // visibility into both sources.
    const events = extractMessageEvents([
      r({
        id: "h-1",
        messagesAdded: [{ message: { id: "shared", threadId: "thr-1" } }],
        labelsAdded: [
          {
            message: { id: "shared", threadId: "thr-1" },
            labelIds: ["INBOX"],
          },
        ],
      }),
    ]);
    expect(events).toHaveLength(2);
    expect(events[0]?.source).toBe("messagesAdded");
    expect(events[1]?.source).toBe("labelsAdded");
    expect(events[0]?.id).toBe("shared");
    expect(events[1]?.id).toBe("shared");
  });
});

describe("extractMessageEvents — new_email regression guard", () => {
  // The pre-refactor flow produced a flat `string[]` from
  // messagesAdded + labelsAdded + messages, then poll.ts collapsed
  // via `Array.from(new Set(...))`. The new flow does the same
  // collapse on `event.id`. These tests prove the two flows produce
  // identical id sets for every history shape we've ever seen.

  const cases: Array<{ name: string; history: GmailHistoryRecord[] }> = [
    {
      name: "empty history",
      history: [],
    },
    {
      name: "messagesAdded only",
      history: [
        r({
          id: "h-1",
          messagesAdded: [
            { message: { id: "a", threadId: "ta" } },
            { message: { id: "b", threadId: "tb" } },
          ],
        }),
      ],
    },
    {
      name: "labelsAdded only",
      history: [
        r({
          id: "h-1",
          labelsAdded: [
            {
              message: { id: "a", threadId: "ta" },
              labelIds: ["INBOX"],
            },
          ],
        }),
      ],
    },
    {
      name: "messages only (defensive fallback)",
      history: [
        r({
          id: "h-1",
          messages: [
            { id: "x", threadId: "tx" },
            { id: "y", threadId: "ty" },
          ],
        }),
      ],
    },
    {
      name: "mixed sources in one entry",
      history: [
        r({
          id: "h-1",
          messagesAdded: [{ message: { id: "a", threadId: "ta" } }],
          labelsAdded: [
            {
              message: { id: "b", threadId: "tb" },
              labelIds: ["L"],
            },
          ],
          messages: [{ id: "c", threadId: "tc" }],
        }),
      ],
    },
    {
      name: "same id across multiple sources (collapses to one)",
      history: [
        r({
          id: "h-1",
          messagesAdded: [{ message: { id: "dupe", threadId: "t1" } }],
          labelsAdded: [
            {
              message: { id: "dupe", threadId: "t1" },
              labelIds: ["INBOX"],
            },
          ],
        }),
      ],
    },
    {
      name: "same id across multiple history entries (collapses to one)",
      history: [
        r({
          id: "h-1",
          messagesAdded: [{ message: { id: "p", threadId: "tp" } }],
        }),
        r({
          id: "h-2",
          messagesAdded: [{ message: { id: "p", threadId: "tp" } }],
        }),
      ],
    },
    {
      name: "many entries — order preserved before dedup",
      history: [
        r({
          id: "h-1",
          messagesAdded: [
            { message: { id: "m1", threadId: "t1" } },
            { message: { id: "m2", threadId: "t2" } },
          ],
        }),
        r({
          id: "h-2",
          labelsAdded: [
            {
              message: { id: "m3", threadId: "t3" },
              labelIds: ["INBOX"],
            },
          ],
        }),
        r({
          id: "h-3",
          messages: [{ id: "m4", threadId: "t4" }],
        }),
      ],
    },
  ];

  for (const c of cases) {
    it(`new_email tagged-then-flattened id set matches legacy flat list (${c.name})`, () => {
      const legacy = Array.from(new Set(legacyExtractMessageIds(c.history)));
      const newFlow = flattenToUniqueIds(extractMessageEvents(c.history));
      expect(newFlow).toEqual(legacy);
    });
  }

  it("in-tick dedup behavior (Array.from(new Set(...))) collapses duplicates", () => {
    const events = extractMessageEvents([
      r({
        id: "h-1",
        messagesAdded: [
          { message: { id: "x", threadId: "tx" } },
          { message: { id: "x", threadId: "tx" } }, // synthetic duplicate within messagesAdded
        ],
      }),
      r({
        id: "h-2",
        labelsAdded: [
          {
            message: { id: "x", threadId: "tx" },
            labelIds: ["INBOX"],
          },
        ],
      }),
    ]);
    expect(events).toHaveLength(3); // events not collapsed — caller decides
    expect(flattenToUniqueIds(events)).toEqual(["x"]); // poll's Set-collapse → 1
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former filters.test.ts
// Tests for the Gmail new_email filter matchers.
// These are direct ports of V1 gmail-processor.ts:1038-1108 behavior,
// adapted to V2's UsersMessagesGetResult (format=metadata) shape.
// ---------------------------------------------------------------------------
describe("filters (lifecycle)", () => {

function makeMessage(
  overrides: Partial<UsersMessagesGetResult> = {},
): UsersMessagesGetResult {
  return {
    id: "m1",
    threadId: "t1",
    labelIds: ["INBOX", "UNREAD"],
    snippet: "Hello world",
    internalDate: String(Date.now()),
    sizeEstimate: 1024,
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: "Alice <alice@example.com>" },
        { name: "To", value: "bob@example.com" },
        { name: "Subject", value: "Hello world" },
      ],
    },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<Record<string, unknown>> = {}) {
  return GmailNewEmailConfigSchema.parse({
    snapshot: { historyId: "1", capturedAt: "2026-05-07T00:00:00Z" },
    ...overrides,
  });
}

describe("matchesFilters — labels", () => {
  it("AND-matches when at least one configured label is present (V1 parity)", () => {
    expect(
      matchesFilters(
        makeMessage({ labelIds: ["INBOX", "UNREAD"] }),
        makeConfig({ labelIds: ["INBOX"] }),
      ),
    ).toBe(true);
  });

  it("rejects when none of the configured labels match", () => {
    expect(
      matchesFilters(
        makeMessage({ labelIds: ["UNREAD"] }),
        makeConfig({ labelIds: ["INBOX"] }),
      ),
    ).toBe(false);
  });

  it("supports multi-label arrays (no Gmail API cardinality issue — filtered client-side)", () => {
    expect(
      matchesFilters(
        makeMessage({ labelIds: ["IMPORTANT"] }),
        makeConfig({ labelIds: ["INBOX", "IMPORTANT"] }),
      ),
    ).toBe(true);
  });

  it("empty configured labelIds means 'no constraint'", () => {
    expect(
      matchesFilters(
        makeMessage({ labelIds: [] }),
        makeConfig({ labelIds: [] }),
      ),
    ).toBe(true);
  });
});

describe("matchesFilters — from", () => {
  it("matches sender by email-only token, case-insensitive", () => {
    expect(
      matchesFilters(
        makeMessage({
          payload: {
            mimeType: "multipart/alternative",
            headers: [
              { name: "From", value: '"Alice" <ALICE@example.com>' },
            ],
          },
        }),
        makeConfig({ from: ["alice@example.com"] }),
      ),
    ).toBe(true);
  });

  it("OR-matches across multiple configured senders", () => {
    expect(
      matchesFilters(
        makeMessage({
          payload: {
            mimeType: "multipart/alternative",
            headers: [{ name: "From", value: "carol@example.com" }],
          },
        }),
        makeConfig({ from: ["alice@example.com", "carol@example.com"] }),
      ),
    ).toBe(true);
  });

  it("rejects when sender doesn't match any configured value", () => {
    expect(
      matchesFilters(
        makeMessage({
          payload: {
            mimeType: "multipart/alternative",
            headers: [{ name: "From", value: "eve@example.com" }],
          },
        }),
        makeConfig({ from: ["alice@example.com"] }),
      ),
    ).toBe(false);
  });

  it("empty configured from means 'any sender'", () => {
    expect(
      matchesFilters(makeMessage(), makeConfig({ from: [] })),
    ).toBe(true);
  });
});

describe("matchesFilters — subject", () => {
  it("exact match (default) requires the subject to equal exactly", () => {
    expect(
      matchesFilters(
        makeMessage({
          payload: {
            mimeType: "multipart/alternative",
            headers: [{ name: "Subject", value: "Hello world" }],
          },
        }),
        makeConfig({ subject: "Hello world" }),
      ),
    ).toBe(true);
    expect(
      matchesFilters(
        makeMessage({
          payload: {
            mimeType: "multipart/alternative",
            headers: [{ name: "Subject", value: "Hello world" }],
          },
        }),
        makeConfig({ subject: "Hello" }),
      ),
    ).toBe(false);
  });

  it("substring match when subjectExactMatch is false (case-insensitive)", () => {
    expect(
      matchesFilters(
        makeMessage({
          payload: {
            mimeType: "multipart/alternative",
            headers: [{ name: "Subject", value: "Hello WORLD" }],
          },
        }),
        makeConfig({ subject: "world", subjectExactMatch: false }),
      ),
    ).toBe(true);
  });

  it("empty configured subject means 'no constraint'", () => {
    expect(
      matchesFilters(makeMessage(), makeConfig({ subject: "" })),
    ).toBe(true);
  });
});

describe("matchesFilters — hasAttachment (heuristic on top-level mimeType)", () => {
  it("'yes' matches multipart/mixed (treated as attached)", () => {
    expect(
      matchesFilters(
        makeMessage({
          payload: {
            mimeType: "multipart/mixed",
            headers: [{ name: "Subject", value: "x" }],
          },
        }),
        makeConfig({ hasAttachment: "yes", subject: "" }),
      ),
    ).toBe(true);
  });

  it("'no' rejects multipart/mixed", () => {
    expect(
      matchesFilters(
        makeMessage({
          payload: {
            mimeType: "multipart/mixed",
            headers: [{ name: "Subject", value: "x" }],
          },
        }),
        makeConfig({ hasAttachment: "no", subject: "" }),
      ),
    ).toBe(false);
  });

  it("'no' accepts multipart/alternative", () => {
    expect(
      matchesFilters(
        makeMessage({
          payload: {
            mimeType: "multipart/alternative",
            headers: [{ name: "Subject", value: "x" }],
          },
        }),
        makeConfig({ hasAttachment: "no", subject: "" }),
      ),
    ).toBe(true);
  });

  it("'any' is a no-op", () => {
    expect(
      matchesFilters(
        makeMessage({
          payload: {
            mimeType: "multipart/mixed",
            headers: [{ name: "Subject", value: "x" }],
          },
        }),
        makeConfig({ hasAttachment: "any", subject: "" }),
      ),
    ).toBe(true);
  });
});

describe("matchesFilters — combined", () => {
  it("all filters must pass simultaneously (V1 parity: AND across categories)", () => {
    const message = makeMessage({
      labelIds: ["INBOX"],
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "From", value: "alice@example.com" },
          { name: "Subject", value: "Invoice" },
        ],
      },
    });
    const passingConfig = makeConfig({
      labelIds: ["INBOX"],
      from: ["alice@example.com"],
      subject: "Invoice",
      hasAttachment: "yes",
    });
    expect(matchesFilters(message, passingConfig)).toBe(true);

    // Flip subject — overall must fail.
    const failingConfig = makeConfig({
      labelIds: ["INBOX"],
      from: ["alice@example.com"],
      subject: "Receipt",
      hasAttachment: "yes",
    });
    expect(matchesFilters(message, failingConfig)).toBe(false);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former historyState.test.ts
// ---------------------------------------------------------------------------
describe("historyState (lifecycle)", () => {

describe("advanceCheckpoint", () => {
  it("advances when the API historyId is greater than stored", () => {
    expect(
      advanceCheckpoint({ startHistoryId: "100", apiHistoryId: "200" }),
    ).toBe("200");
  });

  it("does not regress when the API historyId is smaller", () => {
    expect(
      advanceCheckpoint({ startHistoryId: "200", apiHistoryId: "100" }),
    ).toBe("200");
  });

  it("returns either when both are equal (idempotent)", () => {
    expect(
      advanceCheckpoint({ startHistoryId: "150", apiHistoryId: "150" }),
    ).toBe("150");
  });

  it("compares as BigInt — handles values larger than Number.MAX_SAFE_INTEGER", () => {
    const stored = "9007199254740993"; // > 2^53
    const fresh = "9007199254740994";
    expect(
      advanceCheckpoint({ startHistoryId: stored, apiHistoryId: fresh }),
    ).toBe(fresh);
  });

  it("falls back to startHistoryId when apiHistoryId is unparseable", () => {
    expect(
      advanceCheckpoint({ startHistoryId: "200", apiHistoryId: "not-a-number" }),
    ).toBe("200");
  });

  it("uses apiHistoryId when startHistoryId is unparseable", () => {
    expect(
      advanceCheckpoint({ startHistoryId: "junk", apiHistoryId: "300" }),
    ).toBe("300");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former messageHydration.test.ts
// ---------------------------------------------------------------------------
describe("messageHydration (lifecycle)", () => {

function makeMessage(
  overrides: Partial<UsersMessagesGetResult> = {},
): UsersMessagesGetResult {
  return {
    id: "msg-123",
    threadId: "thr-456",
    labelIds: ["INBOX"],
    snippet: "snippet",
    internalDate: String(Date.UTC(2026, 4, 7, 12, 0, 0)),
    sizeEstimate: 2048,
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "alice@example.com" },
        { name: "Subject", value: "Hi" },
        { name: "Date", value: "Thu, 07 May 2026 12:00:00 +0000" },
      ],
    },
    ...overrides,
  };
}

describe("buildTriggerEvent", () => {
  it("returns a TriggerEvent that passes the contract schema", () => {
    const event = buildTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage(),
    });
    expect(() => TriggerEventSchema.parse(event)).not.toThrow();
  });

  it("uses Gmail message id as eventId (the dedup key)", () => {
    const event = buildTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage({ id: "abc123" }),
    });
    expect(event.eventId).toBe("abc123");
  });

  it("provider/eventType are constants", () => {
    const event = buildTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage(),
    });
    expect(event.provider).toBe("gmail");
    expect(event.eventType).toBe("new_email");
  });

  it("accountId is the email address (matches manifest accountIdField: email)", () => {
    const event = buildTriggerEvent({
      emailAddress: "alice@example.com",
      message: makeMessage(),
    });
    expect(event.providerAccountId).toBe("alice@example.com");
  });

  it("converts internalDate (ms-as-string) to ISO 8601 occurredAt", () => {
    const ms = Date.UTC(2026, 4, 7, 12, 0, 0);
    const event = buildTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage({ internalDate: String(ms) }),
    });
    expect(event.occurredAt).toBe(new Date(ms).toISOString());
  });

  it("flags hasAttachments true on multipart/mixed (heuristic)", () => {
    const event = buildTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage({
        payload: {
          mimeType: "multipart/mixed",
          headers: [{ name: "Subject", value: "x" }],
        },
      }),
    });
    expect(event.payload.hasAttachments).toBe(true);
  });

  it("flags hasAttachments false on non-multipart/mixed", () => {
    const event = buildTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage({
        payload: {
          mimeType: "multipart/alternative",
          headers: [{ name: "Subject", value: "x" }],
        },
      }),
    });
    expect(event.payload.hasAttachments).toBe(false);
  });

  it("extracts headers case-insensitively into payload", () => {
    const event = buildTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage({
        payload: {
          mimeType: "text/plain",
          headers: [
            { name: "FROM", value: "alice@example.com" },
            { name: "subject", value: "Lowercased name" },
          ],
        },
      }),
    });
    expect(event.payload.from).toBe("alice@example.com");
    expect(event.payload.subject).toBe("Lowercased name");
  });

  it("missing headers map to empty strings (non-undefined for downstream variable resolution)", () => {
    const event = buildTriggerEvent({
      emailAddress: "user@example.com",
      message: makeMessage({
        payload: {
          mimeType: "text/plain",
          headers: [],
        },
      }),
    });
    expect(event.payload.from).toBe("");
    expect(event.payload.subject).toBe("");
    expect(event.payload.cc).toBe("");
  });
});

});
