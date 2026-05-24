/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-4 — GraphQL-variables-shape coverage for the new
 * per-operation wrappers. Mocks the shared `mondayRequest` layer and
 * asserts each wrapper sends the right variables + unwraps the right
 * field. The transport/error behavior of `mondayRequest` itself is
 * covered by `_request.test.ts` (MONDAY-2).
 */
const mockMondayRequest = jest.fn();

jest.mock("@/integrations/_shared/monday/api/_request", () => ({
  mondayRequest: (...args: unknown[]) => mockMondayRequest(...args),
  mondayApiBase: () => "https://api.monday.com",
}));

import { itemsArchive } from "@/integrations/_shared/monday/api/itemsArchive";
import { itemsDuplicate } from "@/integrations/_shared/monday/api/itemsDuplicate";
import { boardsCreate } from "@/integrations/_shared/monday/api/boardsCreate";
import { boardsDuplicate } from "@/integrations/_shared/monday/api/boardsDuplicate";
import { boardsGet } from "@/integrations/_shared/monday/api/boardsGet";
import { groupsCreate } from "@/integrations/_shared/monday/api/groupsCreate";
import { columnsCreate } from "@/integrations/_shared/monday/api/columnsCreate";
import { itemsSearchByColumnValues } from "@/integrations/_shared/monday/api/itemsSearchByColumnValues";
import { subitemsList } from "@/integrations/_shared/monday/api/subitemsList";
import { updatesList } from "@/integrations/_shared/monday/api/updatesList";
import { usersGet } from "@/integrations/_shared/monday/api/usersGet";
import { groupsList } from "@/integrations/_shared/monday/api/groupsList";

beforeEach(() => {
  mockMondayRequest.mockReset();
});

function lastVars() {
  return mockMondayRequest.mock.calls[0]![0].variables;
}

describe("itemsArchive", () => {
  it("sends itemId; unwraps archive_item", async () => {
    mockMondayRequest.mockResolvedValueOnce({ archive_item: { id: "i" } });
    const out = await itemsArchive({ accessToken: "t", itemId: "i-1" });
    expect(lastVars()).toEqual({ itemId: "i-1" });
    expect(out.id).toBe("i");
  });
});

describe("itemsDuplicate", () => {
  it("sends boardId/itemId/withUpdates; unwraps duplicate_item", async () => {
    mockMondayRequest.mockResolvedValueOnce({
      duplicate_item: { id: "n", name: null, board: null, group: null, created_at: null },
    });
    await itemsDuplicate({
      accessToken: "t",
      boardId: "b",
      itemId: "i",
      withUpdates: true,
    });
    expect(lastVars()).toEqual({ boardId: "b", itemId: "i", withUpdates: true });
  });
});

describe("boardsCreate", () => {
  it("omits description variable when absent", async () => {
    mockMondayRequest.mockResolvedValueOnce({
      create_board: { id: "b", name: "B", description: null, board_kind: "public" },
    });
    await boardsCreate({ accessToken: "t", boardName: "B", boardKind: "public" });
    expect(lastVars()).toEqual({ boardName: "B", boardKind: "public" });
  });

  it("includes description variable when present", async () => {
    mockMondayRequest.mockResolvedValueOnce({
      create_board: { id: "b", name: "B", description: "d", board_kind: "private" },
    });
    await boardsCreate({
      accessToken: "t",
      boardName: "B",
      boardKind: "private",
      description: "d",
    });
    expect(lastVars()).toEqual({
      boardName: "B",
      boardKind: "private",
      description: "d",
    });
  });
});

describe("boardsDuplicate", () => {
  it("sends duplicateType; unwraps nested board", async () => {
    mockMondayRequest.mockResolvedValueOnce({
      duplicate_board: {
        board: { id: "nb", name: "Copy", description: null, board_kind: "public" },
      },
    });
    const out = await boardsDuplicate({
      accessToken: "t",
      boardId: "b",
      duplicateType: "duplicate_board_with_structure",
    });
    expect(lastVars()).toEqual({
      boardId: "b",
      duplicateType: "duplicate_board_with_structure",
    });
    expect(out.id).toBe("nb");
  });

  it("throws when duplicate_board returns no board", async () => {
    mockMondayRequest.mockResolvedValueOnce({ duplicate_board: { board: null } });
    await expect(
      boardsDuplicate({
        accessToken: "t",
        boardId: "b",
        duplicateType: "duplicate_board_with_structure",
      }),
    ).rejects.toThrow(/no board/);
  });
});

describe("boardsGet", () => {
  it("sends boardId as array; returns first board or null", async () => {
    mockMondayRequest.mockResolvedValueOnce({ boards: [{ id: "b", columns: [], groups: [] }] });
    const out = await boardsGet({ accessToken: "t", boardId: "b" });
    expect(lastVars()).toEqual({ boardId: ["b"] });
    expect(out?.id).toBe("b");

    mockMondayRequest.mockResolvedValueOnce({ boards: [] });
    const none = await boardsGet({ accessToken: "t", boardId: "x" });
    expect(none).toBeNull();
  });
});

