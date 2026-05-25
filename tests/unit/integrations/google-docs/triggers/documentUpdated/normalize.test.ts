/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-5 — document_updated normalize tests.
 *
 * Twin of newDocument/normalize.test.ts. Pins the `updated` change-kind
 * filter + the documentId-takes-precedence-over-folderId filter logic.
 */
import {
  isUpdatedChange,
  normalize,
} from "@/integrations/google-docs/triggers/documentUpdated/normalize";
import type { DriveChangeEntry } from "@/integrations/google-drive/api/changesList";

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
    expect(normalize(change({ changeType: "drive" }), { accountId: ACCOUNT })).toBeNull();
  });

  it("drops removed and trashed files", () => {
    expect(normalize(change({ removed: true }), { accountId: ACCOUNT })).toBeNull();
    expect(
      normalize(change({ file: { trashed: true } }), {
        accountId: ACCOUNT,
      }),
    ).toBeNull();
  });

  it("drops non-Docs mimeType", () => {
    expect(
      normalize(
        change({ file: { mimeType: "application/vnd.google-apps.spreadsheet" } }),
        { accountId: ACCOUNT },
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
    expect(normalize(c, { accountId: ACCOUNT })).toBeNull();
  });

  it("documentId filter takes precedence — drops other documents even when in folder", () => {
    expect(
      normalize(change(), {
        accountId: ACCOUNT,
        documentId: "other-doc",
        folderId: "folder-A",
      }),
    ).toBeNull();
  });

  it("documentId filter emits when document matches", () => {
    expect(
      normalize(change(), {
        accountId: ACCOUNT,
        documentId: "doc-1",
      }),
    ).not.toBeNull();
  });

  it("folderId filter (without documentId) drops files outside the folder", () => {
    expect(
      normalize(
        change({ file: { parents: ["folder-B"] } }),
        { accountId: ACCOUNT, folderId: "folder-A" },
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
        accountId: ACCOUNT,
        documentId: "doc-1",
        folderId: "folder-A",
      }),
    ).not.toBeNull();
  });

  it("emits with no filters", () => {
    expect(normalize(change(), { accountId: ACCOUNT })).not.toBeNull();
  });
});

describe("normalize — payload shape", () => {
  it("returns the GDOCS-5 payload with updatedBy + revisionId populated", () => {
    const event = normalize(change(), { accountId: ACCOUNT });
    expect(event).toMatchObject({
      provider: "google-docs",
      eventType: "document_updated",
      accountId: ACCOUNT,
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
    expect(normalize(c, { accountId: ACCOUNT })!.payload.revisionId).toBeNull();
  });

  it("updatedBy = null when lastModifyingUser missing", () => {
    const c = change({
      file: { lastModifyingUser: undefined },
    });
    expect(normalize(c, { accountId: ACCOUNT })!.payload.updatedBy).toBeNull();
  });

  it("eventId combines fileId + modifiedTime so dedup catches duplicate push deliveries", () => {
    const e1 = normalize(change(), { accountId: ACCOUNT });
    const e2 = normalize(change(), { accountId: ACCOUNT });
    expect(e1!.eventId).toBe(e2!.eventId);
  });

  it("constructs documentUrl when webViewLink missing", () => {
    const c = change({ file: { webViewLink: undefined } });
    expect(normalize(c, { accountId: ACCOUNT })!.payload.documentUrl).toBe(
      "https://docs.google.com/document/d/doc-1/edit",
    );
  });
});
