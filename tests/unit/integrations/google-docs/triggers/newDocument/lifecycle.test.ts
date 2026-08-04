/**
 * @jest-environment node
 *
 * google-docs/triggers/newDocument trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockChangesGetStartPageToken = jest.fn();
const mockFilesWatch = jest.fn();
const mockBuildChannelToken = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
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

import { activate } from "@/integrations/google-docs/triggers/newDocument/activate";
import { isCreatedChange, normalize } from "@/integrations/google-docs/triggers/newDocument/normalize";
import type { DriveChangeEntry } from "@/integrations/google-drive/api/changesList";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// Slice 3.GDOCS-5 — new_document activate tests.
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
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
  provider: "google-docs",
  type: "new_document",
  config: {},
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "google-docs",
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

function defaultMocks() {
  mockChangesGetStartPageToken.mockResolvedValueOnce({
    startPageToken: "page-100",
  });
  mockFilesWatch.mockResolvedValueOnce({
    id: "channel-from-google",
    resourceId: "res-id",
    expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

describe("Google Docs new_document activate", () => {
  it("captures startPageToken then registers a Drive files.watch", async () => {
    defaultMocks();
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockChangesGetStartPageToken).toHaveBeenCalledTimes(1);
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      fileId: "root",
      resourceId: "res-id",
      pageToken: "page-100",
    });
    expect(result.channelId).toMatch(/^chainreact-node-trigger-[0-9a-f-]+$/);
    expect(typeof result.expiresAt).toBe("string");
  });

  it("uses 'root' as the watch target when folderId is unset", async () => {
    defaultMocks();
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("root");
    expect(result.fileId).toBe("root");
    expect(result.folderId).toBeUndefined();
  });

  it("uses the configured folderId as the watch target when set + persists folderId in config", async () => {
    defaultMocks();
    const result = await activate({
      node: { ...baseNode, config: { folderId: "fld-A" } },
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("fld-A");
    expect(result.fileId).toBe("fld-A");
    expect(result.folderId).toBe("fld-A");
  });

  it("provider passed to refreshAndRetry is 'google-docs' (not 'google-drive')", async () => {
    defaultMocks();
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockRefreshAndRetry.mock.calls.every((c) => c[0].provider === "google-docs")).toBe(
      true,
    );
  });

  it("passes HMAC channelToken on the watch request", async () => {
    mockBuildChannelToken.mockReset();
    mockBuildChannelToken.mockReturnValueOnce("the-real-hmac");
    defaultMocks();
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockFilesWatch.mock.calls[0]![0].channelToken).toBe("the-real-hmac");
  });

  it("uses NEXT_PUBLIC_APP_URL + /api/webhooks/google-docs as the webhook address", async () => {
    defaultMocks();
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockFilesWatch.mock.calls[0]![0].webhookAddress).toBe(
      "https://app.example.test/api/webhooks/google-docs",
    );
  });

  it("throws when getStartPageToken returns no token (V1 first-poll-miss guard)", async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({ startPageToken: "" });
    await expect(
      activate({
        node: baseNode,
        integration: baseIntegration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/no startPageToken/);
  });

  it("rejects unknown config fields (strict schema)", async () => {
    defaultMocks();
    await expect(
      activate({
        node: { ...baseNode, config: { somethingBogus: "x" } },
        integration: baseIntegration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow();
    // Strict schema means the V1 polling chrome can't accidentally
    // re-enter via the meta field-set.
    expect(mockFilesWatch).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// Slice 3.GDOCS-5 — new_document normalize tests.
// Pins the post-fetch filter logic. Drive's `changes.list` returns the
// user's whole drive (or whole folder); the trigger reduces that stream
// to Google Docs documents that were just CREATED (and live in the
// configured folder, when scoped).
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

const DOC = "application/vnd.google-apps.document";
const ACCOUNT = "alice@example.com";

function change(
  overrides: Partial<Omit<DriveChangeEntry, "file">> & {
    file?: Record<string, unknown>;
  } = {},
): DriveChangeEntry {
  const { file: fileOverrides, ...topOverrides } = overrides;
  return {
    kind: "drive#change",
    changeType: "file",
    time: "2026-05-08T10:00:00Z",
    removed: false,
    fileId: "doc-1",
    ...topOverrides,
    file: {
      id: "doc-1",
      name: "My Doc",
      mimeType: DOC,
      parents: ["folder-A"],
      createdTime: "2026-05-08T10:00:00Z",
      modifiedTime: "2026-05-08T10:00:00Z",
      webViewLink: "https://docs.google.com/document/d/doc-1/edit",
      trashed: false,
      owners: [{ emailAddress: "alice@example.com" }],
      ...fileOverrides,
    },
  } as DriveChangeEntry;
}

describe("isCreatedChange", () => {
  it("true when createdTime === modifiedTime", () => {
    expect(isCreatedChange(change())).toBe(true);
  });

  it("false when createdTime < modifiedTime (update)", () => {
    const c = change({
      file: {
        createdTime: "2026-05-08T10:00:00Z",
        modifiedTime: "2026-05-08T11:00:00Z",
      },
    });
    expect(isCreatedChange(c)).toBe(false);
  });

  it("false when removed=true", () => {
    expect(isCreatedChange(change({ removed: true }))).toBe(false);
  });

  it("false when file.trashed=true", () => {
    const c = change({ file: { trashed: true } });
    expect(isCreatedChange(c)).toBe(false);
  });

  it("false when createdTime missing", () => {
    const c = change({
      file: { createdTime: undefined, modifiedTime: "2026-05-08T11:00:00Z" },
    });
    expect(isCreatedChange(c)).toBe(false);
  });
});

describe("normalize — filters", () => {
  it("drops drive-level changes (changeType=drive)", () => {
    expect(normalize(change({ changeType: "drive" }), { providerAccountId: ACCOUNT })).toBeNull();
  });

  it("drops changes without fileId", () => {
    expect(
      normalize(change({ fileId: undefined as unknown as string }), { providerAccountId: ACCOUNT }),
    ).toBeNull();
  });

  it("drops removed=true", () => {
    expect(normalize(change({ removed: true }), { providerAccountId: ACCOUNT })).toBeNull();
  });

  it("drops files with no file resource (defensive)", () => {
    const c = { ...change(), file: undefined } as DriveChangeEntry;
    expect(normalize(c, { providerAccountId: ACCOUNT })).toBeNull();
  });

  it("drops non-Docs mimeType (spreadsheets, sheets, folders, etc.)", () => {
    const c = change({
      file: { mimeType: "application/vnd.google-apps.spreadsheet" },
    });
    expect(normalize(c, { providerAccountId: ACCOUNT })).toBeNull();
    const folder = change({
      file: { mimeType: "application/vnd.google-apps.folder" },
    });
    expect(normalize(folder, { providerAccountId: ACCOUNT })).toBeNull();
  });

  it("drops updates (createdTime < modifiedTime) — those belong to document_updated", () => {
    const c = change({
      file: {
        createdTime: "2026-05-08T10:00:00Z",
        modifiedTime: "2026-05-08T11:00:00Z",
      },
    });
    expect(normalize(c, { providerAccountId: ACCOUNT })).toBeNull();
  });

  it("drops files outside the configured folder when folderId is set", () => {
    const c = change({
      file: { parents: ["folder-B"] },
    });
    expect(
      normalize(c, { providerAccountId: ACCOUNT, folderId: "folder-A" }),
    ).toBeNull();
  });

  it("emits when the configured folder is in parents", () => {
    expect(
      normalize(change(), { providerAccountId: ACCOUNT, folderId: "folder-A" }),
    ).not.toBeNull();
  });

  it("emits when no folderId is configured", () => {
    expect(normalize(change(), { providerAccountId: ACCOUNT })).not.toBeNull();
  });
});

describe("normalize — payload shape", () => {
  it("returns the GDOCS-5 payload with sensitive-marked fields populated", () => {
    const event = normalize(change(), { providerAccountId: ACCOUNT });
    expect(event).toMatchObject({
      provider: "google-docs",
      eventType: "new_document",
      providerAccountId: ACCOUNT,
      payload: {
        documentId: "doc-1",
        title: "My Doc",
        documentUrl: "https://docs.google.com/document/d/doc-1/edit",
        folderId: null,
        createdAt: "2026-05-08T10:00:00Z",
        createdBy: "alice@example.com",
        mimeType: DOC,
        changeKind: "created",
      },
    });
    expect(event!.eventId).toBe("doc-1:2026-05-08T10:00:00Z");
    expect(event!.occurredAt).toBe("2026-05-08T10:00:00Z");
  });

  it("constructs documentUrl from documentId when webViewLink is missing", () => {
    const c = change({
      file: { webViewLink: undefined },
    });
    const event = normalize(c, { providerAccountId: ACCOUNT });
    expect(event!.payload.documentUrl).toBe(
      "https://docs.google.com/document/d/doc-1/edit",
    );
  });

  it("createdBy = null when owners array is missing or empty", () => {
    const c = change({ file: { owners: undefined } });
    expect(normalize(c, { providerAccountId: ACCOUNT })!.payload.createdBy).toBeNull();
    const c2 = change({ file: { owners: [] } });
    expect(normalize(c2, { providerAccountId: ACCOUNT })!.payload.createdBy).toBeNull();
  });

  it("title = null when file.name is missing", () => {
    const c = change({ file: { name: undefined } });
    expect(normalize(c, { providerAccountId: ACCOUNT })!.payload.title).toBeNull();
  });

  it("eventId combines fileId + createdTime so dedup catches duplicate push deliveries", () => {
    const e1 = normalize(change(), { providerAccountId: ACCOUNT });
    const e2 = normalize(change(), { providerAccountId: ACCOUNT });
    expect(e1!.eventId).toBe(e2!.eventId);
  });
});

});
