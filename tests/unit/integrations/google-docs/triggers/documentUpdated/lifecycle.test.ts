/**
 * @jest-environment node
 *
 * google-docs/triggers/documentUpdated trigger lifecycle contract suite — one per-trigger suite
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

import { activate } from "@/integrations/google-docs/triggers/documentUpdated/activate";
import { isUpdatedChange, normalize } from "@/integrations/google-docs/triggers/documentUpdated/normalize";
import type { DriveChangeEntry } from "@/integrations/google-drive/api/changesList";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// Slice 3.GDOCS-5 — document_updated activate tests.
// Pins the documentId-takes-precedence-over-folderId watch-target
// resolution.
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
  type: "document_updated",
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

describe("Google Docs document_updated activate", () => {
  it("watches 'root' when neither documentId nor folderId is set", async () => {
    defaultMocks();
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("root");
    expect(result.fileId).toBe("root");
    expect(result.documentId).toBeUndefined();
    expect(result.folderId).toBeUndefined();
  });

  it("watches the folder when folderId set + documentId unset", async () => {
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

  it("watches the document when documentId set — takes precedence over folderId", async () => {
    defaultMocks();
    const result = await activate({
      node: {
        ...baseNode,
        config: { documentId: "doc-X", folderId: "fld-A" },
      },
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("doc-X");
    expect(result.fileId).toBe("doc-X");
    expect(result.documentId).toBe("doc-X");
    // folderId still persisted for normalize's defense-in-depth filter.
    expect(result.folderId).toBe("fld-A");
  });

  it("returns the subscription-watch config patch with channel + token + expiry", async () => {
    defaultMocks();
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      resourceId: "res-id",
      pageToken: "page-100",
    });
    expect(result.channelId).toMatch(/^chainreact-node-trigger-[0-9a-f-]+$/);
  });

  it("provider passed to refreshAndRetry is 'google-docs'", async () => {
    defaultMocks();
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(
      mockRefreshAndRetry.mock.calls.every((c) => c[0].provider === "google-docs"),
    ).toBe(true);
  });

  it("throws when getStartPageToken returns no token", async () => {
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
        node: { ...baseNode, config: { unknown: "x" } },
        integration: baseIntegration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow();
    expect(mockFilesWatch).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// Slice 3.GDOCS-5 — document_updated normalize tests.
// Twin of newDocument/normalize.test.ts. Pins the `updated` change-kind
// filter + the documentId-takes-precedence-over-folderId filter logic.
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
    time: "2026-05-08T11:00:00Z",
    removed: false,
    fileId: "doc-1",
    ...topOverrides,
    file: {
      id: "doc-1",
      name: "My Doc",
      mimeType: DOC,
      parents: ["folder-A"],
      createdTime: "2026-05-08T10:00:00Z",
      modifiedTime: "2026-05-08T11:00:00Z",
      webViewLink: "https://docs.google.com/document/d/doc-1/edit",
      trashed: false,
      lastModifyingUser: { emailAddress: "bob@example.com" },
      version: "42",
      ...fileOverrides,
    },
  } as DriveChangeEntry;
}

describe("isUpdatedChange", () => {
  it("true when createdTime < modifiedTime", () => {
    expect(isUpdatedChange(change())).toBe(true);
  });

  it("false when createdTime === modifiedTime (insert — belongs to new_document)", () => {
    const c = change({
      file: {
        createdTime: "2026-05-08T10:00:00Z",
        modifiedTime: "2026-05-08T10:00:00Z",
      },
    });
    expect(isUpdatedChange(c)).toBe(false);
  });

  it("false when removed or trashed", () => {
    expect(isUpdatedChange(change({ removed: true }))).toBe(false);
    expect(
      isUpdatedChange(change({ file: { trashed: true } })),
    ).toBe(false);
  });

  it("false when modifiedTime missing", () => {
    expect(
      isUpdatedChange(change({ file: { modifiedTime: undefined } })),
    ).toBe(false);
  });
});

describe("normalize — filters", () => {
  it("drops drive-level changes", () => {
    expect(normalize(change({ changeType: "drive" }), { providerAccountId: ACCOUNT })).toBeNull();
  });

  it("drops removed and trashed files", () => {
    expect(normalize(change({ removed: true }), { providerAccountId: ACCOUNT })).toBeNull();
    expect(
      normalize(change({ file: { trashed: true } }), {
        providerAccountId: ACCOUNT,
      }),
    ).toBeNull();
  });

  it("drops non-Docs mimeType", () => {
    expect(
      normalize(
        change({ file: { mimeType: "application/vnd.google-apps.spreadsheet" } }),
        { providerAccountId: ACCOUNT },
      ),
    ).toBeNull();
  });

  it("drops new documents (createdTime === modifiedTime — that's new_document territory)", () => {
    const c = change({
      file: {
        createdTime: "2026-05-08T10:00:00Z",
        modifiedTime: "2026-05-08T10:00:00Z",
      },
    });
    expect(normalize(c, { providerAccountId: ACCOUNT })).toBeNull();
  });

  it("documentId filter takes precedence — drops other documents even when in folder", () => {
    expect(
      normalize(change(), {
        providerAccountId: ACCOUNT,
        documentId: "other-doc",
        folderId: "folder-A",
      }),
    ).toBeNull();
  });

  it("documentId filter emits when document matches", () => {
    expect(
      normalize(change(), {
        providerAccountId: ACCOUNT,
        documentId: "doc-1",
      }),
    ).not.toBeNull();
  });

  it("folderId filter (without documentId) drops files outside the folder", () => {
    expect(
      normalize(
        change({ file: { parents: ["folder-B"] } }),
        { providerAccountId: ACCOUNT, folderId: "folder-A" },
      ),
    ).toBeNull();
  });

  it("folderId is IGNORED when documentId is set (documentId is narrowest)", () => {
    // Same document, different folder — documentId match wins.
    const c = change({
      file: { parents: ["folder-B"] },
    });
    expect(
      normalize(c, {
        providerAccountId: ACCOUNT,
        documentId: "doc-1",
        folderId: "folder-A",
      }),
    ).not.toBeNull();
  });

  it("emits with no filters", () => {
    expect(normalize(change(), { providerAccountId: ACCOUNT })).not.toBeNull();
  });
});

describe("normalize — payload shape", () => {
  it("returns the GDOCS-5 payload with updatedBy + revisionId populated", () => {
    const event = normalize(change(), { providerAccountId: ACCOUNT });
    expect(event).toMatchObject({
      provider: "google-docs",
      eventType: "document_updated",
      providerAccountId: ACCOUNT,
      payload: {
        documentId: "doc-1",
        title: "My Doc",
        documentUrl: "https://docs.google.com/document/d/doc-1/edit",
        folderId: null,
        updatedAt: "2026-05-08T11:00:00Z",
        updatedBy: "bob@example.com",
        revisionId: "42",
        mimeType: DOC,
        changeKind: "updated",
      },
    });
    expect(event!.eventId).toBe("doc-1:2026-05-08T11:00:00Z");
  });

  it("revisionId = null when version missing", () => {
    const c = change({ file: { version: undefined } });
    expect(normalize(c, { providerAccountId: ACCOUNT })!.payload.revisionId).toBeNull();
  });

  it("updatedBy = null when lastModifyingUser missing", () => {
    const c = change({
      file: { lastModifyingUser: undefined },
    });
    expect(normalize(c, { providerAccountId: ACCOUNT })!.payload.updatedBy).toBeNull();
  });

  it("eventId combines fileId + modifiedTime so dedup catches duplicate push deliveries", () => {
    const e1 = normalize(change(), { providerAccountId: ACCOUNT });
    const e2 = normalize(change(), { providerAccountId: ACCOUNT });
    expect(e1!.eventId).toBe(e2!.eventId);
  });

  it("constructs documentUrl when webViewLink missing", () => {
    const c = change({ file: { webViewLink: undefined } });
    expect(normalize(c, { providerAccountId: ACCOUNT })!.payload.documentUrl).toBe(
      "https://docs.google.com/document/d/doc-1/edit",
    );
  });
});

});
