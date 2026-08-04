/**
 * @jest-environment node
 *
 * microsoft-onenote/triggers/newNote trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockPagesList = jest.fn();
const mockMarkSeen = jest.fn();
const mockGetActive = jest.fn();
const mockUpdateConfig = jest.fn();
const mockEnqueueRun = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));

jest.mock("@/integrations/microsoft-onenote/api/pagesList", () => ({
  pagesList: (...args: unknown[]) => mockPagesList(...args),
}));

jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActive(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueueRun(...args),
}));

import { activate } from "@/integrations/microsoft-onenote/triggers/newNote/activate";
import { buildEventId, checkAndMarkSeen } from "@/integrations/microsoft-onenote/triggers/newNote/dedup";
import { normalizeNewNote } from "@/integrations/microsoft-onenote/triggers/newNote/normalize";
import { microsoftOneNoteNewNotePollingHandler } from "@/integrations/microsoft-onenote/triggers/newNote/poll";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// Slice 3.ONENOTE-5 — OneNote new_note activation hook.
// Pinned contracts:
// - Requires `notebookId` + `sectionId` in node.config (both throw on
// missing/empty).
// - Calls `pagesList` exactly once with `{sectionId, orderBy:
// "createdDateTime desc", top: 1}`.
// - Calls refreshAndRetry with provider=microsoft-onenote and
// accountId=integration.providerAccountId.
// - Stores newest page's `createdDateTime` as
// `snapshot.lastSeenCreatedDateTime` when section has pages.
// - Empty section → seeds with current wall-clock ISO timestamp
// (first-poll-miss protection, empty-section case).
// - Returns `pollingEnabled: true`.
// - Re-activation idempotent — each call re-seeds from CURRENT
// newest; missed pages during disabled window are NOT replayed.
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

const integration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-onenote",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (OneNote)",
  accessTokenEncrypted: "ENC",
  refreshTokenEncrypted: "REF",
  accessTokenExpiresAt: "2026-05-24T00:00:00Z",
  scopes: ["offline_access", "Notes.ReadWrite"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "microsoft-onenote",
  type: "new_note",
  config: {
    notebookId: "nb-1",
    sectionId: "sec-1",
  },
  position: { x: 0, y: 0 },
};

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPagesList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("new_note activate — required config", () => {
  it("throws when sectionId is missing", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { notebookId: "nb-1" } },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/sectionId is required/);
    expect(mockPagesList).not.toHaveBeenCalled();
  });

  it("throws when notebookId is missing", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { sectionId: "sec-1" } },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/notebookId is required/);
    expect(mockPagesList).not.toHaveBeenCalled();
  });

  it("throws when sectionId is empty string", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { notebookId: "nb-1", sectionId: "" },
        },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/sectionId is required/);
  });
});

describe("new_note activate — happy path (section has pages)", () => {
  it("seeds snapshot from the newest page's createdDateTime", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-newest",
          title: "Newest",
          createdDateTime: "2026-05-23T12:00:00Z",
          lastModifiedDateTime: "2026-05-23T12:00:00Z",
        },
      ],
      nextLink: null,
    });
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-onenote");
    expect(args.providerAccountId).toBe("alice@contoso.com");

    expect(mockPagesList).toHaveBeenCalledTimes(1);
    expect(mockPagesList.mock.calls[0]![0]).toMatchObject({
      sectionId: "sec-1",
      orderBy: "createdDateTime desc",
      top: 1,
    });

    expect(result.pollingEnabled).toBe(true);
    const snapshot = (result as Record<string, unknown>).snapshot as {
      lastSeenCreatedDateTime: string;
      capturedAt: string;
    };
    expect(snapshot.lastSeenCreatedDateTime).toBe("2026-05-23T12:00:00Z");
    expect(typeof snapshot.capturedAt).toBe("string");
    expect(snapshot.capturedAt.length).toBeGreaterThan(0);

    // notebookId + sectionId are echoed in the patch.
    expect((result as Record<string, unknown>).notebookId).toBe("nb-1");
    expect((result as Record<string, unknown>).sectionId).toBe("sec-1");
  });
});

describe("new_note activate — empty section (first-poll-miss empty branch)", () => {
  it("seeds snapshot with current wall-clock ISO when section is empty", async () => {
    mockPagesList.mockResolvedValueOnce({ pages: [], nextLink: null });
    const before = Date.now();
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    const after = Date.now();
    const snapshot = (result as Record<string, unknown>).snapshot as {
      lastSeenCreatedDateTime: string;
      capturedAt: string;
    };
    // Seed is an ISO timestamp from the activation window.
    const seedMs = Date.parse(snapshot.lastSeenCreatedDateTime);
    expect(seedMs).toBeGreaterThanOrEqual(before);
    expect(seedMs).toBeLessThanOrEqual(after);
  });

  it("seeds wall-clock when newest page is missing createdDateTime", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [{ id: "p-1" /* no createdDateTime */ }],
      nextLink: null,
    });
    const before = Date.now();
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    const after = Date.now();
    const snapshot = (result as Record<string, unknown>).snapshot as {
      lastSeenCreatedDateTime: string;
    };
    const seedMs = Date.parse(snapshot.lastSeenCreatedDateTime);
    expect(seedMs).toBeGreaterThanOrEqual(before);
    expect(seedMs).toBeLessThanOrEqual(after);
  });
});

