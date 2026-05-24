/**
 * @jest-environment node
 *
 * Tests for the Dropbox API wrappers — Slice 3.DROPBOX-2. Mocks the
 * `_request` transport and asserts each wrapper's endpoint + args shape +
 * response flattening.
 */
const mockRpc = jest.fn();
const mockDownload = jest.fn();
const mockUpload = jest.fn();

jest.mock("@/integrations/_shared/dropbox/api/_request", () => ({
  dropboxRpc: (...args: unknown[]) => mockRpc(...args),
  dropboxContentDownload: (...args: unknown[]) => mockDownload(...args),
  dropboxContentUpload: (...args: unknown[]) => mockUpload(...args),
}));

import { currentAccountGet } from "@/integrations/_shared/dropbox/api/currentAccountGet";
import { filesUpload } from "@/integrations/_shared/dropbox/api/filesUpload";
import { filesDownload } from "@/integrations/_shared/dropbox/api/filesDownload";
import { filesListFolder } from "@/integrations/_shared/dropbox/api/filesListFolder";
import { filesSearch } from "@/integrations/_shared/dropbox/api/filesSearch";
import { filesCreateFolder } from "@/integrations/_shared/dropbox/api/filesCreateFolder";
import { filesMove } from "@/integrations/_shared/dropbox/api/filesMove";
import { filesDelete } from "@/integrations/_shared/dropbox/api/filesDelete";
import { sharingCreateSharedLink } from "@/integrations/_shared/dropbox/api/sharingCreateSharedLink";
import { sharingListSharedLinks } from "@/integrations/_shared/dropbox/api/sharingListSharedLinks";
import { filesGetTemporaryLink } from "@/integrations/_shared/dropbox/api/filesGetTemporaryLink";

beforeEach(() => {
  mockRpc.mockReset();
  mockDownload.mockReset();
  mockUpload.mockReset();
});

describe("currentAccountGet", () => {
  it("calls the no-arg get_current_account endpoint with null args", async () => {
    mockRpc.mockResolvedValueOnce({ account_id: "dbid:1" });
    await currentAccountGet({ accessToken: "t" });
    expect(mockRpc.mock.calls[0]![0]).toMatchObject({
      endpoint: "/2/users/get_current_account",
      args: null,
    });
  });
});

describe("filesUpload", () => {
  it("uploads via content host with mode/autorename/mute args", async () => {
    mockUpload.mockResolvedValueOnce({ id: "id:1" });
    await filesUpload({
      accessToken: "t",
      path: "/a.txt",
      bytes: new Uint8Array([1]),
      mode: "overwrite",
      autorename: true,
    });
    expect(mockUpload.mock.calls[0]![0]).toMatchObject({
      endpoint: "/2/files/upload",
      args: { path: "/a.txt", mode: "overwrite", autorename: true, mute: false },
    });
  });

  it("defaults mode to 'add' and autorename to false", async () => {
    mockUpload.mockResolvedValueOnce({ id: "id:1" });
    await filesUpload({ accessToken: "t", path: "/a.txt", bytes: new Uint8Array([1]) });
    expect(mockUpload.mock.calls[0]![0].args).toMatchObject({
      mode: "add",
      autorename: false,
    });
  });
});

describe("filesDownload", () => {
  it("returns bytes + metadata from the content-download result", async () => {
    mockDownload.mockResolvedValueOnce({
      bytes: new Uint8Array([5]),
      result: { name: "a.txt", size: 1 },
    });
    const out = await filesDownload({ accessToken: "t", path: "/a.txt" });
    expect(Array.from(out.bytes)).toEqual([5]);
    expect(out.metadata).toEqual({ name: "a.txt", size: 1 });
    expect(mockDownload.mock.calls[0]![0]).toMatchObject({
      endpoint: "/2/files/download",
      args: { path: "/a.txt" },
    });
  });
});

