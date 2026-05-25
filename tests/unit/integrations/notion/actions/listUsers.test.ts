/**
 * @jest-environment node
 *
 * Tests for integrations/notion/actions/listUsers (Notion 2.1 Commit 2).
 *
 * Covers:
 *   - schema: valid empty config, valid pageSize / startCursor,
 *     pageSize bounds (1..100), unknown fields rejected
 *   - handler: calls wrapper with pagination params; maps users array;
 *     maps nextCursor + hasMore; error propagation
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { ListUsersConfigSchema } from "@/integrations/notion/actions/listUsers.schema";

const mockRefreshAndRetry = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/notion/api/users", () => ({
  usersRetrieve: jest.fn(),
  usersList: (...args: unknown[]) => mockList(...args),
}));

import { listUsers } from "@/integrations/notion/actions/listUsers";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "notion",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-14T12:00:00Z",
    accountId: "bot-123",
    payload: {},
  };
}

describe("list_users schema (ListUsersConfigSchema)", () => {
  it("accepts an empty config (no pagination args)", () => {
    expect(ListUsersConfigSchema.parse({})).toEqual({});
  });

  it("accepts a valid pageSize", () => {
    expect(ListUsersConfigSchema.parse({ pageSize: 25 })).toEqual({
      pageSize: 25,
    });
  });

  it("accepts a valid startCursor", () => {
    expect(ListUsersConfigSchema.parse({ startCursor: "cur-1" })).toEqual({
      startCursor: "cur-1",
    });
  });

  it("accepts both pageSize + startCursor", () => {
    expect(
      ListUsersConfigSchema.parse({ pageSize: 10, startCursor: "cur-1" }),
    ).toEqual({ pageSize: 10, startCursor: "cur-1" });
  });

  it("rejects pageSize > 100 (Notion's hard ceiling)", () => {
    expect(() => ListUsersConfigSchema.parse({ pageSize: 101 })).toThrow();
  });

  it("rejects pageSize = 0 (positive only)", () => {
    expect(() => ListUsersConfigSchema.parse({ pageSize: 0 })).toThrow();
  });

  it("rejects negative pageSize", () => {
    expect(() => ListUsersConfigSchema.parse({ pageSize: -5 })).toThrow();
  });

  it("rejects non-integer pageSize", () => {
    expect(() => ListUsersConfigSchema.parse({ pageSize: 10.5 })).toThrow();
  });

  it("rejects unknown fields (.strict — no includeGuests / filter arms)", () => {
    expect(() =>
      ListUsersConfigSchema.parse({ includeGuests: false }),
    ).toThrow();
    expect(() =>
      ListUsersConfigSchema.parse({ filter: { type: "person" } }),
    ).toThrow();
  });
});

describe("list_users handler", () => {
  it("calls usersList once with no pagination when config is empty", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await listUsers({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });
    expect(mockList).toHaveBeenCalledTimes(1);
    const callArg = mockList.mock.calls[0]![0]!;
    expect(callArg.pageSize).toBeUndefined();
    expect(callArg.startCursor).toBeUndefined();
    expect(callArg.accessToken).toBe("tok");
  });

  it("forwards pageSize + startCursor to the wrapper", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    await listUsers({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageSize: 10, startCursor: "cur-1" },
      triggerEvent: trigger(),
    });
    const callArg = mockList.mock.calls[0]![0]!;
    expect(callArg.pageSize).toBe(10);
    expect(callArg.startCursor).toBe("cur-1");
  });

  it("maps users array, nextCursor (string), and hasMore (true)", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [
        {
          object: "user",
          id: "u-alice",
          type: "person",
          name: "Alice",
          avatar_url: "https://x",
          person: { email: "alice@example.com" },
        },
        {
          object: "user",
          id: "b-1",
          type: "bot",
          name: "Bot",
          bot: { owner: { type: "workspace" }, workspace_name: "Acme" },
        },
      ],
      has_more: true,
      next_cursor: "cur-next",
    });
    const result = await listUsers({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.hasMore).toBe(true);
    expect(output.nextCursor).toBe("cur-next");
    const users = output.users as Array<Record<string, unknown>>;
    expect(users).toHaveLength(2);
    expect(users[0]!.userId).toBe("u-alice");
    expect(users[0]!.personEmail).toBe("alice@example.com");
    expect(users[0]!.botOwnerType).toBeNull();
    expect(users[1]!.userId).toBe("b-1");
    expect(users[1]!.botOwnerType).toBe("workspace");
    expect(users[1]!.botWorkspaceName).toBe("Acme");
    expect(users[1]!.personEmail).toBeNull();
  });

  it("maps nextCursor: null when the list is fully drained", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
    const result = await listUsers({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.hasMore).toBe(false);
    expect(output.nextCursor).toBeNull();
    expect(output.users).toEqual([]);
  });

  it("does NOT auto-paginate — exactly one usersList call regardless of hasMore", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      results: [{ object: "user", id: "u-1", type: "person" }],
      has_more: true,
      next_cursor: "cur-2",
    });
    await listUsers({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("propagates Notion API errors verbatim", async () => {
    mockList.mockRejectedValueOnce(new Error("notion_403"));
    await expect(
      listUsers({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow("notion_403");
  });
});
