/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUpdatesList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/updatesList", () => ({
  updatesList: (...args: unknown[]) => mockUpdatesList(...args),
}));

import { listUpdates } from "@/integrations/monday/actions/listUpdates";
import { ListUpdatesConfigSchema } from "@/integrations/monday/actions/listUpdates.schema";
import { NotFoundError } from "@/integrations/_shared/monday/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpdatesList.mockReset();
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

describe("list_updates schema", () => {
  it("requires itemId; default limit 25", () => {
    const parsed = ListUpdatesConfigSchema.parse({ itemId: "i" });
    expect(parsed.limit).toBe(25);
  });

  it("enforces 1..100 limit", () => {
    expect(() => ListUpdatesConfigSchema.parse({ itemId: "i", limit: 0 })).toThrow();
    expect(() =>
      ListUpdatesConfigSchema.parse({ itemId: "i", limit: 101 }),
    ).toThrow();
  });
});

describe("list_updates handler — pure read", () => {
  it("maps updates with body + creator + timestamps", async () => {
    mockUpdatesList.mockResolvedValueOnce({
      itemId: "i-1",
      itemName: "Item",
      updates: [
        {
          id: "u-1",
          text_body: "A comment",
          creator: { id: "c-1", name: "Alice" },
          created_at: "2026-05-24T00:00:00Z",
          updated_at: null,
        },
      ],
    });
    const result = await listUpdates({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1", limit: 25 },
      triggerEvent: trigger(),
    });
    expect(result.output.count).toBe(1);
    const upd = (result.output.updates as Array<Record<string, unknown>>)[0]!;
    expect(upd.updateId).toBe("u-1");
    expect(upd.body).toBe("A comment");
    expect(upd.creatorName).toBe("Alice");
  });

  it("throws NotFoundError when item missing", async () => {
    mockUpdatesList.mockResolvedValueOnce(null);
    await expect(
      listUpdates({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "gone", limit: 25 },
        triggerEvent: trigger(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("forwards limit to the wrapper", async () => {
    mockUpdatesList.mockResolvedValueOnce({
      itemId: "i",
      itemName: null,
      updates: [],
    });
    await listUpdates({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i", limit: 50 },
      triggerEvent: trigger(),
    });
    expect(mockUpdatesList.mock.calls[0]![0].limit).toBe(50);
  });
});
