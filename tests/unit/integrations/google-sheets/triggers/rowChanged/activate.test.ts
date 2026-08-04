/**
 * @jest-environment node
 */
import {
  RowChangedInputConfigSchema,
  requiresExtendedSnapshot,
  SNAPSHOT_ROW_LIMIT_DEFAULT,
  SNAPSHOT_ROW_LIMIT_MAX,
  SNAPSHOT_ROW_LIMIT_MIN,
} from "@/integrations/google-sheets/triggers/rowChanged/schema";
const mockRefreshAndRetry = jest.fn();
const mockValuesGet = jest.fn();
const mockChangesGetStartPageToken = jest.fn();
const mockFilesWatch = jest.fn();
const mockBuildChannelToken = jest.fn();

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

import { activate } from "@/integrations/google-sheets/triggers/rowChanged/activate";

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
  it("snapshots row count + Drive pageToken, then registers the file-watch", async () => {
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
    expect(mockChangesGetStartPageToken).toHaveBeenCalledTimes(1);
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
      pageToken: "page-100",
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

  it("throws when getStartPageToken returns no token", async () => {
    mockValuesGet.mockResolvedValueOnce({ values: [] });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "",
    });
    await expect(
      activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" }),
    ).rejects.toThrow(/no startPageToken/);
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
