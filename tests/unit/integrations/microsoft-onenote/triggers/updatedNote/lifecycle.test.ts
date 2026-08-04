/**
 * @jest-environment node
 *
 * microsoft-onenote/triggers/updatedNote trigger lifecycle contract suite — one per-trigger suite
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

import { activate } from "@/integrations/microsoft-onenote/triggers/updatedNote/activate";
import { buildEventId, checkAndMarkSeen } from "@/integrations/microsoft-onenote/triggers/updatedNote/dedup";
import { normalizeUpdatedNote } from "@/integrations/microsoft-onenote/triggers/updatedNote/normalize";
import { microsoftOneNoteUpdatedNotePollingHandler } from "@/integrations/microsoft-onenote/triggers/updatedNote/poll";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// Slice 3.ONENOTE-5 — OneNote updated_note activation hook.
// Pinned contracts:
// - Requires notebookId + sectionId; pageId is optional (null when
// not provided).
// - Calls pagesList with `orderBy: "lastModifiedDateTime desc",
// top: 1`.
// - Seeds snapshot.lastSeenModifiedDateTime from newest page.
// - Empty section → seeds with wall-clock ISO.
// - Returns pollingEnabled:true.
// - Re-activation idempotent.
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
  accessTokenExpiresAt: null,
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
  type: "updated_note",
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

describe("updated_note activate — required config", () => {
  it("throws when sectionId missing", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { notebookId: "nb-1" } },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/sectionId is required/);
  });

  it("throws when notebookId missing", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { sectionId: "sec-1" } },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/notebookId is required/);
  });
});

describe("updated_note activate — happy path", () => {
  it("seeds snapshot from newest page's lastModifiedDateTime", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-newest",
          lastModifiedDateTime: "2026-05-23T12:00:00Z",
          createdDateTime: "2026-05-20T08:00:00Z",
        },
      ],
      nextLink: null,
    });
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    expect(mockPagesList.mock.calls[0]![0]).toMatchObject({
      sectionId: "sec-1",
      orderBy: "lastModifiedDateTime desc",
      top: 1,
    });
    const snapshot = (result as Record<string, unknown>).snapshot as {
      lastSeenModifiedDateTime: string;
    };
    expect(snapshot.lastSeenModifiedDateTime).toBe("2026-05-23T12:00:00Z");
    expect(result.pollingEnabled).toBe(true);
    expect((result as Record<string, unknown>).pageId).toBeNull();
  });

  it("preserves optional pageId when set in config", async () => {
    mockPagesList.mockResolvedValueOnce({ pages: [], nextLink: null });
    const result = await activate({
      node: {
        ...baseNode,
        config: { ...baseNode.config, pageId: "p-watch" },
      },
      integration,
      workflowId: "wf-1",
    });
    expect((result as Record<string, unknown>).pageId).toBe("p-watch");
  });

  it("treats empty-string pageId as null", async () => {
    mockPagesList.mockResolvedValueOnce({ pages: [], nextLink: null });
    const result = await activate({
      node: {
        ...baseNode,
        config: { ...baseNode.config, pageId: "" },
      },
      integration,
      workflowId: "wf-1",
    });
    expect((result as Record<string, unknown>).pageId).toBeNull();
  });
});

describe("updated_note activate — empty section", () => {
  it("seeds snapshot with current wall-clock ISO when no pages", async () => {
    mockPagesList.mockResolvedValueOnce({ pages: [], nextLink: null });
    const before = Date.now();
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    const after = Date.now();
    const snapshot = (result as Record<string, unknown>).snapshot as {
      lastSeenModifiedDateTime: string;
    };
    const seedMs = Date.parse(snapshot.lastSeenModifiedDateTime);
    expect(seedMs).toBeGreaterThanOrEqual(before);
    expect(seedMs).toBeLessThanOrEqual(after);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former dedup.test.ts
// Slice 3.ONENOTE-5 — OneNote updated_note dedup wrapper.
// Pinned contracts:
// - buildEventId returns `${pageId}:${lastModifiedDateTime}`
// (composite key — distinct from new_note's `${pageId}:created`
// so the two triggers don't suppress each other).
// - markSeen → fresh round-trips.
// - markSeen throw → outage:true + fresh:false (fail-closed).
// ---------------------------------------------------------------------------
describe("dedup (lifecycle)", () => {

beforeEach(() => {
  mockMarkSeen.mockReset();
});

describe("updated_note dedup — buildEventId composite key", () => {
  it("composes pageId + lastModifiedDateTime", () => {
    expect(buildEventId("p-1", "2026-05-23T12:20:00Z")).toBe(
      "p-1:2026-05-23T12:20:00Z",
    );
  });

  it("distinct from new_note's `${pageId}:created` namespace", () => {
    const updatedKey = buildEventId("p-1", "2026-05-23T12:20:00Z");
    const newKey = "p-1:created";
    expect(updatedKey).not.toBe(newKey);
  });
});

describe("updated_note dedup — checkAndMarkSeen", () => {
  it("calls markSeen with provider=microsoft-onenote + composite eventId", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    const result = await checkAndMarkSeen("p-1", "2026-05-23T12:20:00Z");
    expect(result).toEqual({ fresh: true, outage: false });
    expect(mockMarkSeen).toHaveBeenCalledWith(
      "microsoft-onenote",
      "p-1:2026-05-23T12:20:00Z",
    );
  });

  it("fresh=false round-trips", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    const result = await checkAndMarkSeen("p-2", "2026-05-23T12:25:00Z");
    expect(result).toEqual({ fresh: false, outage: false });
  });

  it("markSeen throw → outage:true + fresh:false (fail-closed)", async () => {
    mockMarkSeen.mockRejectedValueOnce(new Error("dedup db down"));
    const result = await checkAndMarkSeen("p-3", "2026-05-23T12:30:00Z");
    expect(result).toEqual({ fresh: false, outage: true });
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// Slice 3.ONENOTE-5 — OneNote updated_note normalize.
// Pinned contracts:
// - changeKind: "updated".
// - eventId: `${pageId}:${lastModifiedDateTime}`.
// - occurredAt: lastModifiedDateTime (no fallback — required).
// - Throws when lastModifiedDateTime missing (eventId composition
// requires it).
// - No body / content / secret-shaped fields in payload.
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

const providerAccountId = "alice@contoso.com";

describe("updated_note normalize — happy path", () => {
  it("builds a complete TriggerEvent with composite eventId", () => {
    const event = normalizeUpdatedNote({
      page: {
        id: "p-1",
        title: "Doc",
        createdDateTime: "2026-05-20T00:00:00Z",
        lastModifiedDateTime: "2026-05-23T12:20:00Z",
        contentUrl: "https://graph/p1",
        links: { oneNoteWebUrl: { href: "https://onenote.com/p1" } },
        parentNotebook: { displayName: "Work" },
        parentSection: { displayName: "Meetings" },
      },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    expect(event).toEqual({
      provider: "microsoft-onenote",
      eventType: "updated_note",
      eventId: "p-1:2026-05-23T12:20:00Z",
      occurredAt: "2026-05-23T12:20:00Z",
      providerAccountId,
      payload: {
        changeKind: "updated",
        pageId: "p-1",
        title: "Doc",
        webUrl: "https://onenote.com/p1",
        contentUrl: "https://graph/p1",
        notebookId: "nb-1",
        notebookName: "Work",
        sectionId: "sec-1",
        sectionName: "Meetings",
        createdDateTime: "2026-05-20T00:00:00Z",
        lastModifiedDateTime: "2026-05-23T12:20:00Z",
      },
    });
  });
});

describe("updated_note normalize — error guards", () => {
  it("throws when lastModifiedDateTime missing (required for eventId composition)", () => {
    expect(() =>
      normalizeUpdatedNote({
        page: { id: "p-1" /* no lastModifiedDateTime */ },
        providerAccountId,
        notebookId: "nb-1",
        sectionId: "sec-1",
      }),
    ).toThrow(/lastModifiedDateTime is required/);
  });
});

