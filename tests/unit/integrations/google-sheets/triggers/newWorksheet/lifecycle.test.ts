/**
 * @jest-environment node
 *
 * google-sheets/triggers/newWorksheet trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockSpreadsheetsGet = jest.fn();
const mockChangesGetStartPageToken = jest.fn();
const mockFilesWatch = jest.fn();
const mockBuildChannelToken = jest.fn();
const mockChannelsStop = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/spreadsheetsGet", () => ({
  spreadsheetsGet: (...args: unknown[]) => mockSpreadsheetsGet(...args),
}));

jest.mock("@/integrations/google-drive/api/changesGetStartPageToken", () => ({
  changesGetStartPageToken: (...args: unknown[]) =>
    mockChangesGetStartPageToken(...args),
}));

jest.mock("@/integrations/google-drive/api/filesWatch", () => ({
  filesWatch: (...args: unknown[]) => mockFilesWatch(...args),
}));

jest.mock("@/integrations/_shared/google/channelToken", () => ({
  buildChannelToken: (...args: unknown[]) => mockBuildChannelToken(...args),
}));

jest.mock("@/integrations/google-drive/api/channelsStop", () => ({
  channelsStop: (...args: unknown[]) => mockChannelsStop(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { NewWorksheetInputConfigSchema } from "@/integrations/google-sheets/triggers/newWorksheet/schema";
import { activate } from "@/integrations/google-sheets/triggers/newWorksheet/activate";
import { NotFoundError } from "@/integrations/google-drive/api/errors";
import { deactivate } from "@/integrations/google-sheets/triggers/newWorksheet/deactivate";
import { normalize } from "@/integrations/google-sheets/triggers/newWorksheet/normalize";
import { pull } from "@/integrations/google-sheets/triggers/newWorksheet/pull";
import { sheetsNewWorksheetSubscriptionHandler } from "@/integrations/google-sheets/triggers/newWorksheet/renew";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

interface WorksheetSnapshot {
  names: string[];
  updatedAt: string;
}
function worksheetSnapshotOf(
  result: Record<string, unknown>,
): WorksheetSnapshot {
  return result.worksheetSnapshot as WorksheetSnapshot;
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSpreadsheetsGet.mockReset();
  mockChangesGetStartPageToken.mockReset();
  mockFilesWatch.mockReset();
  mockBuildChannelToken.mockReset();
  mockBuildChannelToken.mockReturnValue("hmac-token");
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

const baseNode = {
  id: "node-trigger-nw",
  kind: "trigger" as const,
  provider: "google-sheets",
  type: "new_worksheet",
  config: { spreadsheetId: "ss-1" },
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "google-sheets",
  providerAccountId: "alice@example.com",
  displayName: "alice@example.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Sheets new_worksheet activate", () => {
  it("seeds the worksheet-name baseline + creates the Drive files.watch", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      spreadsheetId: "ss-1",
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1", index: 0, sheetType: "GRID" } },
        { properties: { sheetId: 12, title: "Notes", index: 1, sheetType: "GRID" } },
      ],
    });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "page-100",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "channel-from-google",
      resourceId: "res-id",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockSpreadsheetsGet).toHaveBeenCalledTimes(1);
    expect(mockSpreadsheetsGet.mock.calls[0]![0].spreadsheetId).toBe("ss-1");
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("ss-1");

    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      spreadsheetId: "ss-1",
      resourceId: "res-id",
    });
    expect(result.channelId).toMatch(/^chainreact-node-trigger-nw-[0-9a-f-]+$/);

    // The baseline is the names array (workbook order).
    const snap = worksheetSnapshotOf(result);
    expect(snap.names).toEqual(["Sheet1", "Notes"]);
    expect(typeof snap.updatedAt).toBe("string");
  });

  it("baseline is empty when the spreadsheet returns no sheets (defensive)", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({ spreadsheetId: "ss-1" });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(worksheetSnapshotOf(result).names).toEqual([]);
  });

  it("filters out sheets without a title (defensive)", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { sheetId: 1 } }, // no title — skipped
        { properties: { sheetId: 2, title: "" } }, // empty title — skipped
        { properties: { sheetId: 3, title: "Tab3" } },
      ],
    });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(worksheetSnapshotOf(result).names).toEqual(["Sheet1", "Tab3"]);
  });

  it("does NOT emit any events at activate time (baseline-only)", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
    });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });

    // ActivationFn returns a config patch — it does NOT return events.
    // This test pins that contract: the patch has worksheetSnapshot
    // but does NOT carry any TriggerEvent fields.
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(result).not.toHaveProperty("events");
    expect(result.worksheetSnapshot).toBeDefined();
  });

  it("rejects missing spreadsheetId at parse time", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: {} },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/spreadsheetId/);
    expect(mockSpreadsheetsGet).not.toHaveBeenCalled();
    expect(mockFilesWatch).not.toHaveBeenCalled();
  });

  it("rejects unknown fields at parse time (V1 polling chrome)", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { spreadsheetId: "ss-1", hasHeaders: true },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow();
    expect(mockSpreadsheetsGet).not.toHaveBeenCalled();
  });

  it("propagates spreadsheets.get errors (orchestrator wraps as TRIGGER_REGISTRATION_FAILED)", async () => {
    mockSpreadsheetsGet.mockRejectedValueOnce(new Error("API unavailable"));

    await expect(
      activate({
        node: baseNode,
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/API unavailable/);
    // files.watch was NOT called — activation aborted before
    // creating the provider-side resource. No orphaned channels.
    expect(mockFilesWatch).not.toHaveBeenCalled();
  });

  it("makes NO account-wide Drive changes call during activation (GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2)", async () => {
    // The old activation fetched a changes.getStartPageToken cursor and
    // persisted it, but nothing ever read it — write-only dead state, and an
    // account-wide Drive call this provider no longer has a broad scope for.
    // Activation must now touch only the explicitly selected spreadsheet.
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "channel-from-google",
      resourceId: "res-id",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
    expect(mockChangesGetStartPageToken).not.toHaveBeenCalled();
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
  });

  it("passes the channel HMAC token on the watch request", async () => {
    mockBuildChannelToken.mockReturnValueOnce("the-real-hmac");
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
    });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(mockFilesWatch.mock.calls[0]![0].channelToken).toBe("the-real-hmac");
  });

  it("uses NEXT_PUBLIC_APP_URL for the webhook address", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({ sheets: [] });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(mockFilesWatch.mock.calls[0]![0].webhookAddress).toBe(
      "https://app.example.test/api/webhooks/google-sheets",
    );
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// ---------------------------------------------------------------------------

describe("NewWorksheetInputConfigSchema", () => {
  it("accepts the minimal valid config (spreadsheetId only)", () => {
    const result = NewWorksheetInputConfigSchema.parse({
      spreadsheetId: "ss-1",
    });
    expect(result).toEqual({ spreadsheetId: "ss-1" });
  });

  it("rejects missing spreadsheetId", () => {
    expect(() => NewWorksheetInputConfigSchema.parse({})).toThrow(
      /spreadsheetId/,
    );
  });

  it("rejects empty spreadsheetId", () => {
    expect(() =>
      NewWorksheetInputConfigSchema.parse({ spreadsheetId: "" }),
    ).toThrow();
  });

  it("rejects unknown fields (.strict())", () => {
    expect(() =>
      NewWorksheetInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        extraField: "anything",
      }),
    ).toThrow();
  });

  it("rejects V1 polling chrome — hasHeaders", () => {
    expect(() =>
      NewWorksheetInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        hasHeaders: true,
      }),
    ).toThrow();
  });

  it("rejects V1 polling chrome — googleSheetsWorksheetSnapshot", () => {
    expect(() =>
      NewWorksheetInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        googleSheetsWorksheetSnapshot: { sheets: [] },
      }),
    ).toThrow();
  });

  it("rejects row_changed-only fields that would be confusing on a new_worksheet trigger", () => {
    expect(() =>
      NewWorksheetInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      }),
    ).toThrow();
    expect(() =>
      NewWorksheetInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        changeKinds: ["added"],
      }),
    ).toThrow();
    expect(() =>
      NewWorksheetInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        keyColumn: "id",
      }),
    ).toThrow();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockChannelsStop.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const baseTrigger = {
  id: "tr-nw-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "google-sheets",
  eventType: "new_worksheet",
  nodeId: "n-nw",
  config: {
    type: "subscription-watch",
    spreadsheetId: "ss-1",
    channelId: "channel-nw",
    resourceId: "res-nw",
    worksheetSnapshot: { names: ["Sheet1"], updatedAt: "" },
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "google-sheets",
  providerAccountId: "alice@example.com",
  displayName: "alice@example.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Sheets new_worksheet deactivate", () => {
  it("calls Drive channels.stop with the stored channelId and resourceId", async () => {
    mockChannelsStop.mockResolvedValueOnce(undefined);

    await deactivate({ trigger: baseTrigger, integration: baseIntegration });

    expect(mockChannelsStop).toHaveBeenCalledTimes(1);
    expect(mockChannelsStop.mock.calls[0]![0]).toEqual({
      accessToken: "tok",
      channelId: "channel-nw",
      resourceId: "res-nw",
    });
  });

  it("swallows NotFoundError (channel already stopped)", async () => {
    mockChannelsStop.mockRejectedValueOnce(
      new NotFoundError("channel channel-nw"),
    );
    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("propagates non-404 errors", async () => {
    mockChannelsStop.mockRejectedValueOnce(new Error("HTTP 503"));
    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("is a no-op when config.type is not subscription-watch", async () => {
    const t = {
      ...baseTrigger,
      config: { ...baseTrigger.config, type: "something-else" },
    };
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockChannelsStop).not.toHaveBeenCalled();
  });

  it("is a no-op when channelId or resourceId is missing", async () => {
    const t = { ...baseTrigger, config: { type: "subscription-watch" } };
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockChannelsStop).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

describe("new_worksheet normalize", () => {
  const baseInput = {
    sheetId: 42,
    worksheetName: "Sheet2",
    index: 1,
    sheetType: "GRID",
    occurredAt: "2026-05-15T12:00:00.000Z",
  };
  const baseContext = {
    providerAccountId: "alice@example.test",
    spreadsheetId: "ss-1",
  };

  it("emits a TriggerEvent with the canonical payload shape", () => {
    const ev = normalize(baseInput, baseContext);
    expect(ev.provider).toBe("google-sheets");
    expect(ev.eventType).toBe("new_worksheet");
    expect(ev.providerAccountId).toBe("alice@example.test");
    expect(ev.occurredAt).toBe("2026-05-15T12:00:00.000Z");
    expect(ev.payload).toEqual({
      changeKind: "added",
      spreadsheetId: "ss-1",
      worksheetId: 42,
      worksheetName: "Sheet2",
      index: 1,
      sheetType: "GRID",
    });
  });

  it("eventId combines spreadsheetId + new_worksheet + sheetId + nameHash", () => {
    const ev = normalize(baseInput, baseContext);
    // Format: ss-1:new_worksheet:42:<12-hex-chars>
    expect(ev.eventId).toMatch(/^ss-1:new_worksheet:42:[0-9a-f]{12}$/);
  });

  it("identical sheets produce identical eventIds (idempotent webhook firings dedup)", () => {
    const a = normalize(baseInput, baseContext);
    const b = normalize(
      { ...baseInput, occurredAt: "2026-05-15T13:00:00.000Z" },
      baseContext,
    );
    expect(a.eventId).toBe(b.eventId);
    expect(a.occurredAt).not.toBe(b.occurredAt);
  });

  it("renamed sheet (same sheetId, different name) produces a DIFFERENT eventId", () => {
    const original = normalize(baseInput, baseContext);
    const renamed = normalize({ ...baseInput, worksheetName: "Renamed" }, baseContext);
    expect(original.eventId).not.toBe(renamed.eventId);
  });

  it("different sheetId produces a different eventId (delete-then-recreate fires fresh)", () => {
    const original = normalize(baseInput, baseContext);
    const recreated = normalize({ ...baseInput, sheetId: 99 }, baseContext);
    expect(original.eventId).not.toBe(recreated.eventId);
  });

  it("different spreadsheetId produces a different eventId", () => {
    const a = normalize(baseInput, baseContext);
    const b = normalize(baseInput, { ...baseContext, spreadsheetId: "ss-2" });
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("tolerates null index + null sheetType in payload", () => {
    const ev = normalize(
      { ...baseInput, index: null, sheetType: null },
      baseContext,
    );
    expect(ev.payload.index).toBeNull();
    expect(ev.payload.sheetType).toBeNull();
  });

  it("supports sheetId=0 (the default first sheet) without falsy-bug regression", () => {
    const ev = normalize({ ...baseInput, sheetId: 0 }, baseContext);
    expect(ev.eventId).toMatch(/^ss-1:new_worksheet:0:[0-9a-f]{12}$/);
    expect(ev.payload.worksheetId).toBe(0);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former pull.test.ts
// ---------------------------------------------------------------------------
describe("pull (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSpreadsheetsGet.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    provider: "google-sheets",
    providerAccountId: "alice@example.com",
  });
});

const baseTrigger = {
  id: "tr-nw-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "google-sheets",
  eventType: "new_worksheet",
  nodeId: "n-nw",
  config: {
    type: "subscription-watch",
    spreadsheetId: "ss-1",
    channelId: "channel-nw",
    worksheetSnapshot: {
      names: ["Sheet1"],
      updatedAt: "2026-05-15T00:00:00.000Z",
    },
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Sheets new_worksheet pull", () => {
  it("emits one event when a new worksheet appears", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1", index: 0, sheetType: "GRID" } },
        { properties: { sheetId: 12, title: "Notes", index: 1, sheetType: "GRID" } },
      ],
    });

    const result = await pull(baseTrigger);

    expect(result.events).toHaveLength(1);
    const ev = result.events[0]!;
    expect(ev.eventType).toBe("new_worksheet");
    expect(ev.payload).toEqual({
      changeKind: "added",
      spreadsheetId: "ss-1",
      worksheetId: 12,
      worksheetName: "Notes",
      index: 1,
      sheetType: "GRID",
    });
    expect(ev.eventId).toMatch(/^ss-1:new_worksheet:12:[0-9a-f]{12}$/);
  });

  it("emits zero events when the worksheet list is unchanged", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
    });

    const result = await pull(baseTrigger);
    expect(result.events).toEqual([]);
  });

  it("emits multiple events when multiple worksheets are added", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { sheetId: 10, title: "A" } },
        { properties: { sheetId: 11, title: "B" } },
        { properties: { sheetId: 12, title: "C" } },
      ],
    });

    const result = await pull(baseTrigger);
    expect(result.events).toHaveLength(3);
    const names = result.events
      .map((e) => (e.payload as { worksheetName: string }).worksheetName)
      .sort();
    expect(names).toEqual(["A", "B", "C"]);
  });

  it("fires for the NEW name when a sheet is renamed (matches V1 + Excel)", async () => {
    // Baseline contained "Sheet1". Sheet renamed to "Renamed". From
    // the diff's perspective: "Sheet1" disappears + "Renamed" appears
    // → ONE event for "Renamed". Stable behavior documented in
    // normalize.ts module comment.
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [{ properties: { sheetId: 0, title: "Renamed", index: 0 } }],
    });

    const result = await pull(baseTrigger);
    expect(result.events).toHaveLength(1);
    expect(
      (result.events[0]!.payload as { worksheetName: string }).worksheetName,
    ).toBe("Renamed");
  });

  it("persists the new worksheet snapshot AFTER successful pull (zero events case)", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
    });

    await pull(baseTrigger);
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [triggerId, newConfig] = mockUpdateConfig.mock.calls[0]!;
    expect(triggerId).toBe("tr-nw-1");
    expect(
      (newConfig as { worksheetSnapshot: { names: string[] } }).worksheetSnapshot.names,
    ).toEqual(["Sheet1"]);
  });

  it("persists the new worksheet snapshot AFTER emitting events", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { sheetId: 10, title: "Tab2" } },
      ],
    });

    await pull(baseTrigger);
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [, newConfig] = mockUpdateConfig.mock.calls[0]!;
    expect(
      (newConfig as { worksheetSnapshot: { names: string[] } }).worksheetSnapshot.names,
    ).toEqual(["Sheet1", "Tab2"]);
  });

  it("propagates persistence failure (does not corrupt prior snapshot)", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { sheetId: 10, title: "Tab2" } },
      ],
    });
    mockUpdateConfig.mockRejectedValueOnce(new Error("DB write failed"));

    await expect(pull(baseTrigger)).rejects.toThrow(/DB write failed/);
    // Only one persist attempt; the trigger row's existing snapshot
    // is unchanged.
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
  });

  it("returns resyncRequired:true when spreadsheetId is missing", async () => {
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, spreadsheetId: undefined },
    };
    const result = await pull(trigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
    expect(mockSpreadsheetsGet).not.toHaveBeenCalled();
  });

  it("returns resyncRequired:true when worksheetSnapshot is missing (activate didn't seed)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, worksheetSnapshot: undefined },
    };
    const result = await pull(trigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
    expect(mockSpreadsheetsGet).not.toHaveBeenCalled();
    const warned = warnSpy.mock.calls
      .flat()
      .find(
        (a) =>
          typeof a === "string" && a.includes("no_worksheet_snapshot"),
      );
    expect(warned).toBeDefined();
    warnSpy.mockRestore();
  });

  it("returns empty result when integration row is missing", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const result = await pull(baseTrigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(false);
    expect(mockSpreadsheetsGet).not.toHaveBeenCalled();
  });

  it("skips sheets missing a sheetId + logs (defensive)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { title: "MalformedNew" } }, // no sheetId
      ],
    });

    const result = await pull(baseTrigger);
    // MalformedNew would be "new" but is skipped → zero events.
    expect(result.events).toEqual([]);
    const warned = warnSpy.mock.calls
      .flat()
      .find(
        (a) =>
          typeof a === "string" && a.includes("missing_sheet_id"),
      );
    expect(warned).toBeDefined();
    warnSpy.mockRestore();
  });

  it("identical webhook fires produce identical eventIds (dedup at dispatcher)", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { sheetId: 12, title: "NewSheet" } },
      ],
    });
    const r1 = await pull(baseTrigger);
    expect(r1.events).toHaveLength(1);
    const id1 = r1.events[0]!.eventId;

    // Simulate "snapshot didn't advance in DB yet" — second pull
    // with the same baseline.
    mockUpdateConfig.mockReset();
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { sheetId: 12, title: "NewSheet" } },
      ],
    });
    const r2 = await pull(baseTrigger);
    expect(r2.events).toHaveLength(1);
    expect(r2.events[0]!.eventId).toBe(id1);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former renew.test.ts
// ---------------------------------------------------------------------------
describe("renew (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockFilesWatch.mockReset();
  mockChannelsStop.mockReset();
  mockBuildChannelToken.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();

  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockBuildChannelToken.mockReturnValue("hmac-new");
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    provider: "google-sheets",
    providerAccountId: "alice@example.com",
  });
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

const baseTrigger = {
  id: "tr-nw-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "google-sheets",
  eventType: "new_worksheet",
  nodeId: "node-trigger-nw",
  config: {
    type: "subscription-watch",
    spreadsheetId: "ss-1",
    channelId: "channel-old",
    resourceId: "res-old",
    pageToken: "page-keep",
    worksheetSnapshot: {
      names: ["Sheet1", "Sheet2"],
      updatedAt: "2026-05-15T00:00:00.000Z",
    },
    expiresAt: "2026-05-15T00:00:00Z",
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("sheetsNewWorksheetSubscriptionHandler", () => {
  it("canHandle accepts a Sheets new_worksheet subscription-watch row", () => {
    expect(
      sheetsNewWorksheetSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);
  });

  it("canHandle rejects rows from other providers", () => {
    expect(
      sheetsNewWorksheetSubscriptionHandler.canHandle({
        ...baseTrigger,
        provider: "google-drive",
      }),
    ).toBe(false);
  });

  it("canHandle rejects subscription-watch rows of different eventType (no cross-talk with row_changed)", () => {
    expect(
      sheetsNewWorksheetSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "row_changed",
      }),
    ).toBe(false);
  });

  it("getRenewalThresholdMs returns 24h (matches row_changed)", () => {
    expect(sheetsNewWorksheetSubscriptionHandler.getRenewalThresholdMs()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("renew rotates channel + preserves worksheetSnapshot baseline untouched", async () => {
    mockFilesWatch.mockResolvedValueOnce({
      id: "channel-new",
      resourceId: "res-new",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockChannelsStop.mockResolvedValueOnce(undefined);

    await sheetsNewWorksheetSubscriptionHandler.renew({ trigger: baseTrigger });

    // Watch first, against the same spreadsheetId.
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("ss-1");
    expect(mockFilesWatch.mock.calls[0]![0].channelToken).toBe("hmac-new");

    // Stop old.
    expect(mockChannelsStop).toHaveBeenCalledTimes(1);
    expect(mockChannelsStop.mock.calls[0]![0]).toEqual({
      accessToken: "tok",
      channelId: "channel-old",
      resourceId: "res-old",
    });

    // Persist: worksheetSnapshot + pageToken untouched, channelId rotated.
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [id, persisted] = mockUpdateConfig.mock.calls[0]!;
    expect(id).toBe("tr-nw-1");
    const cfg = persisted as Record<string, unknown>;
    expect(cfg.pageToken).toBe("page-keep");
    expect(cfg.worksheetSnapshot).toEqual({
      names: ["Sheet1", "Sheet2"],
      updatedAt: "2026-05-15T00:00:00.000Z",
    });
    expect(cfg.resourceId).toBe("res-new");
    expect(cfg.channelId).not.toBe("channel-old");
  });

  it("swallows old-channel NotFoundError and still persists", async () => {
    mockFilesWatch.mockResolvedValueOnce({
      id: "channel-new",
      resourceId: "res-new",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockChannelsStop.mockRejectedValueOnce(new NotFoundError("channel-old"));

    await expect(
      sheetsNewWorksheetSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).resolves.toBeUndefined();
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
  });

  it("logs (does not rethrow) other old-channel errors and still persists", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });
    mockChannelsStop.mockRejectedValueOnce(new Error("HTTP 500"));

    await expect(
      sheetsNewWorksheetSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).resolves.toBeUndefined();
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("throws when integration row is missing", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      sheetsNewWorksheetSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/no active integration/);
  });

  it("throws when config is missing spreadsheetId", async () => {
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, spreadsheetId: undefined },
    };
    await expect(
      sheetsNewWorksheetSubscriptionHandler.renew({ trigger }),
    ).rejects.toThrow(/spreadsheetId/);
  });
});

});
