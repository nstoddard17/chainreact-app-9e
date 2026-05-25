/**
 * @jest-environment node
 *
 * Tests for `integrations/dropbox/triggers/newFile/normalize.ts` —
 * Slice 3.DROPBOX-5. Canonical TriggerEvent shape + stable eventId; no
 * bytes / links / tokens in the payload.
 */
import {
  buildNewFileEventId,
  normalizeNewFile,
  type DropboxFileEntry,
} from "@/integrations/dropbox/triggers/newFile/normalize";
import { TriggerEventSchema } from "@/contracts/triggerEvent";

const fileEntry: DropboxFileEntry = {
  ".tag": "file",
  id: "id:file1",
  name: "q1.pdf",
  path_display: "/Reports/q1.pdf",
  path_lower: "/reports/q1.pdf",
  size: 2048,
  rev: "0123abc",
  client_modified: "2026-05-20T10:00:00Z",
  server_modified: "2026-05-24T10:00:00Z",
  is_downloadable: true,
};

describe("dropbox new_file normalize", () => {
  it("produces a contract-valid TriggerEvent", () => {
    const event = normalizeNewFile({ entry: fileEntry, accountId: "dbid:abc" });
    expect(() => TriggerEventSchema.parse(event)).not.toThrow();
    expect(event.provider).toBe("dropbox");
    expect(event.eventType).toBe("new_file");
    expect(event.accountId).toBe("dbid:abc");
    expect(event.occurredAt).toBe("2026-05-24T10:00:00Z");
  });

  it("eventId is the stable new_file:{accountId}:{id}:{rev} identity", () => {
    expect(buildNewFileEventId("dbid:abc", fileEntry)).toBe(
      "new_file:dbid:abc:id:file1:0123abc",
    );
    expect(
      normalizeNewFile({ entry: fileEntry, accountId: "dbid:abc" }).eventId,
    ).toBe("new_file:dbid:abc:id:file1:0123abc");
  });

  it("emits the canonical payload (name/path/pathLower + metadata)", () => {
    const { payload } = normalizeNewFile({
      entry: fileEntry,
      accountId: "dbid:abc",
    });
    expect(payload).toEqual({
      changeKind: "new_file",
      id: "id:file1",
      name: "q1.pdf",
      path: "/Reports/q1.pdf",
      pathLower: "/reports/q1.pdf",
      rev: "0123abc",
      sizeBytes: 2048,
      clientModified: "2026-05-20T10:00:00Z",
      serverModified: "2026-05-24T10:00:00Z",
      accountId: "dbid:abc",
      isDownloadable: true,
    });
  });

  it("never includes bytes / content / download or shared links", () => {
    const { payload } = normalizeNewFile({
      entry: fileEntry,
      accountId: "dbid:abc",
    });
    for (const banned of [
      "content",
      "bytes",
      "base64",
      "url",
      "sharedUrl",
      "temporaryLink",
      "downloadUrl",
      "link",
    ]) {
      expect(payload).not.toHaveProperty(banned);
    }
  });

  it("null-fills missing optional fields + falls back occurredAt when no server_modified", () => {
    const minimal: DropboxFileEntry = {
      ".tag": "file",
      id: "id:x",
      name: "x.txt",
      path_display: "/x.txt",
    };
    const event = normalizeNewFile({ entry: minimal, accountId: "dbid:z" });
    expect(() => TriggerEventSchema.parse(event)).not.toThrow();
    expect(event.payload.sizeBytes).toBeNull();
    expect(event.payload.isDownloadable).toBeNull();
    expect(event.payload.rev).toBeNull();
    // occurredAt falls back to receipt time (non-empty ISO string).
    expect(typeof event.occurredAt).toBe("string");
    expect(event.occurredAt.length).toBeGreaterThan(0);
  });
});
