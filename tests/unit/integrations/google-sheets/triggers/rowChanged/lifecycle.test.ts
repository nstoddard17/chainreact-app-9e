/**
 * @jest-environment node
 *
 * google-sheets/triggers/rowChanged trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockValuesGet = jest.fn();
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

jest.mock("@/integrations/google-sheets/api/valuesGet", () => ({
  valuesGet: (...args: unknown[]) => mockValuesGet(...args),
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
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { RowChangedInputConfigSchema, requiresExtendedSnapshot, SNAPSHOT_ROW_LIMIT_DEFAULT, SNAPSHOT_ROW_LIMIT_MAX, SNAPSHOT_ROW_LIMIT_MIN } from "@/integrations/google-sheets/triggers/rowChanged/schema";
import { activate } from "@/integrations/google-sheets/triggers/rowChanged/activate";
import { NotFoundError } from "@/integrations/google-drive/api/errors";
import { deactivate } from "@/integrations/google-sheets/triggers/rowChanged/deactivate";
import { normalize } from "@/integrations/google-sheets/triggers/rowChanged/normalize";
import { pull } from "@/integrations/google-sheets/triggers/rowChanged/pull";
import { sheetsRowChangedSubscriptionHandler } from "@/integrations/google-sheets/triggers/rowChanged/renew";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

interface ActivateSnapshot {
  rowHashes: Record<string, string>;
  rowCount: number;
  windowStart: number;
  windowEnd: number;
  keyMode: "positional" | "keyColumn";
  keyColumn: string | null;
  updatedAt: string;
}
function snapshotOf(result: Record<string, unknown>): ActivateSnapshot {
  return result.snapshot as ActivateSnapshot;
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockValuesGet.mockReset();
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
  id: "node-trigger",
  kind: "trigger" as const,
  provider: "google-sheets",
  type: "row_changed",
  config: { spreadsheetId: "ss-1", sheetName: "Sheet1" },
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

describe("Sheets row_changed activate", () => {
  it("snapshots row count, then registers the file-watch", async () => {
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["a", "b", "c"],
        ["d", "e", "f"],
        ["g", "h", "i"],
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

    const result = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    // values.get called against the configured sheet's A:Z range.
    expect(mockValuesGet).toHaveBeenCalledTimes(1);
    expect(mockValuesGet.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        spreadsheetId: "ss-1",
        range: "Sheet1!A:Z",
      }),
    );
    // Drive baseline cursor captured exactly once.
    // files.watch called against the spreadsheet's fileId.
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("ss-1");

    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      spreadsheetId: "ss-1",
      sheetName: "Sheet1",
      headerRow: false,
      resourceId: "res-id",
      lastRowCount: 3,
    });
    expect(result.channelId).toMatch(
      /^chainreact-node-trigger-[0-9a-f-]+$/,
    );
    expect(typeof result.expiresAt).toBe("string");
  });

  it("captures lastRowCount = 0 for an empty sheet (no values returned)", async () => {
    mockValuesGet.mockResolvedValueOnce({}); // no `values` field
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    const result = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(result.lastRowCount).toBe(0);
  });

  it("forwards headerRow=true into the persisted config", async () => {
    mockValuesGet.mockResolvedValueOnce({ values: [["h1", "h2"], ["a", "b"]] });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });

    const result = await activate({
      node: { ...baseNode, config: { ...baseNode.config, headerRow: true } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.headerRow).toBe(true);
    expect(result.lastRowCount).toBe(2);
  });

  it("passes HMAC channelToken on the watch request", async () => {
    mockBuildChannelToken.mockReturnValueOnce("the-real-hmac");
    mockValuesGet.mockResolvedValueOnce({ values: [] });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    mockValuesGet.mockResolvedValueOnce({ values: [["a"], ["b"]] });
    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockFilesWatch.mock.calls[0]![0].channelToken).toBe("the-real-hmac");
  });

  it("uses NEXT_PUBLIC_APP_URL for the webhook address", async () => {
    mockValuesGet.mockResolvedValueOnce({ values: [] });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockFilesWatch.mock.calls[0]![0].webhookAddress).toBe(
      "https://app.example.test/api/webhooks/google-sheets",
    );
  });

  it("throws when spreadsheetId is missing (Slice 5 requires it)", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { sheetName: "Sheet1" } },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/spreadsheetId/);
  });

  it("throws when sheetName is missing (Slice 5 Batch 1 narrowing)", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { spreadsheetId: "ss-1" } },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/sheetName/);
  });

  it("makes NO account-wide Drive changes call during activation (GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2)", async () => {
    // The old activation fetched a changes.getStartPageToken cursor and
    // persisted it, but nothing ever read it — write-only dead state, and an
    // account-wide Drive call this provider no longer has a broad scope for.
    // Activation must now touch only the explicitly selected spreadsheet.
    mockValuesGet.mockResolvedValueOnce({ values: [["a"], ["b"]] });
    mockFilesWatch.mockResolvedValueOnce({
      id: "channel-from-google",
      resourceId: "res-id",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
    expect(mockChangesGetStartPageToken).not.toHaveBeenCalled();
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
  });

  // ──────────────────────────────────────────────────────────────────
  // Sheets 2.3 Commit 2 — bounded snapshot seeding + overflow rejection.
  // ──────────────────────────────────────────────────────────────────
  describe("Sheets 2.3 — extended changeKinds", () => {
    it("defaults to changeKinds=['added'] and OMITS the snapshot field (backwards-compat)", async () => {
      mockValuesGet.mockResolvedValueOnce({
        values: [["a"], ["b"], ["c"]],
      });
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

      // Backwards-compat: existing added-only rows have no snapshot field.
      expect(result.snapshot).toBeUndefined();
      expect(result.changeKinds).toEqual(["added"]);
      expect(result.snapshotRowLimit).toBe(1000);
      expect(result.keyColumn).toBeNull();
      expect(result.lastRowCount).toBe(3);
    });

    it("seeds a positional bounded snapshot when changeKinds includes 'updated'", async () => {
      mockValuesGet.mockResolvedValueOnce({
        values: [
          ["alice", 30],
          ["bob", 25],
        ],
      });
      mockChangesGetStartPageToken.mockResolvedValueOnce({
        startPageToken: "p",
      });
      mockFilesWatch.mockResolvedValueOnce({
        id: "c",
        resourceId: "r",
        expiration: String(Date.now() + 1000),
      });

      const result = await activate({
        node: {
          ...baseNode,
          config: {
            ...baseNode.config,
            changeKinds: ["added", "updated"],
          },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      });

      expect(result.changeKinds).toEqual(["added", "updated"]);
      expect(result.snapshot).toBeDefined();
      const snap = snapshotOf(result);
      expect(snap.keyMode).toBe("positional");
      expect(snap.keyColumn).toBeNull();
      expect(snap.rowCount).toBe(2);
      expect(snap.windowStart).toBe(1);
      expect(snap.windowEnd).toBe(2);
      expect(Object.keys(snap.rowHashes).sort()).toEqual(["1", "2"]);
    });

    it("seeds a positional bounded snapshot when changeKinds includes 'removed'", async () => {
      mockValuesGet.mockResolvedValueOnce({
        values: [["only-row"]],
      });
      mockChangesGetStartPageToken.mockResolvedValueOnce({
        startPageToken: "p",
      });
      mockFilesWatch.mockResolvedValueOnce({
        id: "c",
        resourceId: "r",
        expiration: String(Date.now() + 1000),
      });

      const result = await activate({
        node: {
          ...baseNode,
          config: {
            ...baseNode.config,
            changeKinds: ["removed"],
          },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      });

      expect(result.snapshot).toBeDefined();
      const snap = snapshotOf(result);
      expect(snap.keyMode).toBe("positional");
      expect(snap.rowCount).toBe(1);
    });

    it("seeds a keyColumn bounded snapshot when keyColumn + headerRow=true", async () => {
      mockValuesGet.mockResolvedValueOnce({
        values: [
          ["id", "Name"],
          ["a1", "alice"],
          ["b2", "bob"],
        ],
      });
      mockChangesGetStartPageToken.mockResolvedValueOnce({
        startPageToken: "p",
      });
      mockFilesWatch.mockResolvedValueOnce({
        id: "c",
        resourceId: "r",
        expiration: String(Date.now() + 1000),
      });

      const result = await activate({
        node: {
          ...baseNode,
          config: {
            ...baseNode.config,
            headerRow: true,
            changeKinds: ["added", "updated", "removed"],
            keyColumn: "id",
          },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      });

      expect(result.snapshot).toBeDefined();
      const snap = snapshotOf(result);
      expect(snap.keyMode).toBe("keyColumn");
      expect(snap.keyColumn).toBe("id");
      expect(Object.keys(snap.rowHashes).sort()).toEqual(["a1", "b2"]);
    });

    it("STRICT REJECTS overflow at activate time (does NOT silently truncate)", async () => {
      // 2,500 data rows × snapshotRowLimit=1000 → 2,500 > 2,000 → overflow.
      const rows = Array.from({ length: 2500 }, (_, i) => [`v${i}`]);
      mockValuesGet.mockResolvedValueOnce({ values: rows });
      mockChangesGetStartPageToken.mockResolvedValueOnce({
        startPageToken: "p",
      });
      mockFilesWatch.mockResolvedValueOnce({
        id: "c",
        resourceId: "r",
        expiration: String(Date.now() + 1000),
      });

      await expect(
        activate({
          node: {
            ...baseNode,
            config: {
              ...baseNode.config,
              changeKinds: ["added", "updated"],
            },
          },
          integration: baseIntegration,
          workflowId: "wf-test",
        }),
      ).rejects.toThrow(/snapshotRowLimit/);

      // Critical: files.watch was NOT called — activation aborted BEFORE
      // creating the provider-side resource. No orphaned channels.
      expect(mockFilesWatch).not.toHaveBeenCalled();
    });

    it("does NOT seed a snapshot when overflow would occur AND changeKinds=['added'] (fast path is exempt)", async () => {
      // 100k rows: would overflow ANY reasonable cap. But changeKinds
      // defaults to ['added'] so no snapshot is built → no overflow check.
      const rows = Array.from({ length: 100_000 }, (_, i) => [i]);
      mockValuesGet.mockResolvedValueOnce({ values: rows });
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

      expect(result.snapshot).toBeUndefined();
      expect(result.lastRowCount).toBe(100_000);
      // files.watch DID get called — the fast path allows this.
      expect(mockFilesWatch).toHaveBeenCalledTimes(1);
    });

    it("rejects unknown V1 polling chrome field at parse time", async () => {
      await expect(
        activate({
          node: {
            ...baseNode,
            config: {
              ...baseNode.config,
              // V1 polling field — NOT ported.
              hasHeaders: true,
            },
          },
          integration: baseIntegration,
          workflowId: "wf-test",
        }),
      ).rejects.toThrow();

      expect(mockValuesGet).not.toHaveBeenCalled();
    });

    it("rejects keyColumn without headerRow=true (.refine guard)", async () => {
      await expect(
        activate({
          node: {
            ...baseNode,
            config: {
              ...baseNode.config,
              keyColumn: "id",
              // headerRow defaults to false
            },
          },
          integration: baseIntegration,
          workflowId: "wf-test",
        }),
      ).rejects.toThrow(/keyColumn requires headerRow/);

      expect(mockValuesGet).not.toHaveBeenCalled();
    });

    it("rejects keyColumn that isn't in the header row", async () => {
      mockValuesGet.mockResolvedValueOnce({
        values: [
          ["Name", "Age"],
          ["alice", 30],
        ],
      });

      await expect(
        activate({
          node: {
            ...baseNode,
            config: {
              ...baseNode.config,
              headerRow: true,
              changeKinds: ["added", "updated"],
              keyColumn: "id", // not in header row
            },
          },
          integration: baseIntegration,
          workflowId: "wf-test",
        }),
      ).rejects.toThrow(/keyColumn/);

      // files.watch NOT called — failed before provider-side resource.
      expect(mockFilesWatch).not.toHaveBeenCalled();
    });

    it("forwards snapshotRowLimit verbatim into the persisted config", async () => {
      mockValuesGet.mockResolvedValueOnce({ values: [] });
      mockChangesGetStartPageToken.mockResolvedValueOnce({
        startPageToken: "p",
      });
      mockFilesWatch.mockResolvedValueOnce({
        id: "c",
        resourceId: "r",
        expiration: String(Date.now() + 1000),
      });

      const result = await activate({
        node: {
          ...baseNode,
          config: {
            ...baseNode.config,
            changeKinds: ["added", "updated"],
            snapshotRowLimit: 500,
          },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      });

      expect(result.snapshotRowLimit).toBe(500);
    });
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// ---------------------------------------------------------------------------

describe("RowChangedInputConfigSchema", () => {
  describe("backwards-compat — Slice 5 minimal shape", () => {
    it("accepts the minimal Slice 5 config (spreadsheetId + sheetName)", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      });
      expect(result).toEqual({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        headerRow: false,
        changeKinds: ["added"],
        snapshotRowLimit: SNAPSHOT_ROW_LIMIT_DEFAULT,
        keyColumn: null,
      });
    });

    it("defaults headerRow to false", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      });
      expect(result.headerRow).toBe(false);
    });

    it("defaults changeKinds to ['added'] — preserves Slice 5 fast path", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      });
      expect(result.changeKinds).toEqual(["added"]);
    });

    it("defaults snapshotRowLimit to 1000", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      });
      expect(result.snapshotRowLimit).toBe(1000);
      expect(SNAPSHOT_ROW_LIMIT_DEFAULT).toBe(1000);
    });

    it("defaults keyColumn to null", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      });
      expect(result.keyColumn).toBeNull();
    });
  });

  describe("required fields", () => {
    it("rejects missing spreadsheetId", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({ sheetName: "Sheet1" }),
      ).toThrow(/spreadsheetId/);
    });

    it("rejects missing sheetName", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({ spreadsheetId: "ss-1" }),
      ).toThrow(/sheetName/);
    });

    it("rejects empty spreadsheetId", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "",
          sheetName: "Sheet1",
        }),
      ).toThrow();
    });

    it("rejects empty sheetName", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "",
        }),
      ).toThrow();
    });
  });

  describe("changeKinds", () => {
    it("accepts ['added']", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["added"],
      });
      expect(result.changeKinds).toEqual(["added"]);
    });

    it("accepts ['updated']", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["updated"],
      });
      expect(result.changeKinds).toEqual(["updated"]);
    });

    it("accepts ['removed']", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["removed"],
      });
      expect(result.changeKinds).toEqual(["removed"]);
    });

    it("accepts all three combined", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["added", "updated", "removed"],
      });
      expect(result.changeKinds).toEqual(["added", "updated", "removed"]);
    });

    it("rejects empty changeKinds array", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          changeKinds: [],
        }),
      ).toThrow(/at least one/);
    });

    it("rejects unknown changeKind values", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          changeKinds: ["modified"],
        }),
      ).toThrow();
    });

    it("rejects duplicate changeKind entries", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          changeKinds: ["added", "added"],
        }),
      ).toThrow(/duplicate/i);
    });
  });

  describe("snapshotRowLimit", () => {
    it("accepts the minimum (100)", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        snapshotRowLimit: SNAPSHOT_ROW_LIMIT_MIN,
      });
      expect(result.snapshotRowLimit).toBe(100);
    });

    it("accepts the maximum (10000)", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        snapshotRowLimit: SNAPSHOT_ROW_LIMIT_MAX,
      });
      expect(result.snapshotRowLimit).toBe(10000);
    });

    it("rejects below the minimum (99)", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          snapshotRowLimit: 99,
        }),
      ).toThrow(/100/);
    });

    it("rejects above the maximum (10001)", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          snapshotRowLimit: 10001,
        }),
      ).toThrow(/10000/);
    });

    it("rejects non-integer", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          snapshotRowLimit: 1000.5,
        }),
      ).toThrow();
    });

    it("rejects negative values", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          snapshotRowLimit: -1,
        }),
      ).toThrow();
    });
  });

  describe("keyColumn", () => {
    it("accepts a non-empty string with headerRow=true", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        headerRow: true,
        keyColumn: "id",
      });
      expect(result.keyColumn).toBe("id");
    });

    it("accepts null (positional mode default)", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        keyColumn: null,
      });
      expect(result.keyColumn).toBeNull();
    });

    it("rejects empty string", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          headerRow: true,
          keyColumn: "",
        }),
      ).toThrow();
    });

    it("rejects keyColumn without headerRow=true", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          keyColumn: "id",
          // headerRow defaults to false
        }),
      ).toThrow(/keyColumn requires headerRow/);
    });

    it("rejects keyColumn when headerRow is explicitly false", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          headerRow: false,
          keyColumn: "id",
        }),
      ).toThrow(/keyColumn requires headerRow/);
    });
  });

  describe("strict mode — V1 / builder chrome rejection", () => {
    it("rejects V1 polling chrome: hasHeaders", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          hasHeaders: true,
        }),
      ).toThrow();
    });

    it("rejects V1 polling chrome: skipEmptyRows", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          skipEmptyRows: true,
        }),
      ).toThrow();
    });

    it("rejects V1 polling chrome: requiredColumns", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          requiredColumns: ["A", "B"],
        }),
      ).toThrow();
    });

    it("rejects V1 polling chrome: googleSheetsRowSnapshot", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          googleSheetsRowSnapshot: { rowHashes: {}, rowCount: 0 },
        }),
      ).toThrow();
    });

    it("rejects builder chrome: arbitrary unknown field", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          extraField: "anything",
        }),
      ).toThrow();
    });
  });

  describe("requiresExtendedSnapshot", () => {
    it("returns false for changeKinds=['added']", () => {
      const config = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      });
      expect(requiresExtendedSnapshot(config)).toBe(false);
    });

    it("returns true when 'updated' is included", () => {
      const config = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["added", "updated"],
      });
      expect(requiresExtendedSnapshot(config)).toBe(true);
    });

    it("returns true when 'removed' is included", () => {
      const config = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["added", "removed"],
      });
      expect(requiresExtendedSnapshot(config)).toBe(true);
    });

    it("returns true when both 'updated' and 'removed' are included", () => {
      const config = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["updated", "removed"],
      });
      expect(requiresExtendedSnapshot(config)).toBe(true);
    });
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
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "google-sheets",
  eventType: "row_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    spreadsheetId: "ss-1",
    sheetName: "Sheet1",
    channelId: "channel-1",
    resourceId: "res-1",
    lastRowCount: 5,
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

describe("Sheets row_changed deactivate", () => {
  it("calls Drive channels.stop with the stored channelId and resourceId", async () => {
    mockChannelsStop.mockResolvedValueOnce(undefined);

    await deactivate({ trigger: baseTrigger, integration: baseIntegration });

    expect(mockChannelsStop).toHaveBeenCalledTimes(1);
    expect(mockChannelsStop.mock.calls[0]![0]).toEqual({
      accessToken: "tok",
      channelId: "channel-1",
      resourceId: "res-1",
    });
  });

  it("swallows NotFoundError (channel already stopped)", async () => {
    mockChannelsStop.mockRejectedValueOnce(new NotFoundError("channel channel-1"));

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("propagates non-404 errors so lifecycle.ts can log them", async () => {
    mockChannelsStop.mockRejectedValueOnce(new Error("HTTP 503"));

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("is a no-op when config.type is not subscription-watch", async () => {
    const t = { ...baseTrigger, config: { ...baseTrigger.config, type: "something-else" } };
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

describe("normalize", () => {
  const baseContext = {
    providerAccountId: "alice@example.test",
    spreadsheetId: "ss-1",
    sheetName: "Sheet1",
    headers: null,
  };

  it("emits a TriggerEvent with the canonical payload shape", () => {
    const ev = normalize(
      {
        rowIndex: 5,
        rowValues: ["alice", "alice@e.test", 42],
        occurredAt: "2026-05-08T12:00:00Z",
      },
      baseContext,
    );

    expect(ev.provider).toBe("google-sheets");
    expect(ev.eventType).toBe("row_changed");
    expect(ev.occurredAt).toBe("2026-05-08T12:00:00Z");
    expect(ev.providerAccountId).toBe("alice@example.test");
    expect(ev.payload).toMatchObject({
      changeKind: "added",
      spreadsheetId: "ss-1",
      sheetName: "Sheet1",
      rowIndex: 5,
      rowValues: ["alice", "alice@e.test", 42],
      headers: null,
    });
  });

  it("eventId combines spreadsheetId + sheetName + rowIndex + value-hash", () => {
    const ev = normalize(
      { rowIndex: 5, rowValues: ["x"], occurredAt: "t" },
      baseContext,
    );
    // Format: ss-1:Sheet1:5:<12-hex-chars>
    expect(ev.eventId).toMatch(/^ss-1:Sheet1:5:[0-9a-f]{12}$/);
  });

  it("identical rows at the same index produce identical eventIds (duplicate-collapse)", () => {
    const a = normalize(
      { rowIndex: 5, rowValues: ["x", 1], occurredAt: "t1" },
      baseContext,
    );
    const b = normalize(
      { rowIndex: 5, rowValues: ["x", 1], occurredAt: "t2" }, // different timestamp
      baseContext,
    );
    expect(a.eventId).toBe(b.eventId);
    // occurredAt differs but eventId is timestamp-independent — that's
    // the point of dedup at the dispatcher.
    expect(a.occurredAt).not.toBe(b.occurredAt);
  });

  it("different values at the same index produce different eventIds (overwrite-as-fresh)", () => {
    const a = normalize(
      { rowIndex: 5, rowValues: ["alice"], occurredAt: "t" },
      baseContext,
    );
    const b = normalize(
      { rowIndex: 5, rowValues: ["bob"], occurredAt: "t" },
      baseContext,
    );
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("different rowIndex produces different eventIds (every row distinct)", () => {
    const a = normalize(
      { rowIndex: 5, rowValues: ["x"], occurredAt: "t" },
      baseContext,
    );
    const b = normalize(
      { rowIndex: 6, rowValues: ["x"], occurredAt: "t" },
      baseContext,
    );
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("different sheets produce different eventIds even with same row+values", () => {
    const a = normalize(
      { rowIndex: 5, rowValues: ["x"], occurredAt: "t" },
      { ...baseContext, sheetName: "Sheet1" },
    );
    const b = normalize(
      { rowIndex: 5, rowValues: ["x"], occurredAt: "t" },
      { ...baseContext, sheetName: "Sheet2" },
    );
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("surfaces headers when context provides them", () => {
    const ev = normalize(
      { rowIndex: 5, rowValues: ["alice", "a@e"], occurredAt: "t" },
      { ...baseContext, headers: ["Name", "Email"] },
    );
    expect(ev.payload.headers).toEqual(["Name", "Email"]);
  });

  describe("Sheets 2.3 — extended changeKind variants", () => {
    const ctxPositional = {
      providerAccountId: "alice@example.test",
      spreadsheetId: "ss-1",
      sheetName: "Sheet1",
      headers: null,
      keyColumn: null,
    };
    const ctxKeyColumn = {
      ...ctxPositional,
      keyColumn: "id",
    };

    it("emits changeKind: 'updated' when called with 'updated'", () => {
      const ev = normalize(
        {
          rowIndex: 5,
          rowValues: ["alice", "updated"],
          rowKey: "5",
          rowHash: "a".repeat(64),
          occurredAt: "t",
        },
        ctxPositional,
        "updated",
        { useLegacyEventId: false },
      );
      expect(ev.payload.changeKind).toBe("updated");
      expect(ev.payload.rowValues).toEqual(["alice", "updated"]);
    });

    it("emits changeKind: 'removed' with null rowIndex + null rowValues", () => {
      const ev = normalize(
        {
          rowIndex: null,
          rowValues: null,
          rowKey: "5",
          rowHash: "b".repeat(64),
          occurredAt: "t",
        },
        ctxPositional,
        "removed",
        { useLegacyEventId: false },
      );
      expect(ev.payload.changeKind).toBe("removed");
      expect(ev.payload.rowIndex).toBeNull();
      expect(ev.payload.rowValues).toBeNull();
    });

    it("extended eventId includes the changeKind infix", () => {
      const ev = normalize(
        {
          rowIndex: 5,
          rowValues: ["x"],
          rowKey: "5",
          rowHash: "c".repeat(64),
          occurredAt: "t",
        },
        ctxPositional,
        "updated",
        { useLegacyEventId: false },
      );
      // Format: ss-1:Sheet1:updated:5:<12-hex>
      expect(ev.eventId).toBe("ss-1:Sheet1:updated:5:cccccccccccc");
    });

    it("extended eventId for 'added' DIFFERS from legacy 'added' eventId (D-EventId)", () => {
      const legacy = normalize(
        { rowIndex: 5, rowValues: ["x"], occurredAt: "t" },
        ctxPositional,
      );
      const extended = normalize(
        {
          rowIndex: 5,
          rowValues: ["x"],
          rowKey: "5",
          rowHash: createHashLocal(["x"]),
          occurredAt: "t",
        },
        ctxPositional,
        "added",
        { useLegacyEventId: false },
      );
      // Legacy: ss-1:Sheet1:5:<hash>. Extended: ss-1:Sheet1:added:5:<hash>.
      // The infix prevents collision between the legacy added-only
      // dedup space and the extended added/updated/removed space.
      expect(legacy.eventId).not.toBe(extended.eventId);
      expect(extended.eventId).toContain(":added:");
    });

    it("added/updated/removed eventIds for the same key are distinct (dedup safe)", () => {
      const added = normalize(
        {
          rowIndex: 5,
          rowValues: ["x"],
          rowKey: "5",
          rowHash: createHashLocal(["x"]),
          occurredAt: "t",
        },
        ctxPositional,
        "added",
        { useLegacyEventId: false },
      );
      const updated = normalize(
        {
          rowIndex: 5,
          rowValues: ["x"],
          rowKey: "5",
          rowHash: createHashLocal(["x"]),
          occurredAt: "t",
        },
        ctxPositional,
        "updated",
        { useLegacyEventId: false },
      );
      const removed = normalize(
        {
          rowIndex: null,
          rowValues: null,
          rowKey: "5",
          rowHash: createHashLocal(["x"]),
          occurredAt: "t",
        },
        ctxPositional,
        "removed",
        { useLegacyEventId: false },
      );
      expect(added.eventId).not.toBe(updated.eventId);
      expect(added.eventId).not.toBe(removed.eventId);
      expect(updated.eventId).not.toBe(removed.eventId);
    });

    it("keyColumn mode populates keyColumn + keyValue in payload", () => {
      const ev = normalize(
        {
          rowIndex: 5,
          rowValues: ["a1", "alice"],
          rowKey: "a1",
          rowHash: "d".repeat(64),
          occurredAt: "t",
        },
        ctxKeyColumn,
        "updated",
        { useLegacyEventId: false },
      );
      expect(ev.payload.keyColumn).toBe("id");
      expect(ev.payload.keyValue).toBe("a1");
      expect(ev.payload.rowKey).toBe("a1");
    });

    it("positional mode emits keyColumn=null + keyValue=null", () => {
      const ev = normalize(
        {
          rowIndex: 5,
          rowValues: ["x"],
          rowKey: "5",
          rowHash: "e".repeat(64),
          occurredAt: "t",
        },
        ctxPositional,
        "updated",
        { useLegacyEventId: false },
      );
      expect(ev.payload.keyColumn).toBeNull();
      expect(ev.payload.keyValue).toBeNull();
      expect(ev.payload.rowKey).toBe("5");
    });

    it("previousValues is ALWAYS null (D-PreviousValues)", () => {
      for (const kind of ["added", "updated", "removed"] as const) {
        const ev = normalize(
          {
            rowIndex: kind === "removed" ? null : 5,
            rowValues: kind === "removed" ? null : ["x"],
            rowKey: "5",
            rowHash: "f".repeat(64),
            occurredAt: "t",
          },
          ctxPositional,
          kind,
          { useLegacyEventId: false },
        );
        expect(ev.payload.previousValues).toBeNull();
      }
    });

    it("throws when removed event has null rowValues + no rowHash (hash required)", () => {
      expect(() =>
        normalize(
          {
            rowIndex: null,
            rowValues: null,
            rowKey: "5",
            // No rowHash provided.
            occurredAt: "t",
          },
          ctxPositional,
          "removed",
          { useLegacyEventId: false },
        ),
      ).toThrow(/rowHash/);
    });

    it("uses the same hash function as snapshot.hashRow (dedup alignment)", () => {
      // Build an eventId manually using the same algorithm as the
      // snapshot helper, and verify normalize produces the same one.
      const values = ["alice", 30];
      const fullHash = createHashLocal(values);
      const shortHash = fullHash.slice(0, 12);
      const ev = normalize(
        {
          rowIndex: 5,
          rowValues: values,
          rowKey: "5",
          rowHash: fullHash,
          occurredAt: "t",
        },
        ctxPositional,
        "added",
        { useLegacyEventId: false },
      );
      expect(ev.eventId).toBe(`ss-1:Sheet1:added:5:${shortHash}`);
    });
  });
});

// Local mirror of the snapshot helper's hash so the test stays
// self-contained but pins the algorithm.
function createHashLocal(values: ReadonlyArray<unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

});

// ---------------------------------------------------------------------------
// Merged from the former pull.test.ts
// ---------------------------------------------------------------------------
describe("pull (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockValuesGet.mockReset();
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
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "google-sheets",
  eventType: "row_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    spreadsheetId: "ss-1",
    sheetName: "Sheet1",
    headerRow: false,
    lastRowCount: 3,
    channelId: "channel-1",
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Sheets row_changed pull", () => {
  it("emits one TriggerEvent per newly added row when count grew", async () => {
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["a", "b"],
        ["c", "d"],
        ["e", "f"],
        ["g", "h"], // row 4 — new
        ["i", "j"], // row 5 — new
      ],
    });

    const result = await pull(baseTrigger);

    expect(mockValuesGet).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        spreadsheetId: "ss-1",
        range: "Sheet1!A:Z",
      }),
    );
    expect(result.events).toHaveLength(2);
    expect(result.events[0]!.payload).toMatchObject({
      changeKind: "added",
      spreadsheetId: "ss-1",
      sheetName: "Sheet1",
      rowIndex: 4,
      rowValues: ["g", "h"],
      headers: null,
    });
    expect(result.events[1]!.payload).toMatchObject({
      rowIndex: 5,
      rowValues: ["i", "j"],
    });
    expect(result.resyncRequired).toBe(false);

    // lastRowCount advances to the new total.
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      "tr-1",
      expect.objectContaining({ lastRowCount: 5 }),
    );
  });

  it("emits zero events when row count is unchanged AND does not persist", async () => {
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["a", "b"],
        ["c", "d"],
        ["e", "f"],
      ],
    });

    const result = await pull(baseTrigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(false);
    // No change → no persist (avoids no-op writes).
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it("emits zero events when row count decreased BUT still updates the snapshot down", async () => {
    // Going from 3 → 1 means rows were deleted. Slice 5 Batch 1 doesn't
    // emit "removed" events, BUT the stored snapshot must update down so
    // a subsequent re-add fires correctly.
    const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    mockValuesGet.mockResolvedValueOnce({ values: [["a"]] });

    const result = await pull(baseTrigger);

    expect(result.events).toEqual([]);
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      "tr-1",
      expect.objectContaining({ lastRowCount: 1 }),
    );
    debugSpy.mockRestore();
  });

  it("when headerRow=true, surfaces values[0] as `headers` in each event", async () => {
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, headerRow: true },
    };
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["Name", "Email"], // header row (row 1)
        ["alice", "a@e"], // row 2
        ["bob", "b@e"], // row 3
        ["charlie", "c@e"], // row 4 — new
      ],
    });

    const result = await pull(trigger);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.payload.headers).toEqual(["Name", "Email"]);
    expect(result.events[0]!.payload.rowIndex).toBe(4);
    expect(result.events[0]!.payload.rowValues).toEqual(["charlie", "c@e"]);
  });

  it("returns resyncRequired:true when lastRowCount is missing from config", async () => {
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, lastRowCount: undefined },
    };
    const result = await pull(trigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
    expect(mockValuesGet).not.toHaveBeenCalled();
  });

  it("returns resyncRequired:true when spreadsheetId or sheetName missing", async () => {
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, sheetName: undefined },
    };
    const result = await pull(trigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
  });

  it("returns empty result when integration row is missing", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const result = await pull(baseTrigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(false);
    expect(mockValuesGet).not.toHaveBeenCalled();
  });

  it("emits stable eventId so duplicate notifications dedup at the dispatcher", async () => {
    // Two pulls, same delta — should produce events with identical eventIds
    // for the dispatcher's webhook_event_dedup lookup.
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["a"],
        ["b"],
        ["c"],
        ["d"], // row 4 — new
      ],
    });

    const r1 = await pull(baseTrigger);
    expect(r1.events).toHaveLength(1);
    const eventId1 = r1.events[0]!.eventId;

    // Reset mocks for the second call. Simulate "lastRowCount didn't
    // advance in DB yet" (race condition on duplicate notification).
    mockUpdateConfig.mockReset();
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["a"],
        ["b"],
        ["c"],
        ["d"],
      ],
    });

    const r2 = await pull(baseTrigger);
    expect(r2.events).toHaveLength(1);
    expect(r2.events[0]!.eventId).toBe(eventId1);
  });
});

// ──────────────────────────────────────────────────────────────────
// Sheets 2.3 — extended changeKinds (snapshot-diff path).
// ──────────────────────────────────────────────────────────────────
describe("Sheets row_changed pull — extended changeKinds (snapshot-diff)", () => {
  // Build a trigger config with a previously-seeded snapshot. The
  // snapshot's rowHashes use the SAME hashRow algorithm normalize.ts
  // uses, so eventIds align.
  function buildPriorSnapshotPositional(rows: ReadonlyArray<ReadonlyArray<unknown>>) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const rowHashes: Record<string, string> = {};
    rows.forEach((row, i) => {
      rowHashes[String(i + 1)] = createHash("sha256")
        .update(JSON.stringify(row))
        .digest("hex");
    });
    return {
      rowHashes,
      rowCount: rows.length,
      windowStart: rows.length === 0 ? 1 : 1,
      windowEnd: rows.length,
      keyMode: "positional" as const,
      keyColumn: null,
      updatedAt: "2026-05-15T00:00:00.000Z",
    };
  }

  function extendedTrigger(opts: {
    rows?: ReadonlyArray<ReadonlyArray<unknown>>;
    changeKinds?: ("added" | "updated" | "removed")[];
    headerRow?: boolean;
    keyColumn?: string | null;
    snapshotRowLimit?: number;
  } = {}) {
    const rows = opts.rows ?? [["a"], ["b"], ["c"]];
    const snapshot = buildPriorSnapshotPositional(rows);
    return {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        headerRow: opts.headerRow ?? false,
        changeKinds: opts.changeKinds ?? ["added", "updated", "removed"],
        snapshotRowLimit: opts.snapshotRowLimit ?? 1000,
        keyColumn: opts.keyColumn ?? null,
        snapshot,
        lastRowCount: rows.length,
      },
    };
  }

  it("emits 'updated' event when an existing row's values change", async () => {
    const trigger = extendedTrigger({
      rows: [["alice", 30]],
      changeKinds: ["updated"],
    });
    mockValuesGet.mockResolvedValueOnce({
      values: [["alice", 31]], // age changed
    });

    const result = await pull(trigger);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.payload).toMatchObject({
      changeKind: "updated",
      rowIndex: 1,
      rowKey: "1",
      rowValues: ["alice", 31],
      previousValues: null,
    });
    // EventId carries the changeKind infix.
    expect(result.events[0]!.eventId).toMatch(/^ss-1:Sheet1:updated:1:[0-9a-f]{12}$/);
    // Snapshot persisted with the new hash + updated rowCount.
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const persistedConfig = mockUpdateConfig.mock.calls[0]![1] as {
      snapshot: { rowHashes: Record<string, string>; rowCount: number };
      lastRowCount: number;
    };
    expect(persistedConfig.lastRowCount).toBe(1);
    expect(persistedConfig.snapshot.rowHashes["1"]).toBeDefined();
  });

  it("emits NO event when changeKinds is ['updated'] but only an 'added' delta occurred", async () => {
    const trigger = extendedTrigger({
      rows: [["a"]],
      changeKinds: ["updated"],
    });
    mockValuesGet.mockResolvedValueOnce({
      values: [["a"], ["b"]], // row 2 added — but changeKinds excludes "added"
    });

    const result = await pull(trigger);
    expect(result.events).toEqual([]);
    // Snapshot still persists with the new row count + new hash.
    expect(mockUpdateConfig).toHaveBeenCalled();
  });

  it("emits 'removed' event when a row is deleted from the sheet", async () => {
    const trigger = extendedTrigger({
      rows: [["a"], ["b"]],
      changeKinds: ["removed"],
    });
    mockValuesGet.mockResolvedValueOnce({
      values: [["a"]], // row 2 deleted
    });

    const result = await pull(trigger);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.payload).toMatchObject({
      changeKind: "removed",
      rowIndex: null,
      rowKey: "2",
      rowValues: null,
      previousValues: null,
    });
    expect(result.events[0]!.eventId).toMatch(
      /^ss-1:Sheet1:removed:2:[0-9a-f]{12}$/,
    );
  });

  it("DOES NOT fire 'removed' when a row aged out of the bounded window (D-RemovedWindowSlide)", async () => {
    // Activate seeded a snapshot of 50 rows (cap=50, total=50, window=1..50).
    // Sheet now has 100 rows. Cap=50 → new snapshot covers rows 51..100.
    // Previous keys "1".."50" are absent from the new snapshot.
    // None should fire as removed — they slid out of the window.
    // (100 = 2x cap exactly, no overflow.)
    const prevRows = Array.from({ length: 50 }, (_, i) => [`v${i + 1}`]);
    const snapshot = buildPriorSnapshotPositional(prevRows);
    const trigger = {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        changeKinds: ["added", "updated", "removed"] as const,
        snapshotRowLimit: 50,
        keyColumn: null,
        snapshot,
        lastRowCount: 50,
        headerRow: false,
      },
    };
    mockValuesGet.mockResolvedValueOnce({
      values: Array.from({ length: 100 }, (_, i) => [`v${i + 1}`]),
    });

    const result = await pull(trigger);

    // Previous covered keys 1..50; new covers 51..100. Intersection: empty.
    // All 50 new keys (51..100) are "added"; prev keys 1..50 are
    // "removed candidates" → each is < new.windowStart (51) → slide.
    const removed = result.events.filter(
      (e) => (e.payload as { changeKind: string }).changeKind === "removed",
    );
    expect(removed).toEqual([]);
    const added = result.events.filter(
      (e) => (e.payload as { changeKind: string }).changeKind === "added",
    );
    expect(added).toHaveLength(50);
  });

  it("DOES fire 'removed' for rows past the new sheet's tail (genuine deletion at the bottom)", async () => {
    const prevRows = Array.from({ length: 10 }, (_, i) => [`v${i + 1}`]);
    const snapshot = buildPriorSnapshotPositional(prevRows);
    const trigger = {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        changeKinds: ["removed"] as const,
        snapshotRowLimit: 50,
        keyColumn: null,
        snapshot,
        lastRowCount: 10,
        headerRow: false,
      },
    };
    // Sheet shrunk to 5 rows. Previous keys "6".."10" absent from
    // current snapshot — all genuine.
    mockValuesGet.mockResolvedValueOnce({
      values: Array.from({ length: 5 }, (_, i) => [`v${i + 1}`]),
    });

    const result = await pull(trigger);
    expect(result.events).toHaveLength(5);
    expect(result.events.map((e) => (e.payload as { rowKey: string }).rowKey).sort()).toEqual(
      ["10", "6", "7", "8", "9"],
    );
  });

  it("emits 'added' + 'updated' + 'removed' for a mixed-change webhook", async () => {
    const trigger = extendedTrigger({
      rows: [
        ["alice", 30],
        ["bob", 25],
        ["carol", 40],
      ],
      changeKinds: ["added", "updated", "removed"],
    });
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["alice", 31], // row 1 updated
        ["bob", 25], // row 2 unchanged
        // row 3 (carol) removed
        ["dave", 50], // row 3 added (new "dave" in position formerly held by carol)
        ["eve", 22], // row 4 added
      ],
    });

    const result = await pull(trigger);
    // Positional shifts mean "row 3" appears updated (was carol, now
    // dave). "row 4" is new (added). No genuine "removed" — the
    // sheet got bigger.
    const byKind: Record<string, number> = {};
    for (const ev of result.events) {
      const k = (ev.payload as { changeKind: string }).changeKind;
      byKind[k] = (byKind[k] ?? 0) + 1;
    }
    expect(byKind["updated"]).toBe(2); // rows 1 + 3 differ from prev
    expect(byKind["added"]).toBe(1); // row 4 is new
    expect(byKind["removed"]).toBeUndefined();
  });

  it("keyColumn mode: detects update by key, suppresses positional shift noise", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    // Prior snapshot keyed by id column.
    const prevRows: ReadonlyArray<ReadonlyArray<unknown>> = [
      ["a1", "alice@e.test"],
      ["b2", "bob@e.test"],
    ];
    const rowHashes: Record<string, string> = {};
    prevRows.forEach((row) => {
      rowHashes[String(row[0])] = createHash("sha256")
        .update(JSON.stringify(row))
        .digest("hex");
    });
    const snapshot = {
      rowHashes,
      rowCount: 2,
      windowStart: 2,
      windowEnd: 3,
      keyMode: "keyColumn" as const,
      keyColumn: "id",
      updatedAt: "2026-05-15T00:00:00.000Z",
    };
    const trigger = {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        headerRow: true,
        changeKinds: ["added", "updated", "removed"] as const,
        snapshotRowLimit: 1000,
        keyColumn: "id",
        snapshot,
        lastRowCount: 2,
      },
    };
    // Reorder rows + change a1's email. Positional mode would fire 2
    // updated events; keyColumn should fire 1.
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["id", "email"],
        ["b2", "bob@e.test"], // moved to position 2 (was at 3)
        ["a1", "alice-new@e.test"], // moved to position 3 (was at 2), changed
      ],
    });

    const result = await pull(trigger);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.payload).toMatchObject({
      changeKind: "updated",
      rowKey: "a1",
      keyColumn: "id",
      keyValue: "a1",
      rowValues: ["a1", "alice-new@e.test"],
    });
  });

  it("keyColumn mode: emits structured warning on duplicate keys but does not fail", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const rowHashes: Record<string, string> = {
      a: createHash("sha256").update(JSON.stringify(["a", 1])).digest("hex"),
    };
    const snapshot = {
      rowHashes,
      rowCount: 1,
      windowStart: 2,
      windowEnd: 2,
      keyMode: "keyColumn" as const,
      keyColumn: "id",
      updatedAt: "2026-05-15T00:00:00.000Z",
    };
    const trigger = {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        headerRow: true,
        changeKinds: ["added", "updated", "removed"] as const,
        snapshotRowLimit: 1000,
        keyColumn: "id",
        snapshot,
        lastRowCount: 1,
      },
    };
    // Current snapshot will see 2 rows both with key="a" → duplicate.
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["id", "v"],
        ["a", 1],
        ["a", 2], // duplicate key
      ],
    });

    const result = await pull(trigger);

    expect(result.events).toBeDefined();
    // Warn was called with the duplicate-key payload.
    expect(warnSpy).toHaveBeenCalled();
    const warnArgs = warnSpy.mock.calls.flat().find(
      (a) => typeof a === "string" && a.includes("keycolumn_duplicate"),
    );
    expect(warnArgs).toBeDefined();
    warnSpy.mockRestore();
  });

  it("returns resyncRequired:true when snapshot field is missing", async () => {
    const trigger = {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        changeKinds: ["added", "updated"] as const,
        snapshotRowLimit: 1000,
        keyColumn: null,
        // snapshot intentionally missing
        lastRowCount: 0,
      },
    };
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = await pull(trigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
    expect(mockValuesGet).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("persists the new snapshot AFTER successful diff (snapshot path requires updated/removed in changeKinds)", async () => {
    const trigger = extendedTrigger({
      rows: [["a"]],
      changeKinds: ["added", "updated"], // snapshot path active
    });
    mockValuesGet.mockResolvedValueOnce({
      values: [["a"], ["b"]],
    });

    await pull(trigger);

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [triggerId, newConfig] = mockUpdateConfig.mock.calls[0]!;
    expect(triggerId).toBe("tr-1");
    const persisted = newConfig as {
      snapshot: { rowCount: number; rowHashes: Record<string, string> };
      lastRowCount: number;
    };
    expect(persisted.snapshot.rowCount).toBe(2);
    expect(Object.keys(persisted.snapshot.rowHashes).sort()).toEqual(["1", "2"]);
    expect(persisted.lastRowCount).toBe(2);
  });

  it("does NOT corrupt the prior snapshot when persistence fails", async () => {
    const trigger = extendedTrigger({
      rows: [["a"]],
      changeKinds: ["added", "updated"], // snapshot path active
    });
    mockValuesGet.mockResolvedValueOnce({
      values: [["a"], ["b"]],
    });
    mockUpdateConfig.mockRejectedValueOnce(new Error("DB write failed"));

    await expect(pull(trigger)).rejects.toThrow(/DB write failed/);
    // Caller sees the failure and retries; the trigger row's
    // existing snapshot is unchanged (updateConfig rejected). The
    // helper only attempts the update once.
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
  });

  it("legacy added-only path still uses legacy eventId format for backwards-compat", async () => {
    // Trigger with default changeKinds (no snapshot field at all).
    // Should hit the legacy count-delta fast path → legacy eventId.
    const trigger = {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        // No changeKinds field — defaults to ["added"] in the
        // schema, but the pull function reads config.changeKinds
        // directly and the fast path triggers when "updated" /
        // "removed" are absent.
        lastRowCount: 1,
      },
    };
    mockValuesGet.mockResolvedValueOnce({ values: [["a"], ["b"]] });
    const result = await pull(trigger);
    expect(result.events).toHaveLength(1);
    // Legacy format: ss-1:Sheet1:2:<hash> (no changeKind infix)
    expect(result.events[0]!.eventId).toMatch(/^ss-1:Sheet1:2:[0-9a-f]{12}$/);
    expect(result.events[0]!.eventId).not.toContain(":added:");
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
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "google-sheets",
  eventType: "row_changed",
  nodeId: "node-trigger",
  config: {
    type: "subscription-watch",
    spreadsheetId: "ss-1",
    sheetName: "Sheet1",
    channelId: "channel-old",
    resourceId: "res-old",
    pageToken: "page-keep",
    lastRowCount: 7,
    expiresAt: "2026-05-15T00:00:00Z",
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("sheetsRowChangedSubscriptionHandler", () => {
  it("canHandle accepts a Sheets row_changed subscription-watch row", () => {
    expect(
      sheetsRowChangedSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);
  });

  it("canHandle rejects rows from other providers", () => {
    expect(
      sheetsRowChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        provider: "google-drive",
      }),
    ).toBe(false);
  });

  it("canHandle rejects subscription-watch rows of different eventType", () => {
    expect(
      sheetsRowChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "other_type",
      }),
    ).toBe(false);
  });

  it("getRenewalThresholdMs returns 24h", () => {
    expect(sheetsRowChangedSubscriptionHandler.getRenewalThresholdMs()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("renew creates new channel against same spreadsheetId, stops old, persists with lastRowCount untouched", async () => {
    mockFilesWatch.mockResolvedValueOnce({
      id: "channel-new",
      resourceId: "res-new",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockChannelsStop.mockResolvedValueOnce(undefined);

    await sheetsRowChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    // Watch first, against the same spreadsheetId we activated with.
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("ss-1");
    expect(mockFilesWatch.mock.calls[0]![0].channelToken).toBe("hmac-new");

    // Then stop old.
    expect(mockChannelsStop).toHaveBeenCalledTimes(1);
    expect(mockChannelsStop.mock.calls[0]![0]).toEqual({
      accessToken: "tok",
      channelId: "channel-old",
      resourceId: "res-old",
    });

    // Persist: lastRowCount + sheetName + pageToken untouched, channelId rotated.
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [id, persisted] = mockUpdateConfig.mock.calls[0]!;
    expect(id).toBe("tr-1");
    const cfg = persisted as Record<string, unknown>;
    expect(cfg.lastRowCount).toBe(7);
    expect(cfg.sheetName).toBe("Sheet1");
    expect(cfg.pageToken).toBe("page-keep");
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
      sheetsRowChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
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
      sheetsRowChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).resolves.toBeUndefined();
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("throws when the integration row is missing", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);

    await expect(
      sheetsRowChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/no active integration/);
  });

  it("throws when config is missing spreadsheetId", async () => {
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, spreadsheetId: undefined },
    };
    await expect(
      sheetsRowChangedSubscriptionHandler.renew({ trigger }),
    ).rejects.toThrow(/spreadsheetId/);
  });
});

});