describe("new_note activate — re-activation idempotency", () => {
  it("each call re-seeds from CURRENT newest page (no replay of disabled-window pages)", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        { id: "p-old", createdDateTime: "2026-05-22T00:00:00Z" },
      ],
      nextLink: null,
    });
    const first = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    expect(
      ((first as Record<string, unknown>).snapshot as { lastSeenCreatedDateTime: string })
        .lastSeenCreatedDateTime,
    ).toBe("2026-05-22T00:00:00Z");

    mockPagesList.mockResolvedValueOnce({
      pages: [
        { id: "p-newer", createdDateTime: "2026-05-23T12:00:00Z" },
      ],
      nextLink: null,
    });
    const second = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    expect(
      ((second as Record<string, unknown>).snapshot as { lastSeenCreatedDateTime: string })
        .lastSeenCreatedDateTime,
    ).toBe("2026-05-23T12:00:00Z");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former dedup.test.ts
// Slice 3.ONENOTE-5 — OneNote new_note dedup wrapper.
// Pinned contracts:
// - buildEventId returns `${pageId}:created` exactly.
// - markSeen is called with provider="microsoft-onenote" + the
// composed eventId.
// - fresh:true round-trips through.
// - fresh:false round-trips through.
// - markSeen throw → outage:true, fresh:false (fail-closed).
// ---------------------------------------------------------------------------
describe("dedup (lifecycle)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// Slice 3.ONENOTE-5 — OneNote new_note normalize.
// Pinned contracts:
// - Payload shape matches the newNote.meta.ts payloadShape.
// - changeKind: "created".
// - eventId: `${pageId}:created` (matches dedup namespace).
// - occurredAt: createdDateTime (or wall-clock when missing).
// - No body/content/messages fields.
// - Sensitive-eligible fields (title/webUrl/contentUrl/notebookName/
// sectionName) present even when value is null (so the structural
// redaction layer can mark them).
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

const providerAccountId = "alice@contoso.com";

describe("new_note normalize — happy path", () => {
  it("builds a complete TriggerEvent for a fully-populated page", () => {
    const event = normalizeNewNote({
      page: {
        id: "p-1",
        title: "Sprint planning",
        createdDateTime: "2026-05-23T12:10:00Z",
        lastModifiedDateTime: "2026-05-23T12:10:00Z",
        contentUrl: "https://graph/p1",
        links: { oneNoteWebUrl: { href: "https://onenote.com/p1" } },
        parentNotebook: { id: "nb-1", displayName: "Work" },
        parentSection: { id: "sec-1", displayName: "Meetings" },
      },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    expect(event).toEqual({
      provider: "microsoft-onenote",
      eventType: "new_note",
      eventId: "p-1:created",
      occurredAt: "2026-05-23T12:10:00Z",
      providerAccountId,
      payload: {
        changeKind: "created",
        pageId: "p-1",
        title: "Sprint planning",
        webUrl: "https://onenote.com/p1",
        contentUrl: "https://graph/p1",
        notebookId: "nb-1",
        notebookName: "Work",
        sectionId: "sec-1",
        sectionName: "Meetings",
        createdDateTime: "2026-05-23T12:10:00Z",
        lastModifiedDateTime: "2026-05-23T12:10:00Z",
      },
    });
  });
});

describe("new_note normalize — missing optional fields", () => {
  it("emits null for title/webUrl/contentUrl/notebookName/sectionName when absent", () => {
    const event = normalizeNewNote({
      page: { id: "p-2", createdDateTime: "2026-05-23T12:00:00Z" },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    expect(event.payload).toMatchObject({
      title: null,
      webUrl: null,
      contentUrl: null,
      notebookName: null,
      sectionName: null,
    });
  });

  it("falls back to current ISO when createdDateTime missing (occurredAt always populated)", () => {
    const before = Date.now();
    const event = normalizeNewNote({
      page: { id: "p-3" },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    const after = Date.now();
    const occurredMs = Date.parse(event.occurredAt);
    expect(occurredMs).toBeGreaterThanOrEqual(before);
    expect(occurredMs).toBeLessThanOrEqual(after);
  });
});

describe("new_note normalize — banned fields (no body / content in payload)", () => {
  it("does NOT emit content / body / text / messages fields", () => {
    const event = normalizeNewNote({
      page: {
        id: "p-1",
        title: "Hello",
        createdDateTime: "2026-05-23T12:10:00Z",
      },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    const payloadKeys = Object.keys(event.payload as Record<string, unknown>);
    for (const banned of ["content", "body", "text", "messages", "snippet"]) {
      expect(payloadKeys).not.toContain(banned);
    }
  });

  it("does NOT emit secret-shaped fields (token / secret / accessToken)", () => {
    const event = normalizeNewNote({
      page: { id: "p-1", createdDateTime: "2026-05-23T12:10:00Z" },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    const payloadKeys = Object.keys(event.payload as Record<string, unknown>);
    for (const banned of ["token", "secret", "accessToken", "apiKey", "refreshToken"]) {
      expect(payloadKeys).not.toContain(banned);
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former poll.test.ts
// Slice 3.ONENOTE-5 — OneNote new_note polling handler.
// Pinned contracts:
// - canHandle matches provider="microsoft-onenote" + eventType="new_note".
// - getIntervalMs returns the shared DEFAULT_INTERVAL_MS (5 min).
// - Missing snapshot → defensive skip (warn + return).
// - Missing integration → access-gate skip (warn + return).
// - Calls pagesList with `$orderby=createdDateTime desc&$top=100`.
// - Detects pages created after snapshot.
// - Snapshot advances to max(prev, newest fetched) BEFORE filter
// dispatch.
// - Dispatches in chronological order (oldest → newest).
// - Dedup checked + marked per page; outage → skip; not-fresh → skip.
// - Payload does NOT include full content/body.
// - 404 NotFoundError (section deleted) → no snapshot advance, log + return.
// - One bad page does not abort the tick.
// - Persists snapshot + lastPolledAt at the end.
// ---------------------------------------------------------------------------
describe("poll (lifecycle)", () => {

const NOW = Date.parse("2026-05-23T12:30:00Z");

function makeTrigger(
  configOverrides: Record<string, unknown> = {},
): import("@/repositories/triggerResources").TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "microsoft-onenote",
    eventType: "new_note",
    nodeId: "node-1",
    providerAccountId: null,
    config: {
      notebookId: "nb-1",
      sectionId: "sec-1",
      pollingEnabled: true,
      snapshot: {
        lastSeenCreatedDateTime: "2026-05-23T12:00:00Z",
        capturedAt: "2026-05-23T00:00:00Z",
      },
      ...configOverrides,
    },
    registeredAt: "2026-05-23T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-05-23T00:00:00Z",
    updatedAt: "2026-05-23T00:00:00Z",
  };
}

const integration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-onenote",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (OneNote)",
  accessTokenEncrypted: "ENC",
  refreshTokenEncrypted: "REF",
  accessTokenExpiresAt: null,
  scopes: ["offline_access", "Notes.ReadWrite"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPagesList.mockReset();
  mockGetActive.mockReset();
  mockUpdateConfig.mockReset();
  mockMarkSeen.mockReset();
  mockEnqueueRun.mockReset();
  mockGetActive.mockResolvedValue(integration);
  mockMarkSeen.mockResolvedValue({ fresh: true });
  mockEnqueueRun.mockResolvedValue({ runId: "run-1", enqueuedAt: "now" });
  mockUpdateConfig.mockResolvedValue(undefined);
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("new_note poll — handler shape", () => {
  it("canHandle matches provider=microsoft-onenote + eventType=new_note", () => {
    expect(
      microsoftOneNoteNewNotePollingHandler.canHandle(makeTrigger()),
    ).toBe(true);
    expect(
      microsoftOneNoteNewNotePollingHandler.canHandle(
        makeTrigger({}) && { ...makeTrigger(), eventType: "other" },
      ),
    ).toBe(false);
  });

  it("getIntervalMs returns the shared DEFAULT_INTERVAL_MS", () => {
    expect(microsoftOneNoteNewNotePollingHandler.getIntervalMs("default")).toBe(
      DEFAULT_INTERVAL_MS,
    );
  });
});

describe("new_note poll — defensive skips", () => {
  it("skips when snapshot is missing (no API call, no enqueue)", async () => {
    const trigger = makeTrigger({ snapshot: undefined });
    await microsoftOneNoteNewNotePollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockPagesList).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("skips when integration is missing (access gate)", async () => {
    mockGetActive.mockResolvedValueOnce(null);
    await microsoftOneNoteNewNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockPagesList).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });
});

describe("new_note poll — happy path dispatch", () => {
  it("calls pagesList with sectionId + createdDateTime desc + top=100", async () => {
    mockPagesList.mockResolvedValueOnce({ pages: [], nextLink: null });
    await microsoftOneNoteNewNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockPagesList).toHaveBeenCalledWith({
      accessToken: "tok",
      sectionId: "sec-1",
      orderBy: "createdDateTime desc",
      top: 100,
    });
  });

  it("enqueues one run per page created after snapshot, in chronological order", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        // Graph returns newest-first
        {
          id: "p-3",
          title: "Third",
          createdDateTime: "2026-05-23T12:25:00Z",
          lastModifiedDateTime: "2026-05-23T12:25:00Z",
          contentUrl: "https://graph/p3",
          links: { oneNoteWebUrl: { href: "https://onenote.com/p3" } },
        },
        {
          id: "p-2",
          title: "Second",
          createdDateTime: "2026-05-23T12:15:00Z",
          lastModifiedDateTime: "2026-05-23T12:15:00Z",
        },
        // older than snapshot — must be filtered out
        {
          id: "p-old",
          title: "Old",
          createdDateTime: "2026-05-23T11:00:00Z",
          lastModifiedDateTime: "2026-05-23T11:00:00Z",
        },
      ],
      nextLink: null,
    });
    await microsoftOneNoteNewNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
    const dispatchedIds = mockEnqueueRun.mock.calls.map(
      (c) => (c[0] as { event: { payload: { pageId: string } } }).event.payload.pageId,
    );
    // Chronological: oldest fresh first, then newest
    expect(dispatchedIds).toEqual(["p-2", "p-3"]);
  });

  it("dedup is checked + marked per page; outage skips, not-fresh skips", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        { id: "p-fresh", createdDateTime: "2026-05-23T12:10:00Z", lastModifiedDateTime: "2026-05-23T12:10:00Z" },
        { id: "p-already-seen", createdDateTime: "2026-05-23T12:20:00Z", lastModifiedDateTime: "2026-05-23T12:20:00Z" },
      ],
      nextLink: null,
    });
    mockMarkSeen
      .mockResolvedValueOnce({ fresh: true }) // p-fresh
      .mockResolvedValueOnce({ fresh: false }); // p-already-seen
    await microsoftOneNoteNewNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    // Dedup eventId namespace is `${pageId}:created`.
    expect(mockMarkSeen).toHaveBeenCalledWith("microsoft-onenote", "p-fresh:created");
    expect(mockMarkSeen).toHaveBeenCalledWith("microsoft-onenote", "p-already-seen:created");
  });

  it("payload carries metadata only (no content / body)", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-1",
          title: "Hello",
          createdDateTime: "2026-05-23T12:10:00Z",
          lastModifiedDateTime: "2026-05-23T12:10:00Z",
          contentUrl: "https://graph/p1",
          links: { oneNoteWebUrl: { href: "https://onenote.com/p1" } },
        },
      ],
      nextLink: null,
    });
    await microsoftOneNoteNewNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    const event = (mockEnqueueRun.mock.calls[0]![0] as { event: import("@/contracts/triggerEvent").TriggerEvent }).event;
    expect(event.eventType).toBe("new_note");
    expect(event.payload).not.toHaveProperty("content");
    expect(event.payload).not.toHaveProperty("body");
    expect(event.payload).toMatchObject({
      changeKind: "created",
      pageId: "p-1",
      title: "Hello",
      webUrl: "https://onenote.com/p1",
      contentUrl: "https://graph/p1",
      notebookId: "nb-1",
      sectionId: "sec-1",
      createdDateTime: "2026-05-23T12:10:00Z",
    });
  });
});

describe("new_note poll — snapshot advancement invariant", () => {
  it("advances snapshot to max(prev, newest fetched) even when every page filtered out", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        // newer than snapshot, but dedup-not-fresh
        { id: "p-1", createdDateTime: "2026-05-23T12:20:00Z", lastModifiedDateTime: "2026-05-23T12:20:00Z" },
      ],
      nextLink: null,
    });
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    await microsoftOneNoteNewNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const persisted = mockUpdateConfig.mock.calls[0]![1] as { snapshot: { lastSeenCreatedDateTime: string } };
    // Snapshot advanced even though no event fired.
    expect(persisted.snapshot.lastSeenCreatedDateTime).toBe("2026-05-23T12:20:00Z");
  });

  it("snapshot does NOT regress when all fetched pages are older than current snapshot", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        { id: "p-old", createdDateTime: "2026-05-23T11:00:00Z", lastModifiedDateTime: "2026-05-23T11:00:00Z" },
      ],
      nextLink: null,
    });
    await microsoftOneNoteNewNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    const persisted = mockUpdateConfig.mock.calls[0]![1] as { snapshot: { lastSeenCreatedDateTime: string } };
    // Snapshot stays at the original value.
    expect(persisted.snapshot.lastSeenCreatedDateTime).toBe("2026-05-23T12:00:00Z");
  });

  it("persists lastPolledAt timestamp from input.now", async () => {
    mockPagesList.mockResolvedValueOnce({ pages: [], nextLink: null });
    await microsoftOneNoteNewNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    const persisted = mockUpdateConfig.mock.calls[0]![1] as { polling: { lastPolledAt: string } };
    expect(persisted.polling.lastPolledAt).toBe(new Date(NOW).toISOString());
  });
});

