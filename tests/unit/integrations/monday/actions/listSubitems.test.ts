/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockSubitemsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/subitemsList", () => ({
  subitemsList: (...args: unknown[]) => mockSubitemsList(...args),
}));

import { listSubitems } from "@/integrations/monday/actions/items/listSubitems";
import { ListSubitemsConfigSchema } from "@/integrations/monday/actions/items/listSubitems.schema";
import { NotFoundError } from "@/integrations/_shared/monday/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSubitemsList.mockReset();
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

describe("list_subitems schema", () => {
  it("requires parentItemId", () => {
    expect(() =>
      ListSubitemsConfigSchema.parse({ parentItemId: "p" }),
    ).not.toThrow();
    expect(() => ListSubitemsConfigSchema.parse({})).toThrow();
  });
});

describe("list_subitems handler — pure read", () => {
  it("normalizes subitems with flat column titles", async () => {
    mockSubitemsList.mockResolvedValueOnce({
      parentItemId: "p-1",
      parentItemName: "Parent",
      subitems: [
        {
          id: "s-1",
          name: "Sub",
          state: "active",
          board: { id: "sb", name: "Subitems" },
          column_values: [
            {
              id: "status",
              type: "status",
              text: "Done",
              value: null,
              column: { id: "status", title: "Status" },
            },
          ],
          created_at: null,
          updated_at: null,
        },
      ],
    });
    const result = await listSubitems({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { parentItemId: "p-1" },
      triggerEvent: trigger(),
    });
    expect(result.output.parentItemId).toBe("p-1");
    expect(result.output.count).toBe(1);
    const sub = (result.output.subitems as Array<Record<string, unknown>>)[0]!;
    expect(sub.subitemId).toBe("s-1");
    const cv = sub.columnValues as Array<{ title: string }>;
    expect(cv[0]!.title).toBe("Status");
  });

  it("throws NotFoundError when parent item missing", async () => {
    mockSubitemsList.mockResolvedValueOnce(null);
    await expect(
      listSubitems({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { parentItemId: "gone" },
        triggerEvent: trigger(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("uses refreshAndRetry provider='monday'", async () => {
    mockSubitemsList.mockResolvedValueOnce({
      parentItemId: "p",
      parentItemName: null,
      subitems: [],
    });
    await listSubitems({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { parentItemId: "p" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
