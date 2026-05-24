/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUsersList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/usersList", () => ({
  usersList: (...args: unknown[]) => mockUsersList(...args),
}));

import { listUsers } from "@/integrations/monday/actions/listUsers";
import { ListUsersConfigSchema } from "@/integrations/monday/actions/listUsers.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "monday",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-24T00:00:00Z",
    accountId: "alice@example.com",
    payload: {},
  };
}

describe("list_users schema", () => {
  it("defaults limit=25 and kind='all'", () => {
    const parsed = ListUsersConfigSchema.parse({});
    expect(parsed.limit).toBe(25);
    expect(parsed.kind).toBe("all");
  });

  it("accepts kind enum: all / non_guests / guests / non_pending", () => {
    for (const kind of ["all", "non_guests", "guests", "non_pending"]) {
      expect(() => ListUsersConfigSchema.parse({ kind })).not.toThrow();
    }
  });

  it("rejects unknown kind values", () => {
    expect(() => ListUsersConfigSchema.parse({ kind: "admins" })).toThrow();
  });

  it("enforces 1..100 limit bounds", () => {
    expect(() => ListUsersConfigSchema.parse({ limit: 0 })).toThrow();
    expect(() => ListUsersConfigSchema.parse({ limit: 101 })).toThrow();
  });
});

describe("list_users handler — pure read", () => {
  it("forwards kind filter to wrapper", async () => {
    mockUsersList.mockResolvedValueOnce({ users: [] });
    await listUsers({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { limit: 25, kind: "non_guests" },
      triggerEvent: trigger(),
    });
    expect(mockUsersList.mock.calls[0]![0].kind).toBe("non_guests");
  });

  it("normalizes output user shape (camelCase)", async () => {
    mockUsersList.mockResolvedValueOnce({
      users: [
        {
          id: "u-1",
          name: "Alice",
          email: "a@b.com",
          title: "Engineer",
          photo_original: "https://photo",
          enabled: true,
          created_at: "2026-05-24T00:00:00Z",
        },
      ],
    });
    const result = await listUsers({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { limit: 25, kind: "all" },
      triggerEvent: trigger(),
    });
    const user = (result.output.users as Array<Record<string, unknown>>)[0]!;
    expect(user).toEqual({
      userId: "u-1",
      name: "Alice",
      email: "a@b.com",
      title: "Engineer",
      photoUrl: "https://photo",
      enabled: true,
      createdAt: "2026-05-24T00:00:00Z",
    });
  });

  it("output: count + kind + hasMore=false + nextCursor=null", async () => {
    mockUsersList.mockResolvedValueOnce({
      users: [
        {
          id: "u-1",
          name: "Alice",
          email: null,
          title: null,
          photo_original: null,
          enabled: null,
          created_at: null,
        },
      ],
    });
    const result = await listUsers({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { limit: 25, kind: "all" },
      triggerEvent: trigger(),
    });
    expect(result.output.count).toBe(1);
    expect(result.output.kind).toBe("all");
    expect(result.output.hasMore).toBe(false);
    expect(result.output.nextCursor).toBeNull();
  });
});