describe("groupsCreate", () => {
  it("maps groupTitle → groupName; omits color when absent", async () => {
    mockMondayRequest.mockResolvedValueOnce({
      create_group: { id: "g", title: "G", color: null },
    });
    await groupsCreate({ accessToken: "t", boardId: "b", groupTitle: "G" });
    expect(lastVars()).toEqual({ boardId: "b", groupName: "G" });
  });

  it("includes groupColor when present", async () => {
    mockMondayRequest.mockResolvedValueOnce({
      create_group: { id: "g", title: "G", color: "#fff" },
    });
    await groupsCreate({
      accessToken: "t",
      boardId: "b",
      groupTitle: "G",
      color: "#fff",
    });
    expect(lastVars()).toEqual({ boardId: "b", groupName: "G", groupColor: "#fff" });
  });
});

describe("columnsCreate", () => {
  it("omits defaults when absent", async () => {
    mockMondayRequest.mockResolvedValueOnce({
      create_column: { id: "c", title: "T", type: "text" },
    });
    await columnsCreate({
      accessToken: "t",
      boardId: "b",
      title: "T",
      columnType: "text",
    });
    expect(lastVars()).toEqual({ boardId: "b", title: "T", columnType: "text" });
  });

  it("includes defaults JSON when present", async () => {
    mockMondayRequest.mockResolvedValueOnce({
      create_column: { id: "c", title: "T", type: "status" },
    });
    await columnsCreate({
      accessToken: "t",
      boardId: "b",
      title: "T",
      columnType: "status",
      defaultsJson: '{"labels":{}}',
    });
    expect(lastVars()).toEqual({
      boardId: "b",
      title: "T",
      columnType: "status",
      defaults: '{"labels":{}}',
    });
  });
});

describe("itemsSearchByColumnValues", () => {
  it("sends boardId/columnId/columnValue/limit; unwraps items", async () => {
    mockMondayRequest.mockResolvedValueOnce({
      items_page_by_column_values: { cursor: "c", items: [{ id: "i" }] },
    });
    const out = await itemsSearchByColumnValues({
      accessToken: "t",
      boardId: "b",
      columnId: "status",
      columnValue: "Done",
      limit: 25,
    });
    expect(lastVars()).toEqual({
      boardId: "b",
      columnId: "status",
      columnValue: "Done",
      limit: 25,
    });
    expect(out.items).toHaveLength(1);
    expect(out.cursor).toBe("c");
  });
});

describe("subitemsList", () => {
  it("sends itemId as array; returns null when item missing", async () => {
    mockMondayRequest.mockResolvedValueOnce({ items: [] });
    const out = await subitemsList({ accessToken: "t", parentItemId: "p" });
    expect(lastVars()).toEqual({ itemId: ["p"] });
    expect(out).toBeNull();
  });

  it("returns parent + subitems when present", async () => {
    mockMondayRequest.mockResolvedValueOnce({
      items: [{ id: "p", name: "P", subitems: [{ id: "s" }] }],
    });
    const out = await subitemsList({ accessToken: "t", parentItemId: "p" });
    expect(out?.parentItemId).toBe("p");
    expect(out?.subitems).toHaveLength(1);
  });
});

describe("updatesList", () => {
  it("sends itemId array + limit; returns null when item missing", async () => {
    mockMondayRequest.mockResolvedValueOnce({ items: [] });
    const out = await updatesList({ accessToken: "t", itemId: "i", limit: 10 });
    expect(lastVars()).toEqual({ itemId: ["i"], limit: 10 });
    expect(out).toBeNull();
  });
});

describe("usersGet", () => {
  it("sends userId as array; returns first user or null", async () => {
    mockMondayRequest.mockResolvedValueOnce({ users: [{ id: "u" }] });
    const out = await usersGet({ accessToken: "t", userId: "u" });
    expect(lastVars()).toEqual({ userId: ["u"] });
    expect(out?.id).toBe("u");
  });
});

describe("groupsList (MONDAY-4 detail fields)", () => {
  it("sends boardId; returns groups + boardFound", async () => {
    mockMondayRequest.mockResolvedValueOnce({
      boards: [
        {
          id: "b",
          groups: [
            { id: "g", title: "G", color: "#fff", position: "1", archived: false },
          ],
        },
      ],
    });
    const out = await groupsList({ accessToken: "t", boardId: "b" });
    expect(lastVars()).toEqual({ boardId: "b" });
    expect(out.boardFound).toBe(true);
    expect(out.groups[0]).toMatchObject({
      id: "g",
      title: "G",
      color: "#fff",
      position: "1",
      archived: false,
    });
  });

  it("boardFound=false when board absent", async () => {
    mockMondayRequest.mockResolvedValueOnce({ boards: [] });
    const out = await groupsList({ accessToken: "t", boardId: "x" });
    expect(out.boardFound).toBe(false);
    expect(out.groups).toEqual([]);
  });
});
