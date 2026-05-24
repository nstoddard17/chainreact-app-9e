/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUpdatesCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/updatesCreate", () => ({
  updatesCreate: (...args: unknown[]) => mockUpdatesCreate(...args),
}));

import { createUpdate } from "@/integrations/monday/actions/createUpdate";
import { CreateUpdateConfigSchema } from "@/integrations/monday/actions/createUpdate.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpdatesCreate.mockReset();
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

describe("create_update schema", () => {
  it("preserves V1 camelCase: itemId, body", () => {
    expect(() =>
      CreateUpdateConfigSchema.parse({ itemId: "i", body: "Hello" }),
    ).not.toThrow();
  });

  it("requires itemId and body", () => {
    expect(() => CreateUpdateConfigSchema.parse({ body: "x" })).toThrow();
    expect(() => CreateUpdateConfigSchema.parse({ itemId: "i" })).toThrow();
  });
});

describe("create_update handler", () => {
  it("forwards itemId + body to updatesCreate", async () => {
    mockUpdatesCreate.mockResolvedValueOnce({ id: "u-1" });
    await createUpdate({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1", body: "Hello world" },
      triggerEvent: trigger(),
    });
    expect(mockUpdatesCreate.mock.calls[0]![0]).toMatchObject({
      itemId: "i-1",
      body: "Hello world",
    });
  });

  it("output: updateId / itemId / body / createdAt", async () => {
    mockUpdatesCreate.mockResolvedValueOnce({ id: "u-1" });
    const result = await createUpdate({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1", body: "Hello" },
      triggerEvent: trigger(),
    });
    expect(result.output.updateId).toBe("u-1");
    expect(result.output.itemId).toBe("i-1");
    expect(result.output.body).toBe("Hello");
    expect(typeof result.output.createdAt).toBe("string");
  });

  it("uses refreshAndRetry with provider='monday'", async () => {
    mockUpdatesCreate.mockResolvedValueOnce({ id: "u" });
    await createUpdate({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i", body: "b" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
