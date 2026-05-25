/**
 * @jest-environment node
 *
 * Tests for integrations/notion/actions/getUser (Notion 2.1 Commit 2).
 *
 * Covers:
 *   - schema: valid userId, missing/empty userId, unknown fields rejected
 *   - handler: calls wrapper with userId; output mapping for person + bot
 *     users; null-coalescing for absent fields; error propagation;
 *     no input spreading into output
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { GetUserConfigSchema } from "@/integrations/notion/actions/getUser.schema";

const mockRefreshAndRetry = jest.fn();
const mockRetrieve = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/notion/api/users", () => ({
  usersRetrieve: (...args: unknown[]) => mockRetrieve(...args),
  usersList: jest.fn(),
}));

import { getUser } from "@/integrations/notion/actions/getUser";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRetrieve.mockReset();
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

describe("get_user schema (GetUserConfigSchema)", () => {
  it("accepts a valid userId", () => {
    expect(GetUserConfigSchema.parse({ userId: "u-1" })).toEqual({
      userId: "u-1",
    });
  });

  it("rejects when userId is missing", () => {
    expect(() => GetUserConfigSchema.parse({})).toThrow();
  });

  it("rejects an empty userId", () => {
    expect(() => GetUserConfigSchema.parse({ userId: "" })).toThrow();
  });

  it("rejects unknown fields (.strict — no email / name lookup arms)", () => {
    expect(() =>
      GetUserConfigSchema.parse({ userId: "u-1", email: "x@y.com" }),
    ).toThrow();
    expect(() =>
      GetUserConfigSchema.parse({ userId: "u-1", name: "Alice" }),
    ).toThrow();
  });

  it("rejects a non-string userId", () => {
    expect(() => GetUserConfigSchema.parse({ userId: 123 })).toThrow();
  });
});

describe("get_user handler — person user mapping", () => {
  it("calls usersRetrieve with userId and returns mapped person output", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "user",
      id: "u-alice",
      type: "person",
      name: "Alice Example",
      avatar_url: "https://avatar/alice.png",
      person: { email: "alice@example.com" },
    });
    const result = await getUser({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { userId: "u-alice" },
      triggerEvent: trigger(),
    });
    expect(mockRetrieve.mock.calls[0]![0]!).toEqual({
      accessToken: "tok",
      userId: "u-alice",
    });
    expect(result.output).toEqual({
      userId: "u-alice",
      object: "user",
      type: "person",
      name: "Alice Example",
      avatarUrl: "https://avatar/alice.png",
      personEmail: "alice@example.com",
      botOwnerType: null,
      botOwnerUserId: null,
      botWorkspaceName: null,
    });
  });

  it("nulls personEmail when Notion omits person.email (capability scope not granted)", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "user",
      id: "u-alice",
      type: "person",
      name: "Alice",
      // person omitted entirely (Notion does this when the integration
      // lacks the "user information including email addresses" capability)
    });
    const result = await getUser({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { userId: "u-alice" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.personEmail).toBeNull();
    expect(output.type).toBe("person");
  });
});

describe("get_user handler — bot user mapping", () => {
  it("maps bot user with workspace owner", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "user",
      id: "b-1",
      type: "bot",
      name: "Acme Bot",
      avatar_url: null,
      bot: {
        owner: { type: "workspace", workspace: true },
        workspace_name: "Acme Inc",
      },
    });
    const result = await getUser({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { userId: "b-1" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      userId: "b-1",
      object: "user",
      type: "bot",
      name: "Acme Bot",
      avatarUrl: null,
      personEmail: null,
      botOwnerType: "workspace",
      botOwnerUserId: null,
      botWorkspaceName: "Acme Inc",
    });
  });

  it("maps bot user with user owner (botOwnerUserId populated)", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "user",
      id: "b-2",
      type: "bot",
      name: "Per-user Bot",
      bot: {
        owner: {
          type: "user",
          user: { id: "u-owner-99", object: "user" },
        },
        workspace_name: "Acme Inc",
      },
    });
    const result = await getUser({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { userId: "b-2" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.botOwnerType).toBe("user");
    expect(output.botOwnerUserId).toBe("u-owner-99");
    expect(output.botWorkspaceName).toBe("Acme Inc");
    expect(output.personEmail).toBeNull();
  });

  it("nulls bot fields entirely when type is person (no bot-section leak)", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "user",
      id: "u-alice",
      type: "person",
      person: { email: "alice@example.com" },
      // Defensive: even if a malformed response carried a bot object on
      // a person user, we ignore it because type is the discriminator.
      bot: { workspace_name: "ghost" },
    });
    const result = await getUser({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { userId: "u-alice" },
      triggerEvent: trigger(),
    });
    const output = result.output as Record<string, unknown>;
    expect(output.botOwnerType).toBeNull();
    expect(output.botOwnerUserId).toBeNull();
    expect(output.botWorkspaceName).toBeNull();
  });
});

describe("get_user handler — error propagation + output discipline", () => {
  it("propagates Notion API errors verbatim", async () => {
    mockRetrieve.mockRejectedValueOnce(new Error("notion_404"));
    await expect(
      getUser({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { userId: "u-missing" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow("notion_404");
  });

  it("does NOT spread input config into output (output key set is locked)", async () => {
    mockRetrieve.mockResolvedValueOnce({
      object: "user",
      id: "u-1",
      type: "person",
    });
    const result = await getUser({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { userId: "u-1" },
      triggerEvent: trigger(),
    });
    const outKeys = Object.keys(result.output ?? {}).sort();
    expect(outKeys).toEqual(
      [
        "userId",
        "object",
        "type",
        "name",
        "avatarUrl",
        "personEmail",
        "botOwnerType",
        "botOwnerUserId",
        "botWorkspaceName",
      ].sort(),
    );
  });
});
