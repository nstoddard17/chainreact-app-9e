/**
 * @jest-environment node
 *
 * Slice 3.DROPBOX-4 — Dropbox provider-route coverage.
 *
 * GET /api/providers/dropbox/actions returns the 11 actions in display
 * order with the full wire shape (optionsSource / dependsOn / options /
 * risk / FileRef / category); GET .../triggers returns [] (triggers staged
 * for DROPBOX-5); the providers index marks dropbox hasMetadata=true.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

import { GET as getProviders } from "@/app/api/providers/route";
import { GET as getActions } from "@/app/api/providers/[id]/actions/route";
import { GET as getTriggers } from "@/app/api/providers/[id]/triggers/route";

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
});

interface WireField {
  name: string;
  type: string;
  required: boolean;
  optionsSource?: string;
  dependsOn?: string;
  options?: Array<{ value: string; label: string }>;
}
interface WireAction {
  key: string;
  category: string;
  requiresIntegration: boolean;
  producesFileRef: boolean;
  consumesFileRef: boolean;
  isDestructive: boolean;
  requiresConfirmation: boolean;
  riskLevel: string;
  fields: WireField[];
  outputs: Array<{ name: string; type: string; sensitive?: boolean }>;
}

async function fetchDropboxActions(): Promise<WireAction[]> {
  const res = await getActions(new Request("http://x/dropbox/actions"), {
    params: Promise.resolve({ id: "dropbox" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; actions: WireAction[] };
  expect(body.provider).toBe("dropbox");
  return body.actions;
}

describe("GET /api/providers/dropbox/actions", () => {
  it("returns the full 11-action surface in display order", async () => {
    const actions = await fetchDropboxActions();
    expect(actions.map((a) => a.key)).toEqual([
      "dropbox:upload_file",
      "dropbox:download_file",
      "dropbox:list_folder",
      "dropbox:search_files",
      "dropbox:get_file_metadata",
      "dropbox:create_folder",
      "dropbox:move_file",
      "dropbox:copy_file",
      "dropbox:create_shared_link",
      "dropbox:get_temporary_link",
      "dropbox:delete_file",
    ]);
  });

  it("every action requiresIntegration + category files", async () => {
    for (const a of await fetchDropboxActions()) {
      expect(a.requiresIntegration).toBe(true);
      expect(a.category).toBe("files");
    }
  });

  it("delete_file serializes the destructive trio + high risk", async () => {
    const byKey = new Map((await fetchDropboxActions()).map((a) => [a.key, a]));
    const del = byKey.get("dropbox:delete_file")!;
    expect(del.isDestructive).toBe(true);
    expect(del.requiresConfirmation).toBe(true);
    expect(del.riskLevel).toBe("high");
  });

  it("file actions serialize producesFileRef / consumesFileRef", async () => {
    const byKey = new Map((await fetchDropboxActions()).map((a) => [a.key, a]));
    const upload = byKey.get("dropbox:upload_file")!;
    const download = byKey.get("dropbox:download_file")!;
    const temp = byKey.get("dropbox:get_temporary_link")!;
    expect(upload.consumesFileRef).toBe(true);
    expect(upload.producesFileRef).toBe(false);
    expect(download.producesFileRef).toBe(true);
    expect(download.consumesFileRef).toBe(false);
    expect(temp.producesFileRef).toBe(true);
  });

  it("serializes the folderPath → path file cascade (optionsSource + dependsOn round-trip)", async () => {
    const byKey = new Map((await fetchDropboxActions()).map((a) => [a.key, a]));
    const download = byKey.get("dropbox:download_file")!;
    const folder = download.fields.find((f) => f.name === "folderPath")!;
    const file = download.fields.find((f) => f.name === "path")!;
    expect(folder.optionsSource).toBe("dropbox:folders");
    expect(folder.dependsOn).toBeUndefined();
    expect(file.optionsSource).toBe("dropbox:files");
    expect(file.dependsOn).toBe("folderPath");
  });

  it("serializes static enum options (upload_file mode) + numeric/text fields", async () => {
    const byKey = new Map((await fetchDropboxActions()).map((a) => [a.key, a]));
    const upload = byKey.get("dropbox:upload_file")!;
    const mode = upload.fields.find((f) => f.name === "mode")!;
    expect(mode.type).toBe("select");
    expect(mode.options?.map((o) => o.value).sort()).toEqual(["add", "overwrite"]);
    const list = byKey.get("dropbox:list_folder")!;
    const limit = list.fields.find((f) => f.name === "limit")!;
    expect(limit.type).toBe("number");
    const createFolder = byKey.get("dropbox:create_folder")!;
    const path = createFolder.fields.find((f) => f.name === "path")!;
    expect(path.type).toBe("text");
    expect(path.optionsSource).toBeUndefined();
  });

  it("sensitive output flags round-trip through the wire (shared link URL + paths)", async () => {
    const byKey = new Map((await fetchDropboxActions()).map((a) => [a.key, a]));
    const shared = byKey.get("dropbox:create_shared_link")!;
    expect(shared.outputs.find((o) => o.name === "sharedUrl")!.sensitive).toBe(true);
    expect(shared.outputs.find((o) => o.name === "path")!.sensitive).toBe(true);
  });
});

describe("GET /api/providers/dropbox/triggers", () => {
  it("returns [] — Dropbox triggers are staged for DROPBOX-5", async () => {
    const res = await getTriggers(new Request("http://x/dropbox/triggers"), {
      params: Promise.resolve({ id: "dropbox" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider: string; triggers: unknown[] };
    expect(body.provider).toBe("dropbox");
    expect(body.triggers).toEqual([]);
  });
});

describe("GET /api/providers — dropbox hasMetadata", () => {
  it("marks dropbox hasMetadata=true now that DROPBOX-4 shipped its metas", async () => {
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const dropbox = body.providers.find((p) => p.id === "dropbox");
    expect(dropbox).toBeDefined();
    expect(dropbox?.hasMetadata).toBe(true);
  });
});
