/**
 * @jest-environment node
 *
 * Slice 4.ONEDRIVE-META-3 — Microsoft OneDrive provider-route coverage.
 *
 * GET /api/providers/microsoft-onedrive/actions returns the 7 actions in
 * display order with the full wire shape (optionsSource / dependsOn / risk
 * / sensitive outputs); GET .../triggers returns the file_changed webhook
 * trigger (empty fields); the providers index marks microsoft-onedrive
 * hasMetadata=true. No provider API calls (pure registry read).
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
  producesFileRef: boolean;
  consumesFileRef: boolean;
  isDestructive: boolean;
  requiresConfirmation: boolean;
  riskLevel: string;
  fields: WireField[];
  outputs: WireOutput[];
}

async function fetchActions(): Promise<WireAction[]> {
  const res = await getActions(new Request("http://x/microsoft-onedrive/actions"), {
    params: Promise.resolve({ id: "microsoft-onedrive" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; actions: WireAction[] };
  expect(body.provider).toBe("microsoft-onedrive");
  return body.actions;
}

describe("GET /api/providers/microsoft-onedrive/actions", () => {
  it("returns the full 7-action surface in display order", async () => {
    const actions = await fetchActions();
    expect(actions.map((a) => a.key)).toEqual([
      "microsoft-onedrive:list_items",
      "microsoft-onedrive:get_file",
      "microsoft-onedrive:upload_file",
      "microsoft-onedrive:create_folder",
      "microsoft-onedrive:move_item",
      "microsoft-onedrive:copy_item",
      "microsoft-onedrive:delete_item",
    ]);
  });

  it("every action requiresIntegration + category files + no FileRef", async () => {
    for (const a of await fetchActions()) {
      expect(a.requiresIntegration).toBe(true);
      expect(a.category).toBe("files");
      expect(a.producesFileRef).toBe(false);
      expect(a.consumesFileRef).toBe(false);
    }
  });

  it("get_file.itemId is a FLAT microsoft-onedrive:files picker (no parent cascade)", async () => {
    // ONEDRIVE-GETFILE-DISCOVERY: get_file finds files DIRECTLY (root files first +
    // a bounded one-level folder descent), so its `itemId` is a flat picker with NO
    // `parentItemId` field and NO cascade dep. The old `folders → items` cascade hid
    // root files and files past the first folder, so get_file deliberately diverges
    // from the mutation actions' cascade (assert it explicitly so a regression to the
    // cascade — which would re-hide root files — fails here).
    const get = (await fetchActions()).find((a) => a.key === "microsoft-onedrive:get_file")!;
    expect(get.fields.find((f) => f.name === "parentItemId")).toBeUndefined();
    const itemId = get.fields.find((f) => f.name === "itemId")!;
    expect(itemId.optionsSource).toBe("microsoft-onedrive:files");
    expect(itemId.dependsOn).toBeUndefined();
  });

  it("mutation itemId fields are microsoft-onedrive:items dependsOn parentItemId (→ folders, no dep)", async () => {
    // The MUTATION actions keep the folder-scoped cascade: pick a source folder
    // (`parentItemId` → folders, no dep), then an item within it (`itemId` → items,
    // dependsOn parentItemId). get_file is intentionally excluded (flat picker above).
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    for (const key of [
      "microsoft-onedrive:move_item",
      "microsoft-onedrive:copy_item",
      "microsoft-onedrive:delete_item",
    ]) {
      const a = byKey.get(key)!;
      const parent = a.fields.find((f) => f.name === "parentItemId")!;
      expect(parent.optionsSource).toBe("microsoft-onedrive:folders");
      expect(parent.dependsOn).toBeUndefined();
      const itemId = a.fields.find((f) => f.name === "itemId")!;
      expect(itemId.optionsSource).toBe("microsoft-onedrive:items");
      expect(itemId.dependsOn).toBe("parentItemId");
    }
  });

  it("upload_file.content serializes as textarea (no FileRef claim)", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const upload = byKey.get("microsoft-onedrive:upload_file")!;
    expect(upload.fields.find((f) => f.name === "content")!.type).toBe("textarea");
    expect(upload.consumesFileRef).toBe(false);
  });

  it("delete_item serializes the destructive trio + high risk", async () => {
    const del = (await fetchActions()).find((a) => a.key === "microsoft-onedrive:delete_item")!;
    expect(del.isDestructive).toBe(true);
    expect(del.requiresConfirmation).toBe(true);
    expect(del.riskLevel).toBe("high");
  });

  it("read/write risk levels match the accepted taxonomy", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    for (const key of ["microsoft-onedrive:get_file", "microsoft-onedrive:list_items"]) {
      expect(byKey.get(key)!.riskLevel).toBe("low");
    }
    for (const key of [
      "microsoft-onedrive:upload_file",
      "microsoft-onedrive:create_folder",
      "microsoft-onedrive:move_item",
      "microsoft-onedrive:copy_item",
    ]) {
      expect(byKey.get(key)!.riskLevel).toBe("medium");
      expect(byKey.get(key)!.isDestructive).toBe(false);
    }
  });

  it("downloadUrl outputs serialize sensitive (top-level + nested)", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    expect(
      byKey.get("microsoft-onedrive:get_file")!.outputs.find((o) => o.name === "downloadUrl")!
        .sensitive,
    ).toBe(true);
    const items = byKey.get("microsoft-onedrive:list_items")!.outputs.find(
      (o) => o.name === "items",
    )!;
    expect(items.fields!.find((f) => f.name === "downloadUrl")!.sensitive).toBe(true);
  });

  it("no action field references microsoft-onedrive:drives", async () => {
    for (const a of await fetchActions()) {
      for (const f of a.fields) {
        expect(f.optionsSource).not.toBe("microsoft-onedrive:drives");
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
  const res = await getTriggers(new Request("http://x/microsoft-onedrive/triggers"), {
    params: Promise.resolve({ id: "microsoft-onedrive" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; triggers: WireTrigger[] };
  expect(body.provider).toBe("microsoft-onedrive");
  return body.triggers;
}

describe("GET /api/providers/microsoft-onedrive/triggers", () => {
  it("returns the 1 file_changed webhook trigger with empty fields", async () => {
    const triggers = await fetchTriggers();
    expect(triggers.map((t) => t.key)).toEqual(["microsoft-onedrive:file_changed"]);
    const t = triggers[0]!;
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("files");
    expect(t.fields).toEqual([]);
  });

  it("downloadUrl payload field serializes sensitive", async () => {
    const t = (await fetchTriggers())[0]!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    expect(byName.get("downloadUrl")!.sensitive).toBe(true);
    expect(byName.get("itemId")!.sensitive).not.toBe(true);
  });
});

describe("GET /api/providers — microsoft-onedrive hasMetadata", () => {
  it("marks microsoft-onedrive hasMetadata=true now that ONEDRIVE-META-3 shipped its metas", async () => {
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const onedrive = body.providers.find((p) => p.id === "microsoft-onedrive");
    expect(onedrive).toBeDefined();
    expect(onedrive?.hasMetadata).toBe(true);
  });
});
