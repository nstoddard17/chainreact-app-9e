/**
 * @jest-environment node
 *
 * Slice 4.TRELLO-META-3 — Trello provider-route coverage.
 *
 * GET /api/providers/trello/actions returns the 8 actions in display
 * order with the full wire shape (optionsSource / dependsOn / risk /
 * sensitive outputs); GET .../triggers returns the 6 webhook triggers;
 * the providers index marks trello hasMetadata=true. No provider API
 * calls (pure registry read).
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
  dependsOn?: string | string[];
  multiple?: boolean;
  options?: Array<{ value: string; label: string }>;
}
interface WireOutput {
  name: string;
  type: string;
  sensitive?: boolean;
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
  const res = await getActions(new Request("http://x/trello/actions"), {
    params: Promise.resolve({ id: "trello" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; actions: WireAction[] };
  expect(body.provider).toBe("trello");
  return body.actions;
}

describe("GET /api/providers/trello/actions", () => {
  it("returns the full 8-action surface in display order", async () => {
    const actions = await fetchActions();
    expect(actions.map((a) => a.key)).toEqual([
      "trello:create_card",
      "trello:update_card",
      "trello:move_card",
      "trello:archive_card",
      "trello:add_comment",
      "trello:add_label_to_card",
      "trello:create_list",
      "trello:create_board",
    ]);
  });

  it("every action requiresIntegration + category data", async () => {
    for (const a of await fetchActions()) {
      expect(a.requiresIntegration).toBe(true);
      expect(a.category).toBe("data");
    }
  });

  it("create_card wires boardId → lists/members/labels cascade", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const create = byKey.get("trello:create_card")!;
    const board = create.fields.find((f) => f.name === "boardId")!;
    expect(board.type).toBe("combobox");
    expect(board.optionsSource).toBe("trello:boards");
    expect(board.dependsOn).toBeUndefined();
    expect(board.required).toBe(false);
    expect(create.fields.find((f) => f.name === "listId")).toMatchObject({
      optionsSource: "trello:lists",
      dependsOn: "boardId",
    });
    expect(create.fields.find((f) => f.name === "idMembers")).toMatchObject({
      optionsSource: "trello:members",
      dependsOn: "boardId",
      multiple: true,
    });
    expect(create.fields.find((f) => f.name === "idLabels")).toMatchObject({
      optionsSource: "trello:labels",
      dependsOn: "boardId",
      multiple: true,
    });
  });

  it("cardId fields are trello:cards dependsOn boardId", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    for (const key of [
      "trello:update_card",
      "trello:move_card",
      "trello:archive_card",
      "trello:add_comment",
      "trello:add_label_to_card",
    ]) {
      const cardId = byKey.get(key)!.fields.find((f) => f.name === "cardId")!;
      expect(cardId.optionsSource).toBe("trello:cards");
      expect(cardId.dependsOn).toBe("boardId");
    }
  });

  it("create_list.idBoard is the real board field → trello:boards (no dep)", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const idBoard = byKey.get("trello:create_list")!.fields.find(
      (f) => f.name === "idBoard",
    )!;
    expect(idBoard.optionsSource).toBe("trello:boards");
    expect(idBoard.dependsOn).toBeUndefined();
    expect(idBoard.required).toBe(true);
  });

  it("create_board.visibility serializes a required select incl. public + warning text", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const v = byKey.get("trello:create_board")!.fields.find(
      (f) => f.name === "visibility",
    )!;
    expect(v.type).toBe("select");
    expect(v.required).toBe(true);
    expect(v.options!.map((o) => o.value)).toEqual([
      "private",
      "workspace",
      "public",
    ]);
  });

  it("every action is medium risk; none destructive / requiresConfirmation", async () => {
    for (const a of await fetchActions()) {
      expect(a.riskLevel).toBe("medium");
      expect(a.isDestructive).toBe(false);
      expect(a.requiresConfirmation).toBe(false);
    }
  });

  it("add_comment.text + desc outputs serialize sensitive", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    expect(
      byKey.get("trello:add_comment")!.outputs.find((o) => o.name === "text")!
        .sensitive,
    ).toBe(true);
    expect(
      byKey.get("trello:create_card")!.outputs.find((o) => o.name === "desc")!
        .sensitive,
    ).toBe(true);
  });

  it("no action field references a rejected checklist resolver", async () => {
    for (const a of await fetchActions()) {
      for (const f of a.fields) {
        expect(f.optionsSource).not.toBe("trello:checklists");
        expect(f.optionsSource).not.toBe("trello:check_items");
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
  const res = await getTriggers(new Request("http://x/trello/triggers"), {
    params: Promise.resolve({ id: "trello" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; triggers: WireTrigger[] };
  expect(body.provider).toBe("trello");
  return body.triggers;
}

describe("GET /api/providers/trello/triggers", () => {
  it("returns the 6 webhook triggers in display order", async () => {
    const triggers = await fetchTriggers();
    expect(triggers.map((t) => t.key)).toEqual([
      "trello:new_card",
      "trello:card_updated",
      "trello:card_moved",
      "trello:comment_added",
      "trello:member_changed",
      "trello:card_archived",
    ]);
    for (const t of triggers) {
      expect(t.activation).toBe("webhook");
      expect(t.requiresIntegration).toBe(true);
      expect(t.category).toBe("data");
    }
  });

  it("each trigger's boardId picker → trello:boards (required, no dep)", async () => {
    for (const t of await fetchTriggers()) {
      const board = t.fields.find((f) => f.name === "boardId")!;
      expect(board.optionsSource).toBe("trello:boards");
      expect(board.required).toBe(true);
      expect(board.dependsOn).toBeUndefined();
    }
  });

  it("content payload fields serialize sensitive; ids do not", async () => {
    const t = (await fetchTriggers())[0]!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    for (const name of ["cardDesc", "commentText", "oldValues", "body"]) {
      expect(byName.get(name)!.sensitive).toBe(true);
    }
    for (const name of ["cardId", "boardId", "actionType"]) {
      expect(byName.get(name)!.sensitive).not.toBe(true);
    }
  });
});

describe("GET /api/providers — trello hasMetadata", () => {
  it("marks trello hasMetadata=true now that TRELLO-META-3 shipped its metas", async () => {
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const trello = body.providers.find((p) => p.id === "trello");
    expect(trello).toBeDefined();
    expect(trello?.hasMetadata).toBe(true);
  });
});
