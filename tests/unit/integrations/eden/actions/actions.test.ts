/**
 * @jest-environment node
 *
 * Eden action handlers (EDEN-4). Mocks the Eden API wrappers + refreshAndRetry (so the token seam
 * is exercised as `apiCall(token)`). Proves bounded outputs, that the account email is never
 * surfaced, and schema rejection.
 */
const mockRefreshAndRetry = jest.fn(async ({ apiCall }: { apiCall: (t: string) => Promise<unknown> }) => apiCall("decrypted-token"));
jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (a: unknown) => mockRefreshAndRetry(a as { apiCall: (t: string) => Promise<unknown> }),
}));

const mockCreateBoard = jest.fn();
const mockReadBoard = jest.fn();
const mockTrashBoard = jest.fn();
jest.mock("@/integrations/_shared/eden/api/boards", () => ({
  createBoard: (...a: unknown[]) => mockCreateBoard(...a),
  readBoard: (...a: unknown[]) => mockReadBoard(...a),
  trashBoard: (...a: unknown[]) => mockTrashBoard(...a),
}));
const mockListWorkspaces = jest.fn();
jest.mock("@/integrations/_shared/eden/api/workspaces", () => ({
  listWorkspaces: (...a: unknown[]) => mockListWorkspaces(...a),
}));

import { edenCreateBoard } from "@/integrations/eden/actions/boards/createBoard";
import { edenListWorkspaces } from "@/integrations/eden/actions/workspaces/listWorkspaces";
import { edenTrashBoard } from "@/integrations/eden/actions/boards/trashBoard";
import { CreateBoardConfigSchema } from "@/integrations/eden/actions/boards/createBoard.schema";

const base = {
  workflowId: "wf",
  userId: "u",
  accountId: "acct-1",
  runId: "r",
  nodeId: "n",
  triggerEvent: {} as never,
};

beforeEach(() => jest.clearAllMocks());

describe("edenCreateBoard", () => {
  it("creates a board via refreshAndRetry(provider=eden, providerAccountId=null) and returns bounded output", async () => {
    mockCreateBoard.mockResolvedValue({ boardId: "b1", title: "Ideas", workspaceId: "w1" });
    const res = await edenCreateBoard({ ...base, config: { workspaceId: "w1", title: "Ideas" } });
    expect(res.output).toEqual({ boardId: "b1", title: "Ideas", workspaceId: "w1" });
    // token seam: eden + null providerAccountId
    const passed = mockRefreshAndRetry.mock.calls[0]![0] as unknown as { provider: string; providerAccountId: null };
    expect(passed.provider).toBe("eden");
    expect(passed.providerAccountId).toBeNull();
    expect(mockCreateBoard).toHaveBeenCalledWith({ accessToken: "decrypted-token", workspaceId: "w1", title: "Ideas" });
  });

  it("rejects config missing the required title", () => {
    expect(CreateBoardConfigSchema.safeParse({ workspaceId: "w1" }).success).toBe(false);
    expect(CreateBoardConfigSchema.safeParse({ title: "" }).success).toBe(false);
    expect(CreateBoardConfigSchema.safeParse({ title: "ok", extra: 1 }).success).toBe(false); // .strict()
  });
});

describe("edenListWorkspaces", () => {
  it("returns bounded workspaces and NEVER the account email/user object", async () => {
    // The wrapper already drops `user`/email; assert the handler surfaces only the bounded set.
    mockListWorkspaces.mockResolvedValue({
      workspaces: [{ id: "w1", name: "Personal", slug: "personal", role: "owner" }],
      defaultWorkspaceId: "w1",
    });
    const res = await edenListWorkspaces({ ...base, config: {} });
    expect(res.output).toEqual({
      workspaces: [{ id: "w1", name: "Personal", slug: "personal", role: "owner" }],
      defaultWorkspaceId: "w1",
      count: 1,
    });
    expect(JSON.stringify(res.output)).not.toMatch(/@/); // no email anywhere
  });
});

describe("edenTrashBoard", () => {
  it("returns the trashed board id", async () => {
    mockTrashBoard.mockResolvedValue({ boardId: "b9" });
    const res = await edenTrashBoard({ ...base, config: { boardId: "b9" } });
    expect(res.output).toEqual({ boardId: "b9" });
    expect(mockTrashBoard).toHaveBeenCalledWith({ accessToken: "decrypted-token", boardId: "b9" });
  });
});
