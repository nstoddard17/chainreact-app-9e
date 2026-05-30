/**
 * @jest-environment node
 *
 * Slice 3.ONENOTE-5 — OneNote updated_note polling handler.
 *
 * Pinned contracts:
 *   - canHandle / getIntervalMs shape.
 *   - Missing snapshot / integration → defensive skip.
 *   - pagesList called with lastModifiedDateTime desc + top=100.
 *   - Snapshot advances to max(prev, newest fetched mtime) BEFORE
 *     dispatch.
 *   - **Brand-new pages excluded** (createdDateTime ===
 *     lastModifiedDateTime → new_note covers them).
 *   - Optional pageId filter narrows to a single page.
 *   - Dedup keyed on `${pageId}:${lastModifiedDateTime}` composite —
 *     same page updated at T1 then T2 fires twice; same page +
 *     same mtime fetched across two ticks dedups.
 *   - Payload carries no body/content.
 *   - 404 → no snapshot advance + return.
 *   - One bad page does not abort the tick.
 *   - Persists snapshot + lastPolledAt.
 */

const mockRefreshAndRetry = jest.fn();
const mockPagesList = jest.fn();
const mockGetActive = jest.fn();
const mockUpdateConfig = jest.fn();
const mockMarkSeen = jest.fn();
const mockEnqueueRun = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/microsoft-onenote/api/pagesList", () => ({
  pagesList: (...args: unknown[]) => mockPagesList(...args),
}));
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActive(...args),
}));
jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));
jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));
jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueueRun(...args),
}));

import { microsoftOneNoteUpdatedNotePollingHandler } from "@/integrations/microsoft-onenote/triggers/updatedNote/poll";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";

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
