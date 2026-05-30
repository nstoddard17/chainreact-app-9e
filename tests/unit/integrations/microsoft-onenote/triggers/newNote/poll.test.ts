/**
 * @jest-environment node
 *
 * Slice 3.ONENOTE-5 — OneNote new_note polling handler.
 *
 * Pinned contracts:
 *   - canHandle matches provider="microsoft-onenote" + eventType="new_note".
 *   - getIntervalMs returns the shared DEFAULT_INTERVAL_MS (5 min).
 *   - Missing snapshot → defensive skip (warn + return).
 *   - Missing integration → access-gate skip (warn + return).
 *   - Calls pagesList with `$orderby=createdDateTime desc&$top=100`.
 *   - Detects pages created after snapshot.
 *   - Snapshot advances to max(prev, newest fetched) BEFORE filter
 *     dispatch.
 *   - Dispatches in chronological order (oldest → newest).
 *   - Dedup checked + marked per page; outage → skip; not-fresh → skip.
 *   - Payload does NOT include full content/body.
 *   - 404 NotFoundError (section deleted) → no snapshot advance, log + return.
 *   - One bad page does not abort the tick.
 *   - Persists snapshot + lastPolledAt at the end.
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

import { microsoftOneNoteNewNotePollingHandler } from "@/integrations/microsoft-onenote/triggers/newNote/poll";
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
