/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-5 — new_document normalize tests.
 *
 * Pins the post-fetch filter logic. Drive's `changes.list` returns the
 * user's whole drive (or whole folder); the trigger reduces that stream
 * to Google Docs documents that were just CREATED (and live in the
 * configured folder, when scoped).
 */
import {
  isCreatedChange,
  normalize,
} from "@/integrations/google-docs/triggers/newDocument/normalize";
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
    expect(normalize(change({ changeType: "drive" }), { accountId: ACCOUNT })).toBeNull();
  });

  it("drops changes without fileId", () => {
    expect(
      normalize(change({ fileId: undefined as unknown as string }), { accountId: ACCOUNT }),
    ).toBeNull();
  });

  it("drops removed=true", () => {
    expect(normalize(change({ removed: true }), { accountId: ACCOUNT })).toBeNull();
  });

  it("drops files with no file resource (defensive)", () => {
    const c = { ...change(), file: undefined } as DriveChangeEntry;
    expect(normalize(c, { accountId: ACCOUNT })).toBeNull();
  });

  it("drops non-Docs mimeType (spreadsheets, sheets, folders, etc.)", () => {
    const c = change({
      file: { mimeType: "application/vnd.google-apps.spreadsheet" },
    });
    expect(normalize(c, { accountId: ACCOUNT })).toBeNull();
    const folder = change({
      file: { mimeType: "application/vnd.google-apps.folder" },
    });
    expect(normalize(folder, { accountId: ACCOUNT })).toBeNull();
  });

  it("drops updates (createdTime < modifiedTime) — those belong to document_updated", () => {
    const c = change({
      file: {
        createdTime: "2026-05-08T10:00:00Z",
        modifiedTime: "2026-05-08T11:00:00Z",
      },
    });
    expect(normalize(c, { accountId: ACCOUNT })).toBeNull();
  });

  it("drops files outside the configured folder when folderId is set", () => {
    const c = change({
      file: { parents: ["folder-B"] },
    });
    expect(
      normalize(c, { accountId: ACCOUNT, folderId: "folder-A" }),
    ).toBeNull();
  });

  it("emits when the configured folder is in parents", () => {
    expect(
      normalize(change(), { accountId: ACCOUNT, folderId: "folder-A" }),
    ).not.toBeNull();
  });

  it("emits when no folderId is configured", () => {
    expect(normalize(change(), { accountId: ACCOUNT })).not.toBeNull();
  });
});

describe("normalize — payload shape", () => {
  it("returns the GDOCS-5 payload with sensitive-marked fields populated", () => {
    const event = normalize(change(), { accountId: ACCOUNT });
    expect(event).toMatchObject({
      provider: "google-docs",
      eventType: "new_document",
      accountId: ACCOUNT,
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
    const event = normalize(c, { accountId: ACCOUNT });
    expect(event!.payload.documentUrl).toBe(
      "https://docs.google.com/document/d/doc-1/edit",
    );
  });

  it("createdBy = null when owners array is missing or empty", () => {
    const c = change({ file: { owners: undefined } });
    expect(normalize(c, { accountId: ACCOUNT })!.payload.createdBy).toBeNull();
    const c2 = change({ file: { owners: [] } });
    expect(normalize(c2, { accountId: ACCOUNT })!.payload.createdBy).toBeNull();
  });

  it("title = null when file.name is missing", () => {
    const c = change({ file: { name: undefined } });
    expect(normalize(c, { accountId: ACCOUNT })!.payload.title).toBeNull();
  });

  it("eventId combines fileId + createdTime so dedup catches duplicate push deliveries", () => {
    const e1 = normalize(change(), { accountId: ACCOUNT });
    const e2 = normalize(change(), { accountId: ACCOUNT });
    expect(e1!.eventId).toBe(e2!.eventId);
  });
});
