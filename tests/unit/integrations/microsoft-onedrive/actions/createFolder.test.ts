/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-onedrive/api/driveItemsCreateFolder",
  () => ({
    driveItemsCreateFolder: (...args: unknown[]) => mockCreate(...args),
  }),
);

import { createFolder } from "@/integrations/microsoft-onedrive/actions/createFolder";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-onedrive",
    eventType: "file_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("create_folder action", () => {
  it("creates folder at the drive root when parentItemId is omitted", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "f-1",
      name: "Reports",
      folder: { childCount: 0 },
      webUrl: "https://1drv.ms/r",
    });

    const result = await createFolder({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { name: "Reports" },
      triggerEvent: trigger(),
    });

    const call = mockCreate.mock.calls[0]![0];
    expect(call.name).toBe("Reports");
    expect(call.parentItemId).toBeUndefined();
    expect(result.output).toEqual({
      itemId: "f-1",
      name: "Reports",
      webUrl: "https://1drv.ms/r",
      parentReference: null,
      childCount: 0,
      createdDateTime: null,
      lastModifiedDateTime: null,
    });
  });

  it("forwards parentItemId when supplied", async () => {
    mockCreate.mockResolvedValueOnce({ id: "f", name: "x", folder: {} });

    await createFolder({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { name: "x", parentItemId: "p-9" },
      triggerEvent: trigger(),
    });

    expect(mockCreate.mock.calls[0]![0].parentItemId).toBe("p-9");
  });

  it("does NOT pass conflictBehavior — wrapper applies the Q11 'fail' default", async () => {
    mockCreate.mockResolvedValueOnce({ id: "f", name: "x", folder: {} });

    await createFolder({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { name: "x" },
      triggerEvent: trigger(),
    });

    // Action handler must not pass conflictBehavior — that knob is at
    // the wrapper layer; passing it from the handler would let workflow
    // authors silently override the Q11 fail-on-conflict contract.
    const call = mockCreate.mock.calls[0]![0];
    expect(call.conflictBehavior).toBeUndefined();
  });

  it("rejects empty name", async () => {
    await expect(
      createFolder({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { name: "" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown fields (strict mode)", async () => {
    await expect(
      createFolder({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { name: "x", description: "leftover" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
