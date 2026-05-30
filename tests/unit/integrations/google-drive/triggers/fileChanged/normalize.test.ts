/**
 * @jest-environment node
 */
import {
  classifyChangeKind,
  classifyObjectKind,
  normalize,
} from "@/integrations/google-drive/triggers/fileChanged/normalize";
import type { DriveChangeEntry } from "@/integrations/google-drive/api/changesList";

describe("classifyChangeKind", () => {
  it("classifies removed=true as removed regardless of file payload", () => {
    expect(
      classifyChangeKind({ removed: true, fileId: "f-1" } as DriveChangeEntry),
    ).toBe("removed");
  });

  it("classifies file.trashed=true as removed", () => {
    expect(
      classifyChangeKind({
        fileId: "f-1",
        file: { id: "f-1", trashed: true },
      } as DriveChangeEntry),
    ).toBe("removed");
  });

  it("classifies createdTime==modifiedTime as created", () => {
    expect(
      classifyChangeKind({
        fileId: "f-1",
        file: {
          id: "f-1",
          createdTime: "2026-05-08T10:00:00Z",
          modifiedTime: "2026-05-08T10:00:00Z",
        },
      } as DriveChangeEntry),
    ).toBe("created");
  });

  it("classifies createdTime != modifiedTime as updated", () => {
    expect(
      classifyChangeKind({
        fileId: "f-1",
        file: {
          id: "f-1",
          createdTime: "2026-05-08T10:00:00Z",
          modifiedTime: "2026-05-08T11:00:00Z",
        },
      } as DriveChangeEntry),
    ).toBe("updated");
  });

  it("falls back to updated when createdTime is missing", () => {
    expect(
      classifyChangeKind({
        fileId: "f-1",
        file: { id: "f-1", modifiedTime: "2026-05-08T11:00:00Z" },
      } as DriveChangeEntry),
    ).toBe("updated");
  });
});

describe("classifyObjectKind", () => {
  it("returns folder for the folder mimeType", () => {
    expect(
      classifyObjectKind({
        fileId: "f",
        file: { id: "f", mimeType: "application/vnd.google-apps.folder" },
      } as DriveChangeEntry),
    ).toBe("folder");
  });

  it("returns file for everything else (including Google Docs)", () => {
    expect(
      classifyObjectKind({
        fileId: "d",
        file: { id: "d", mimeType: "application/vnd.google-apps.document" },
      } as DriveChangeEntry),
    ).toBe("file");
  });

  it("returns file when mimeType is missing", () => {
    expect(
      classifyObjectKind({ fileId: "x" } as DriveChangeEntry),
    ).toBe("file");
  });
});

describe("normalize", () => {
  const ctx = { accountId: "alice@example.test" };

  it("emits a TriggerEvent with correct shape for a created file", () => {
    const ev = normalize(
      {
        kind: "drive#change",
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        removed: false,
        fileId: "f-1",
        file: {
          id: "f-1",
          name: "report.pdf",
          mimeType: "application/pdf",
          parents: ["fld-A"],
          createdTime: "2026-05-08T12:00:00Z",
          modifiedTime: "2026-05-08T12:00:00Z",
          trashed: false,
          webViewLink: "https://drive.google.com/file/d/f-1",
        },
      },
      ctx,
    );

    expect(ev).not.toBeNull();
    expect(ev!.provider).toBe("google-drive");
    expect(ev!.eventType).toBe("file_changed");
    expect(ev!.eventId).toBe("f-1:2026-05-08T12:00:00Z");
    expect(ev!.occurredAt).toBe("2026-05-08T12:00:00Z");
    expect(ev!.providerAccountId).toBe("alice@example.test");
    expect(ev!.payload).toEqual({
      changeKind: "created",
      objectKind: "file",
      fileId: "f-1",
      name: "report.pdf",
      mimeType: "application/pdf",
      parents: ["fld-A"],
      webViewLink: "https://drive.google.com/file/d/f-1",
      modifiedTime: "2026-05-08T12:00:00Z",
      trashed: false,
      removed: false,
    });
  });

  it("emits removed change for a deleted file", () => {
    const ev = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        removed: true,
        fileId: "f-2",
      },
      ctx,
    );

    expect(ev!.payload.changeKind).toBe("removed");
    expect(ev!.payload.removed).toBe(true);
    expect(ev!.payload.fileId).toBe("f-2");
  });

  it("drops drive-level changes (changeType === 'drive')", () => {
    const ev = normalize(
      {
        changeType: "drive",
        time: "2026-05-08T12:00:00Z",
        fileId: "drive-1",
      },
      ctx,
    );
    expect(ev).toBeNull();
  });

  it("drops changes without a fileId", () => {
    const ev = normalize(
      { changeType: "file", time: "2026-05-08T12:00:00Z" },
      ctx,
    );
    expect(ev).toBeNull();
  });

  it("filters by folderId — keeps changes whose file has that folder as a parent", () => {
    const ev = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        fileId: "f-1",
        file: { id: "f-1", parents: ["fld-A", "fld-B"] },
      },
      { accountId: "a@e.test", folderId: "fld-A" },
    );
    expect(ev).not.toBeNull();
  });

  it("filters by folderId — drops changes whose file has DIFFERENT parents", () => {
    const ev = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        fileId: "f-1",
        file: { id: "f-1", parents: ["fld-X"] },
      },
      { accountId: "a@e.test", folderId: "fld-A" },
    );
    expect(ev).toBeNull();
  });

  it("filters by folderId — drops removed changes (no file payload to check parents)", () => {
    // Removed changes have no file metadata; we can't tell which folder
    // they belonged to. Dropping them is the safe choice — leaking deletion
    // noise from outside the configured folder would surprise authors.
    const ev = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        fileId: "f-1",
        removed: true,
      },
      { accountId: "a@e.test", folderId: "fld-A" },
    );
    expect(ev).toBeNull();
  });

  it("eventId combines fileId + change.time so duplicates collapse via dedup", () => {
    const ev1 = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        fileId: "f-1",
        file: { id: "f-1" },
      },
      ctx,
    );
    const ev2 = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        fileId: "f-1",
        file: { id: "f-1" },
      },
      ctx,
    );
    expect(ev1!.eventId).toBe(ev2!.eventId);
  });

  it("eventId differs across distinct change times for the same file", () => {
    const ev1 = normalize(
      {
        changeType: "file",
        time: "2026-05-08T12:00:00Z",
        fileId: "f-1",
        file: { id: "f-1" },
      },
      ctx,
    );
    const ev2 = normalize(
      {
        changeType: "file",
        time: "2026-05-08T13:00:00Z",
        fileId: "f-1",
        file: { id: "f-1" },
      },
      ctx,
    );
    expect(ev1!.eventId).not.toBe(ev2!.eventId);
  });
});
