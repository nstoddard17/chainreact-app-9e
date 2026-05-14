/**
 * @jest-environment node
 *
 * Tests for the Gmail extractMessageEvents helper extracted from
 * poll.ts in Gmail 2.3 Commit 2.
 *
 * Two test concerns:
 *  1. **Tagged-event correctness** — every history-record source is
 *     visited and tagged correctly, addedLabelIds preserved for
 *     labelsAdded events.
 *  2. **`new_email` regression guard** — the new tagged shape, when
 *     mapped back to an id set via the same `Array.from(new Set(events
 *     .map(e => e.id)))` collapse used in poll.ts, MUST produce the
 *     same id set the pre-refactor flat `extractMessageIds` produced.
 *     This is the load-bearing assertion: nothing about new_email's
 *     id-surfacing behavior may change.
 */
import { extractMessageEvents } from "@/integrations/gmail/triggers/newEmail/extractMessageEvents";
import type { GmailHistoryRecord } from "@/integrations/gmail/api/usersHistoryList";

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