describe("updated_note normalize — banned fields", () => {
  it("does NOT emit content / body / text / messages fields", () => {
    const event = normalizeUpdatedNote({
      page: {
        id: "p-1",
        title: "Hello",
        lastModifiedDateTime: "2026-05-23T12:20:00Z",
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

  it("does NOT emit secret-shaped fields", () => {
    const event = normalizeUpdatedNote({
      page: { id: "p-1", lastModifiedDateTime: "2026-05-23T12:20:00Z" },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    const payloadKeys = Object.keys(event.payload as Record<string, unknown>);
    for (const banned of [
      "token",
      "secret",
      "accessToken",
      "apiKey",
      "refreshToken",
    ]) {
      expect(payloadKeys).not.toContain(banned);
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former poll.test.ts
// Slice 3.ONENOTE-5 — OneNote updated_note polling handler.
// Pinned contracts:
// - canHandle / getIntervalMs shape.
// - Missing snapshot / integration → defensive skip.
// - pagesList called with lastModifiedDateTime desc + top=100.
// - Snapshot advances to max(prev, newest fetched mtime) BEFORE
// dispatch.
// - **Brand-new pages excluded** (createdDateTime ===
// lastModifiedDateTime → new_note covers them).
// - Optional pageId filter narrows to a single page.
// - Dedup keyed on `${pageId}:${lastModifiedDateTime}` composite —
// same page updated at T1 then T2 fires twice; same page +
// same mtime fetched across two ticks dedups.
// - Payload carries no body/content.
// - 404 → no snapshot advance + return.
// - One bad page does not abort the tick.
// - Persists snapshot + lastPolledAt.
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
    eventType: "updated_note",
    nodeId: "node-1",
    providerAccountId: null,
    config: {
      notebookId: "nb-1",
      sectionId: "sec-1",
      pageId: null,
      pollingEnabled: true,
      snapshot: {
        lastSeenModifiedDateTime: "2026-05-23T12:00:00Z",
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

describe("updated_note poll — handler shape", () => {
  it("canHandle matches provider=microsoft-onenote + eventType=updated_note", () => {
    expect(
      microsoftOneNoteUpdatedNotePollingHandler.canHandle(makeTrigger()),
    ).toBe(true);
    expect(
      microsoftOneNoteUpdatedNotePollingHandler.canHandle({
        ...makeTrigger(),
        eventType: "new_note",
      }),
    ).toBe(false);
  });

  it("getIntervalMs returns DEFAULT_INTERVAL_MS", () => {
    expect(
      microsoftOneNoteUpdatedNotePollingHandler.getIntervalMs("default"),
    ).toBe(DEFAULT_INTERVAL_MS);
  });
});

describe("updated_note poll — defensive skips", () => {
  it("skips when snapshot missing", async () => {
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger({ snapshot: undefined }),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockPagesList).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("skips when integration missing", async () => {
    mockGetActive.mockResolvedValueOnce(null);
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });
});

describe("updated_note poll — happy path dispatch", () => {
  it("uses lastModifiedDateTime desc + top=100 ordering", async () => {
    mockPagesList.mockResolvedValueOnce({ pages: [], nextLink: null });
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockPagesList).toHaveBeenCalledWith({
      accessToken: "tok",
      sectionId: "sec-1",
      orderBy: "lastModifiedDateTime desc",
      top: 100,
    });
  });

  it("fires for genuinely-updated pages, in chronological order of mtime", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-3",
          lastModifiedDateTime: "2026-05-23T12:25:00Z",
          createdDateTime: "2026-05-20T00:00:00Z",
        },
        {
          id: "p-2",
          lastModifiedDateTime: "2026-05-23T12:15:00Z",
          createdDateTime: "2026-05-19T00:00:00Z",
        },
      ],
      nextLink: null,
    });
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
    const dispatchedIds = mockEnqueueRun.mock.calls.map(
      (c) =>
        (c[0] as { event: { payload: { pageId: string } } }).event.payload
          .pageId,
    );
    expect(dispatchedIds).toEqual(["p-2", "p-3"]);
  });

  it("payload carries metadata only (no content/body) + changeKind:updated", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-1",
          title: "Hello",
          lastModifiedDateTime: "2026-05-23T12:20:00Z",
          createdDateTime: "2026-05-20T00:00:00Z",
          contentUrl: "https://graph/p1",
          links: { oneNoteWebUrl: { href: "https://onenote.com/p1" } },
        },
      ],
      nextLink: null,
    });
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    const event = (mockEnqueueRun.mock.calls[0]![0] as {
      event: import("@/contracts/triggerEvent").TriggerEvent;
    }).event;
    expect(event.eventType).toBe("updated_note");
    expect(event.payload).not.toHaveProperty("content");
    expect(event.payload).not.toHaveProperty("body");
    expect(event.payload).toMatchObject({
      changeKind: "updated",
      pageId: "p-1",
      title: "Hello",
      lastModifiedDateTime: "2026-05-23T12:20:00Z",
    });
  });
});

describe("updated_note poll — brand-new-page exclusion (new_note handles those)", () => {
  it("excludes pages where createdDateTime === lastModifiedDateTime", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-brand-new",
          createdDateTime: "2026-05-23T12:20:00Z",
          lastModifiedDateTime: "2026-05-23T12:20:00Z",
        },
        {
          id: "p-real-update",
          createdDateTime: "2026-05-20T00:00:00Z",
          lastModifiedDateTime: "2026-05-23T12:20:00Z",
        },
      ],
      nextLink: null,
    });
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const dispatchedId = (
      mockEnqueueRun.mock.calls[0]![0] as {
        event: { payload: { pageId: string } };
      }
    ).event.payload.pageId;
    expect(dispatchedId).toBe("p-real-update");
  });
});

