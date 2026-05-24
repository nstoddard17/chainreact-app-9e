/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockSubitemsCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/subitemsCreate", () => ({
  subitemsCreate: (...args: unknown[]) => mockSubitemsCreate(...args),
}));

import { createSubitem } from "@/integrations/monday/actions/items/createSubitem";
import { CreateSubitemConfigSchema } from "@/integrations/monday/actions/items/createSubitem.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSubitemsCreate.mockReset();
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

describe("create_subitem schema", () => {
  it("preserves V1 camelCase: parentItemId, subitemName", () => {
    expect(() =>
      CreateSubitemConfigSchema.parse({
        parentItemId: "p",
        subitemName: "s",
      }),
    ).not.toThrow();
  });

  it("requires parentItemId AND subitemName", () => {
    expect(() =>
      CreateSubitemConfigSchema.parse({ subitemName: "s" }),
    ).toThrow();
    expect(() =>
      CreateSubitemConfigSchema.parse({ parentItemId: "p" }),
    ).toThrow();
  });

  it("does NOT require subitems boardId (D-MON6)", () => {
    // Subitems board id is intentionally opaque — Monday resolves it
    // from the parent. The schema should never carry a boardId field.
    expect(() =>
      CreateSubitemConfigSchema.parse({
        parentItemId: "p",
        subitemName: "s",
        boardId: "b",
      }),
    ).toThrow(); // strict mode rejects unknown field
  });
});

describe("create_subitem handler", () => {
  it("forwards parentItemId + subitemName to subitemsCreate", async () => {
    mockSubitemsCreate.mockResolvedValueOnce({
      id: "s-1",
      name: "n",
      board: { id: "subitems-board" },
      created_at: "2026-05-24T00:00:00Z",
    });
    await createSubitem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { parentItemId: "p-1", subitemName: "New sub" },
      triggerEvent: trigger(),
    });
    const call = mockSubitemsCreate.mock.calls[0]![0];
    expect(call.parentItemId).toBe("p-1");
    expect(call.subitemName).toBe("New sub");
  });

  it("serializes columnValues object to JSON string", async () => {
    mockSubitemsCreate.mockResolvedValueOnce({
      id: "s",
      name: "n",
      board: null,
      created_at: null,
    });
    await createSubitem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        parentItemId: "p",
        subitemName: "s",
        columnValues: { priority: "High" },
      },
      triggerEvent: trigger(),
    });
    expect(mockSubitemsCreate.mock.calls[0]![0].columnValuesJson).toBe(
      '{"priority":"High"}',
    );
  });

  it("output: subitemId / subitemName / parentItemId / boardId (subitems board) / createdAt", async () => {
    mockSubitemsCreate.mockResolvedValueOnce({
      id: "s-1",
      name: "Returned",
      board: { id: "subitems-resolved" },
      created_at: "2026-05-24T01:00:00Z",
    });
    const result = await createSubitem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { parentItemId: "p-1", subitemName: "Original" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      subitemId: "s-1",
      subitemName: "Returned",
      parentItemId: "p-1",
      boardId: "subitems-resolved",
      createdAt: "2026-05-24T01:00:00Z",
    });
  });

  it("uses refreshAndRetry with provider='monday'", async () => {
    mockSubitemsCreate.mockResolvedValueOnce({
      id: "s",
      name: "n",
      board: null,
      created_at: null,
    });
    await createSubitem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { parentItemId: "p", subitemName: "s" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