describe("filesListFolder", () => {
  it("uses list_folder with path/recursive when no cursor", async () => {
    mockRpc.mockResolvedValueOnce({ entries: [], cursor: "c", has_more: false });
    await filesListFolder({ accessToken: "t", path: "/Reports", recursive: true });
    expect(mockRpc.mock.calls[0]![0]).toMatchObject({
      endpoint: "/2/files/list_folder",
      args: { path: "/Reports", recursive: true },
    });
  });

  it("uses list_folder/continue when a cursor is supplied", async () => {
    mockRpc.mockResolvedValueOnce({ entries: [], cursor: "c2", has_more: false });
    await filesListFolder({ accessToken: "t", cursor: "prev-cursor" });
    expect(mockRpc.mock.calls[0]![0]).toMatchObject({
      endpoint: "/2/files/list_folder/continue",
      args: { cursor: "prev-cursor" },
    });
  });
});

describe("filesSearch", () => {
  it("flattens search_v2 matches[].metadata.metadata into entries[]", async () => {
    mockRpc.mockResolvedValueOnce({
      matches: [
        { metadata: { metadata: { id: "id:1", name: "a" } } },
        { metadata: { metadata: { id: "id:2", name: "b" } } },
      ],
      has_more: true,
      cursor: "c",
    });
    const out = await filesSearch({ accessToken: "t", query: "report" });
    expect(out.entries.map((e) => e.id)).toEqual(["id:1", "id:2"]);
    expect(out.hasMore).toBe(true);
    expect(out.cursor).toBe("c");
  });
});

describe("filesCreateFolder / filesMove / filesDelete unwrap metadata", () => {
  it("createFolder returns res.metadata", async () => {
    mockRpc.mockResolvedValueOnce({ metadata: { id: "id:f", name: "New" } });
    const e = await filesCreateFolder({ accessToken: "t", path: "/New" });
    expect(e).toEqual({ id: "id:f", name: "New" });
  });

  it("move passes from_path/to_path and returns metadata", async () => {
    mockRpc.mockResolvedValueOnce({ metadata: { id: "id:m" } });
    await filesMove({ accessToken: "t", fromPath: "/a", toPath: "/b" });
    expect(mockRpc.mock.calls[0]![0]).toMatchObject({
      endpoint: "/2/files/move_v2",
      args: { from_path: "/a", to_path: "/b", autorename: false },
    });
  });

  it("delete returns metadata", async () => {
    mockRpc.mockResolvedValueOnce({ metadata: { id: "id:d" } });
    const e = await filesDelete({ accessToken: "t", path: "/x" });
    expect(e).toEqual({ id: "id:d" });
  });
});

describe("sharing wrappers", () => {
  it("createSharedLink calls create_shared_link_with_settings", async () => {
    mockRpc.mockResolvedValueOnce({ url: "https://db/x", id: "id:s" });
    const link = await sharingCreateSharedLink({ accessToken: "t", path: "/x" });
    expect(link.url).toBe("https://db/x");
    expect(mockRpc.mock.calls[0]![0]).toMatchObject({
      endpoint: "/2/sharing/create_shared_link_with_settings",
      args: { path: "/x" },
    });
  });

  it("listSharedLinks returns links[] with direct_only", async () => {
    mockRpc.mockResolvedValueOnce({ links: [{ url: "https://db/y" }] });
    const links = await sharingListSharedLinks({ accessToken: "t", path: "/y" });
    expect(links).toEqual([{ url: "https://db/y" }]);
    expect(mockRpc.mock.calls[0]![0].args).toMatchObject({
      path: "/y",
      direct_only: true,
    });
  });
});

describe("filesGetTemporaryLink", () => {
  it("returns the link + metadata", async () => {
    mockRpc.mockResolvedValueOnce({
      link: "https://db/tmp",
      metadata: { name: "a.txt" },
    });
    const out = await filesGetTemporaryLink({ accessToken: "t", path: "/a.txt" });
    expect(out.link).toBe("https://db/tmp");
    expect(out.metadata).toEqual({ name: "a.txt" });
  });

  it("throws when Dropbox returns no link", async () => {
    mockRpc.mockResolvedValueOnce({ metadata: {} });
    await expect(
      filesGetTemporaryLink({ accessToken: "t", path: "/a.txt" }),
    ).rejects.toThrow(/no link/);
  });
});
