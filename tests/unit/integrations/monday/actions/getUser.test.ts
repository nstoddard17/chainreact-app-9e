/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUsersGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/usersGet", () => ({
  usersGet: (...args: unknown[]) => mockUsersGet(...args),
}));

import { getUser } from "@/integrations/monday/actions/users/getUser";
import { GetUserConfigSchema } from "@/integrations/monday/actions/users/getUser.schema";
import { NotFoundError } from "@/integrations/_shared/monday/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersGet.mockReset();
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

describe("get_user schema", () => {
  it("requires userId (V1-preserved camelCase)", () => {
    expect(() => GetUserConfigSchema.parse({ userId: "1" })).not.toThrow();
    expect(() => GetUserConfigSchema.parse({})).toThrow();
  });
});

describe("get_user handler — pure read", () => {
  it("maps user fields incl. account", async () => {
    mockUsersGet.mockResolvedValueOnce({
      id: "u-1",
      name: "Alice",
      email: "alice@x.com",
      title: "Engineer",
      photo_original: "https://photo",
      enabled: true,
      created_at: "2026-05-24T00:00:00Z",
      account: { id: "a-1", name: "Acme" },
    });
    const result = await getUser({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { userId: "u-1" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      userId: "u-1",
      name: "Alice",
      email: "alice@x.com",
      title: "Engineer",
      photoUrl: "https://photo",
      enabled: true,
      createdAt: "2026-05-24T00:00:00Z",
      accountId: "a-1",
      accountName: "Acme",
    });
  });

  it("throws NotFoundError when user missing", async () => {
    mockUsersGet.mockResolvedValueOnce(null);
    await expect(
      getUser({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { userId: "gone" },
        triggerEvent: trigger(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("uses refreshAndRetry provider='monday'", async () => {
    mockUsersGet.mockResolvedValueOnce({
      id: "u-1",
      name: null,
      email: null,
      title: null,
      photo_original: null,
      enabled: null,
      created_at: null,
      account: null,
    });
    await getUser({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { userId: "u-1" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
