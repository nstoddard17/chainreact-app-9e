/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineUserDelete",
  () => ({
    pipelineUserDelete: (...args: unknown[]) => mockDelete(...args),
  }),
);

import { removePipelineUser } from "@/integrations/microsoft-powerbi/actions/pipelines/removePipelineUser";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockDelete.mockResolvedValue(undefined);
});

function trigger(provider = "native"): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-07-15T12:00:00Z",
    providerAccountId:
      provider === "microsoft-powerbi" ? "alice@contoso.com" : "",
    payload: {},
  };
}

function baseInput(config: Record<string, unknown>) {
  return {
    workflowId: "wf",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: trigger(),
  };
}

describe("remove_pipeline_user action", () => {
  it("removes the principal and echoes the fixed key set", async () => {
    const result = await removePipelineUser(
      baseInput({ pipelineId: "pipe-1", principalIdentifier: "bob@contoso.com" }),
    );

    const call = mockDelete.mock.calls[0]![0];
    expect(call.pipelineId).toBe("pipe-1");
    expect(call.identifier).toBe("bob@contoso.com");
    expect(result.output).toEqual({
      removed: true,
      principalIdentifier: "bob@contoso.com",
    });
  });

  it("rejects a missing principalIdentifier", async () => {
    await expect(
      removePipelineUser(baseInput({ pipelineId: "pipe-1" })),
    ).rejects.toThrow();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      removePipelineUser(
        baseInput({
          pipelineId: "pipe-1",
          principalIdentifier: "bob@contoso.com",
          principalType: "User",
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await removePipelineUser({
      ...baseInput({
        pipelineId: "pipe-1",
        principalIdentifier: "bob@contoso.com",
      }),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockDelete.mockRejectedValueOnce(
      new Error("Power BI pipeline user DELETE failed: HTTP 400"),
    );
    await expect(
      removePipelineUser(
        baseInput({
          pipelineId: "pipe-1",
          principalIdentifier: "bob@contoso.com",
        }),
      ),
    ).rejects.toThrow(/HTTP 400/);
  });

  it("never leaks the access token into the output", async () => {
    const result = await removePipelineUser(
      baseInput({
        pipelineId: "pipe-1",
        principalIdentifier: "bob@contoso.com",
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain('"tok"');
  });
});