describe("new_note poll — error handling", () => {
  it("404 NotFoundError (section deleted) does NOT advance snapshot or persist config", async () => {
    mockPagesList.mockRejectedValueOnce(new NotFoundError("section sec-1", "not found"));
    await microsoftOneNoteNewNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it("other errors propagate (cron's outer catch logs them)", async () => {
    mockPagesList.mockRejectedValueOnce(new Error("graph 500"));
    await expect(
      microsoftOneNoteNewNotePollingHandler.poll({
        trigger: makeTrigger(),
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      }),
    ).rejects.toThrow(/graph 500/);
  });

  it("one bad page does not abort the tick (enqueue failures are swallowed)", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        { id: "p-good-1", createdDateTime: "2026-05-23T12:10:00Z", lastModifiedDateTime: "2026-05-23T12:10:00Z" },
        { id: "p-bad", createdDateTime: "2026-05-23T12:20:00Z", lastModifiedDateTime: "2026-05-23T12:20:00Z" },
        { id: "p-good-2", createdDateTime: "2026-05-23T12:25:00Z", lastModifiedDateTime: "2026-05-23T12:25:00Z" },
      ],
      nextLink: null,
    });
    mockEnqueueRun
      .mockResolvedValueOnce({ runId: "r1", enqueuedAt: "x" })
      .mockRejectedValueOnce(new Error("enqueue boom"))
      .mockResolvedValueOnce({ runId: "r2", enqueuedAt: "x" });
    await microsoftOneNoteNewNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    // All 3 attempted; 2 succeeded, 1 swallowed.
    expect(mockEnqueueRun).toHaveBeenCalledTimes(3);
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1); // tick still completes
  });
});

});