describe("updated_note poll — optional pageId filter", () => {
  it("when pageId is set, fires only for the matching page", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-other",
          createdDateTime: "2026-05-20T00:00:00Z",
          lastModifiedDateTime: "2026-05-23T12:25:00Z",
        },
        {
          id: "p-watched",
          createdDateTime: "2026-05-20T00:00:00Z",
          lastModifiedDateTime: "2026-05-23T12:20:00Z",
        },
      ],
      nextLink: null,
    });
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger({ pageId: "p-watched" }),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const dispatchedId = (
      mockEnqueueRun.mock.calls[0]![0] as {
        event: { payload: { pageId: string } };
      }
    ).event.payload.pageId;
    expect(dispatchedId).toBe("p-watched");
  });

  it("when pageId is null, fires for any updated page in the section", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-a",
          createdDateTime: "2026-05-20T00:00:00Z",
          lastModifiedDateTime: "2026-05-23T12:15:00Z",
        },
        {
          id: "p-b",
          createdDateTime: "2026-05-20T00:00:00Z",
          lastModifiedDateTime: "2026-05-23T12:25:00Z",
        },
      ],
      nextLink: null,
    });
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger({ pageId: null }),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
  });
});

describe("updated_note poll — composite dedup key", () => {
  it("dedup uses `${pageId}:${lastModifiedDateTime}` composite", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-1",
          createdDateTime: "2026-05-20T00:00:00Z",
          lastModifiedDateTime: "2026-05-23T12:20:00Z",
        },
      ],
      nextLink: null,
    });
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockMarkSeen).toHaveBeenCalledWith(
      "microsoft-onenote",
      "p-1:2026-05-23T12:20:00Z",
    );
  });

  it("same page + same mtime fetched across 2 ticks → fires once (dedup blocks second)", async () => {
    // Tick 1
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-1",
          createdDateTime: "2026-05-20T00:00:00Z",
          lastModifiedDateTime: "2026-05-23T12:20:00Z",
        },
      ],
      nextLink: null,
    });
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);

    // Tick 2 — same page+mtime, dedup-not-fresh
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-1",
          createdDateTime: "2026-05-20T00:00:00Z",
          lastModifiedDateTime: "2026-05-23T12:20:00Z",
        },
      ],
      nextLink: null,
    });
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger({
        snapshot: {
          lastSeenModifiedDateTime: "2026-05-23T12:15:00Z",
          capturedAt: "x",
        },
      }),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    // Still 1 — second tick blocked by dedup.
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
  });

  it("same page updated AGAIN (different mtime) → fires twice (distinct dedup keys)", async () => {
    // Tick 1
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-1",
          createdDateTime: "2026-05-20T00:00:00Z",
          lastModifiedDateTime: "2026-05-23T12:20:00Z",
        },
      ],
      nextLink: null,
    });
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });

    // Tick 2 — same page, new mtime; dedup key differs
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-1",
          createdDateTime: "2026-05-20T00:00:00Z",
          lastModifiedDateTime: "2026-05-23T12:28:00Z",
        },
      ],
      nextLink: null,
    });
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger({
        snapshot: {
          lastSeenModifiedDateTime: "2026-05-23T12:20:00Z",
          capturedAt: "x",
        },
      }),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
  });
});

