/**
 * @jest-environment node
 */
import { randomBytes } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockBoardsCreate = jest.fn();
const mockGetActiveForExecution = jest.fn();

jest.mock("@/integrations/trello/api/boards", () => ({
  boardsCreate: (...args: unknown[]) => mockBoardsCreate(...args),
}));
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

import { createBoard } from "@/integrations/trello/actions/createBoard";
import { CreateBoardConfigSchema } from "@/integrations/trello/actions/createBoard.schema";

const triggerEvent: TriggerEvent = {
  provider: "manual",
  eventType: "manual",
  eventId: "t1",
  occurredAt: "2026-05-11T00:00:00Z",
  accountId: "manual",
  payload: {},
};

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  mockBoardsCreate.mockReset();
  mockGetActiveForExecution.mockReset();
});

afterEach(() => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

function wireIntegration(): void {
  const { encryptToken } = jest.requireActual("@/core/encryption/tokens");
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    provider: "trello",
    providerAccountId: "mem-1",
    displayName: "User",
    accessTokenEncrypted: encryptToken("token-abc"),
    refreshTokenEncrypted: null,
    accessTokenExpiresAt: null,
    scopes: [],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  });
}

describe("createBoard handler", () => {
  it("forwards name+visibility, echoes wire-format prefs back as user-facing label", async () => {
    wireIntegration();
    mockBoardsCreate.mockResolvedValue({
      id: "b1",
      name: "Sprint",
      desc: "team backlog",
      url: "https://trello.com/b/x",
      shortUrl: "https://trello.com/b/sh",
      closed: false,
      idOrganization: "org-1",
      prefs: { permissionLevel: "org" },
    });
    const result = await createBoard({
      workflowId: "wf",
      runId: "r",
      nodeId: "n",
      userId: "user-1",
      config: {
        name: "Sprint",
        visibility: "workspace",
        desc: "team backlog",
        defaultLists: false,
      },
      triggerEvent,
    });
    expect(mockBoardsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Sprint",
        visibility: "workspace",
        desc: "team backlog",
      }),
    );
    expect(result.output.boardId).toBe("b1");
    // Wire-format "org" mapped back to "workspace" for symmetry with input.
    expect(result.output.visibility).toBe("workspace");
    expect(result.output.url).toBe("https://trello.com/b/x");
  });

  it("schema REQUIRES visibility (no hidden default — Q11)", () => {
    const r = CreateBoardConfigSchema.safeParse({ name: "x" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.path.join(".") === "visibility"),
      ).toBe(true);
    }
  });

  it("schema rejects unknown visibility values", () => {
    expect(
      CreateBoardConfigSchema.safeParse({ name: "x", visibility: "team" }).success,
    ).toBe(false);
  });

  it("schema accepts all three visibility values", () => {
    expect(
      CreateBoardConfigSchema.safeParse({ name: "x", visibility: "private" }).success,
    ).toBe(true);
    expect(
      CreateBoardConfigSchema.safeParse({ name: "x", visibility: "workspace" }).success,
    ).toBe(true);
    expect(
      CreateBoardConfigSchema.safeParse({ name: "x", visibility: "public" }).success,
    ).toBe(true);
  });

  it("schema defaults defaultLists to false (no hidden seed lists)", () => {
    const r = CreateBoardConfigSchema.parse({ name: "x", visibility: "private" });
    expect(r.defaultLists).toBe(false);
  });
});
