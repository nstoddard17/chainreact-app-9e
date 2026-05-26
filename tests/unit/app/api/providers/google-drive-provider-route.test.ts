/**
 * @jest-environment node
 *
 * Slice 4.GDRIVE-META-2 — Google Drive provider-route coverage.
 *
 * GET /api/providers/google-drive/actions returns the 5 actions in display
 * order with the full wire shape (folder pickers wired to
 * google-drive:folders, typeable fileId, destructive delete_file, sensitive
 * `list_files.files`, FileRef-deferred); GET .../triggers returns the
 * file_changed webhook trigger with both folder-shaped fields; the providers
 * index marks google-drive hasMetadata=true. No provider API calls (pure
 * registry read).
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
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

interface WireField {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  optionsSource?: string;
  dependsOn?: string | string[];
  options?: Array<{ value: string; label: string }>;
}
interface WireOutput {
  name: string;
  type: string;
  sensitive?: boolean;
  fields?: WireOutput[];
}
interface WireAction {
  key: string;
  category: string;
  requiresIntegration: boolean;
  isDestructive: boolean;
  requiresConfirmation: boolean;
  riskLevel: string;
  producesFileRef: boolean;
  consumesFileRef: boolean;
  fields: WireField[];
  outputs: WireOutput[];
}

async function fetchActions(): Promise<WireAction[]> {
  const res = await getActions(new Request("http://x/google-drive/actions"), {
    params: Promise.resolve({ id: "google-drive" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; actions: WireAction[] };
  expect(body.provider).toBe("google-drive");
  return body.actions;
}

describe("GET /api/providers/google-drive/actions", () => {
  it("returns the full 5-action surface in display order", async () => {
    const actions = await fetchActions();
    expect(actions.map((a) => a.key)).toEqual([
      "google-drive:upload_file",
      "google-drive:create_folder",
      "google-drive:list_files",
      "google-drive:move_file",
      "google-drive:delete_file",
    ]);
  });

  it("every action requiresIntegration + category files + FileRef deferred", async () => {
    for (const a of await fetchActions()) {
      expect(a.requiresIntegration).toBe(true);
      expect(a.category).toBe("files");
      expect(a.producesFileRef).toBe(false);
      expect(a.consumesFileRef).toBe(false);
    }
  });

  it("folder pickers wire to google-drive:folders (parentFolderId / folderId / newParentFolderId)", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const upload = byKey.get("google-drive:upload_file")!.fields.find((f) => f.name === "parentFolderId")!;
    expect(upload.optionsSource).toBe("google-drive:folders");
    const create = byKey.get("google-drive:create_folder")!.fields.find((f) => f.name === "parentFolderId")!;
    expect(create.optionsSource).toBe("google-drive:folders");
    const list = byKey.get("google-drive:list_files")!.fields.find((f) => f.name === "folderId")!;
    expect(list.optionsSource).toBe("google-drive:folders");
    const move = byKey.get("google-drive:move_file")!.fields.find((f) => f.name === "newParentFolderId")!;
    expect(move.optionsSource).toBe("google-drive:folders");
    expect(move.required).toBe(true);
  });

  it("fileId serializes as typeable text with no resolver (move/delete)", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    for (const key of ["google-drive:move_file", "google-drive:delete_file"]) {
      const fld = byKey.get(key)!.fields.find((f) => f.name === "fileId")!;
      expect(fld.type).toBe("text");
      expect(fld.optionsSource).toBeUndefined();
      expect(fld.required).toBe(true);
    }
  });

  it("delete_file is destructive + requires confirmation + high (both modes)", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const del = byKey.get("google-drive:delete_file")!;
    expect(del.isDestructive).toBe(true);
    expect(del.requiresConfirmation).toBe(true);
    expect(del.riskLevel).toBe("high");
    for (const key of [
      "google-drive:upload_file",
      "google-drive:create_folder",
      "google-drive:list_files",
      "google-drive:move_file",
    ]) {
      expect(byKey.get(key)!.isDestructive).toBe(false);
      expect(byKey.get(key)!.requiresConfirmation).toBe(false);
    }
  });

  it("upload_file.content serializes as textarea (FileRef deferred)", async () => {
    const upload = (await fetchActions()).find((a) => a.key === "google-drive:upload_file")!;
    const content = upload.fields.find((f) => f.name === "content")!;
    expect(content.type).toBe("textarea");
    expect(content.required).toBe(true);
  });

  it("list_files.files output serializes sensitive", async () => {
    const list = (await fetchActions()).find((a) => a.key === "google-drive:list_files")!;
    const files = list.outputs.find((o) => o.name === "files")!;
    expect(files.sensitive).toBe(true);
  });

  it("no action field references a deferred/rejected Drive resolver", async () => {
    for (const a of await fetchActions()) {
      for (const f of a.fields) {
        for (const resolver of [
          "google-drive:files",
          "google-drive:items",
          "google-drive:shared_drives",
        ]) {
          expect(f.optionsSource).not.toBe(resolver);
        }
      }
    }
  });
});

interface WireTrigger {
  key: string;
  type: string;
  activation: string;
  requiresIntegration: boolean;
  category: string;
  fields: WireField[];
  payloadShape: Array<{ name: string; type: string; sensitive?: boolean }>;
}

async function fetchTriggers(): Promise<WireTrigger[]> {
  const res = await getTriggers(new Request("http://x/google-drive/triggers"), {
    params: Promise.resolve({ id: "google-drive" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; triggers: WireTrigger[] };
  expect(body.provider).toBe("google-drive");
  return body.triggers;
}

describe("GET /api/providers/google-drive/triggers", () => {
  it("returns the 1 file_changed webhook trigger with two folder-shaped fields (fileId + folderId)", async () => {
    const triggers = await fetchTriggers();
    expect(triggers.map((t) => t.key)).toEqual(["google-drive:file_changed"]);
    const t = triggers[0]!;
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("files");
    const fileId = t.fields.find((f) => f.name === "fileId")!;
    const folderId = t.fields.find((f) => f.name === "folderId")!;
    expect(fileId.type).toBe("combobox");
    expect(fileId.optionsSource).toBe("google-drive:folders");
    expect(fileId.defaultValue).toBe("root");
    expect(folderId.type).toBe("combobox");
    expect(folderId.optionsSource).toBe("google-drive:folders");
  });

  it("no payload field is marked sensitive in v1 (Marcus decision — file name treated as title-like)", async () => {
    const t = (await fetchTriggers())[0]!;
    for (const p of t.payloadShape) {
      expect(p.sensitive).not.toBe(true);
    }
  });
});

describe("GET /api/providers — google-drive hasMetadata", () => {
  it("marks google-drive hasMetadata=true now that GDRIVE-META-2 shipped its metas", async () => {
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const drive = body.providers.find((p) => p.id === "google-drive");
    expect(drive).toBeDefined();
    expect(drive?.hasMetadata).toBe(true);
  });
});
