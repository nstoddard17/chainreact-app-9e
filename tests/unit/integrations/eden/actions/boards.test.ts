/**
 * @jest-environment node
 *
 * Eden Batch-2 board actions (EDEN-5). Mocks the board/item API wrappers + refreshAndRetry.
 */
const mockRefreshAndRetry = jest.fn(async ({ apiCall }: { apiCall: (t: string) => Promise<unknown> }) => apiCall("tok"));
jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (a: unknown) => mockRefreshAndRetry(a as { apiCall: (t: string) => Promise<unknown> }),
}));
const boardsApi = { listBoards: jest.fn(), renameBoard: jest.fn(), saveLinksToBoard: jest.fn() };
jest.mock("@/integrations/_shared/eden/api/boards", () => boardsApi);
const itemsApi = { listWorkspaceItems: jest.fn(), searchWorkspaceItems: jest.fn() };
jest.mock("@/integrations/_shared/eden/api/items", () => itemsApi);

import { edenListBoards } from "@/integrations/eden/actions/boards/listBoards";
import { edenListBoardItems } from "@/integrations/eden/actions/boards/listBoardItems";
import { edenRenameBoard } from "@/integrations/eden/actions/boards/renameBoard";
import { edenSaveLinksToBoard } from "@/integrations/eden/actions/boards/saveLinksToBoard";
import { SaveLinksToBoardConfigSchema } from "@/integrations/eden/actions/boards/saveLinksToBoard.schema";

const base = { workflowId: "wf", userId: "u", accountId: "acct-1", runId: "r", nodeId: "n", triggerEvent: {} as never };
beforeEach(() => jest.clearAllMocks());

it("list_boards routes through eden/null and exposes pagination", async () => {
  boardsApi.listBoards.mockResolvedValue({ items: [{ id: "b1" }], totalCount: 1, nextCursor: "c" });
  const res = await edenListBoards({ ...base, config: {} });
  expect(res.output).toEqual({ boards: [{ id: "b1" }], totalCount: 1, nextCursor: "c", hasMore: true });
  const passed = mockRefreshAndRetry.mock.calls[0]![0] as unknown as { provider: string; providerAccountId: null };
  expect(passed.provider).toBe("eden");
  expect(passed.providerAccountId).toBeNull();
});

it("list_board_items lists a board's children", async () => {
  itemsApi.listWorkspaceItems.mockResolvedValue({ items: [{ id: "i1" }], count: 1, totalCount: 1, nextCursor: null });
  const res = await edenListBoardItems({ ...base, config: { boardId: "b1" } });
  expect(res.output.items).toEqual([{ id: "i1" }]);
  expect(res.output.hasMore).toBe(false);
  expect(itemsApi.listWorkspaceItems).toHaveBeenCalledWith(expect.objectContaining({ parentId: "b1" }));
});

it("rename_board returns confirmed name", async () => {
  boardsApi.renameBoard.mockResolvedValue({ boardId: "b1", name: "New" });
  expect((await edenRenameBoard({ ...base, config: { boardId: "b1", name: "New" } })).output).toEqual({ boardId: "b1", name: "New" });
});

it("save_links_to_board returns created/skipped counts", async () => {
  boardsApi.saveLinksToBoard.mockResolvedValue({ boardId: "b1", itemsCreated: 1, itemsSkipped: 0 });
  const res = await edenSaveLinksToBoard({ ...base, config: { boardId: "b1", urls: ["https://example.com"] } });
  expect(res.output).toEqual({ boardId: "b1", itemsCreated: 1, itemsSkipped: 0 });
});

it("save_links schema rejects non-URLs and empty lists (strict)", () => {
  expect(SaveLinksToBoardConfigSchema.safeParse({ boardId: "b", urls: [] }).success).toBe(false);
  expect(SaveLinksToBoardConfigSchema.safeParse({ boardId: "b", urls: ["not-a-url"] }).success).toBe(false);
  expect(SaveLinksToBoardConfigSchema.safeParse({ boardId: "b", urls: ["https://x.com"], extra: 1 }).success).toBe(false);
});