describe("updated_note poll — snapshot advancement invariant", () => {
  it("advances snapshot to max(prev, newest fetched mtime) even when every page filtered out", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        // Brand-new (excluded) but mtime > prev — snapshot should still advance
        {
          id: "p-new",
          createdDateTime: "2026-05-23T12:25:00Z",
          lastModifiedDateTime: "2026-05-23T12:25:00Z",
        },
      ],
      nextLink: null,
    });
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    const persisted = mockUpdateConfig.mock.calls[0]![1] as {
      snapshot: { lastSeenModifiedDateTime: string };
    };
    expect(persisted.snapshot.lastSeenModifiedDateTime).toBe(
      "2026-05-23T12:25:00Z",
    );
  });
});

describe("updated_note poll — error handling", () => {
  it("404 NotFoundError → no snapshot advance, no persist", async () => {
    mockPagesList.mockRejectedValueOnce(
      new NotFoundError("section sec-1", "not found"),
    );
    await microsoftOneNoteUpdatedNotePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it("other errors propagate", async () => {
    mockPagesList.mockRejectedValueOnce(new Error("graph 500"));
    await expect(
      microsoftOneNoteUpdatedNotePollingHandler.poll({
        trigger: makeTrigger(),
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      }),
    ).rejects.toThrow(/graph 500/);
  });
});

});
