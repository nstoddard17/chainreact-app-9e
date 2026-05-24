/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-6 — Monday provider-route coverage.
 *
 * GET /api/providers/monday/actions returns the 24 actions in display
 * order with the full wire shape; GET .../triggers returns [] (staged
 * for MONDAY-7); the providers index marks monday hasMetadata=true.
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
}

async function fetchMondayActions(): Promise<WireAction[]> {
  const res = await getActions(new Request("http://x/monday/actions"), {
    params: Promise.resolve({ id: "monday" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; actions: WireAction[] };
  expect(body.provider).toBe("monday");
  return body.actions;
}

describe("GET /api/providers/monday/actions", () => {
  it("returns the full 24-action surface in display order", async () => {
    const actions = await fetchMondayActions();
    expect(actions.map((a) => a.key)).toEqual([
      "monday:create_item",
      "monday:update_item",
      "monday:get_item",
      "monday:list_items",
      "monday:search_items",
      "monday:move_item",
      "monday:duplicate_item",
      "monday:archive_item",
      "monday:delete_item",
      "monday:create_subitem",
      "monday:list_subitems",
      "monday:create_update",
      "monday:list_updates",
      "monday:list_boards",
      "monday:get_board",
      "monday:create_board",
      "monday:duplicate_board",
      "monday:create_group",
      "monday:list_groups",
      "monday:add_column",
      "monday:list_users",
      "monday:get_user",
      "monday:add_file",
      "monday:download_file",
    ]);
  });

  it("every action requiresIntegration", async () => {
    const actions = await fetchMondayActions();
    for (const a of actions) expect(a.requiresIntegration).toBe(true);
  });

  it("delete_item serializes the destructive trio + high risk", async () => {
    const byKey = new Map((await fetchMondayActions()).map((a) => [a.key, a]));
    const del = byKey.get("monday:delete_item")!;
    expect(del.isDestructive).toBe(true);
    expect(del.requiresConfirmation).toBe(true);
    expect(del.riskLevel).toBe("high");
  });

  it("file actions serialize producesFileRef / consumesFileRef + files category", async () => {
    const byKey = new Map((await fetchMondayActions()).map((a) => [a.key, a]));
    const add = byKey.get("monday:add_file")!;
    const dl = byKey.get("monday:download_file")!;
    expect(add.consumesFileRef).toBe(true);
    expect(add.producesFileRef).toBe(false);
    expect(add.category).toBe("files");
    expect(dl.producesFileRef).toBe(true);
    expect(dl.consumesFileRef).toBe(false);
    expect(dl.category).toBe("files");
  });

  it("serializes optionsSource + dependsOn cascades on resolver-backed fields", async () => {
    const byKey = new Map((await fetchMondayActions()).map((a) => [a.key, a]));
    const createItem = byKey.get("monday:create_item")!;
    const group = createItem.fields.find((f) => f.name === "groupId")!;
    expect(group.optionsSource).toBe("monday:groups");
    expect(group.dependsOn).toBe("boardId");

    const download = byKey.get("monday:download_file")!;
    const fileId = download.fields.find((f) => f.name === "fileId")!;
    expect(fileId.optionsSource).toBe("monday:item_files");
    expect(fileId.dependsOn).toBe("columnId");
  });

  it("serializes static enum options (create_board boardKind) + textarea JSON fields (create_item columnValues)", async () => {
    const byKey = new Map((await fetchMondayActions()).map((a) => [a.key, a]));
    const createBoard = byKey.get("monday:create_board")!;
    const kind = createBoard.fields.find((f) => f.name === "boardKind")!;
    expect(kind.type).toBe("select");
    expect(kind.options?.map((o) => o.value).sort()).toEqual([
      "private",
      "public",
      "share",
    ]);
    const createItem = byKey.get("monday:create_item")!;
    const cv = createItem.fields.find((f) => f.name === "columnValues")!;
    expect(cv.type).toBe("textarea");
  });
});

describe("GET /api/providers/monday/triggers", () => {
  it("returns [] — triggers staged for MONDAY-7", async () => {
    const res = await getTriggers(new Request("http://x/monday/triggers"), {
      params: Promise.resolve({ id: "monday" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider: string; triggers: unknown[] };
    expect(body.provider).toBe("monday");
    expect(body.triggers).toEqual([]);
  });
});

describe("GET /api/providers — monday hasMetadata", () => {
  it("marks monday hasMetadata=true now that MONDAY-6 shipped its metas", async () => {
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const monday = body.providers.find((p) => p.id === "monday");
    expect(monday).toBeDefined();
    expect(monday?.hasMetadata).toBe(true);
  });
});
