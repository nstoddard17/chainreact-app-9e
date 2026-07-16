/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUpsert = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineUserUpsert",
  () => ({
    pipelineUserUpsert: (...args: unknown[]) => mockUpsert(...args),
  }),
);

import { addOrUpdatePipelineUser } from "@/integrations/microsoft-powerbi/actions/pipelines/addOrUpdatePipelineUser";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpsert.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockUpsert.mockResolvedValue(undefined);
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

const validConfig = {
  pipelineId: "pipe-1",
  principalIdentifier: "bob@contoso.com",
  principalType: "User",
  accessRight: "Admin",
};

describe("add_or_update_pipeline_user action", () => {
  it("grants access and echoes the fixed key set", async () => {
    const result = await addOrUpdatePipelineUser(baseInput(validConfig));

    const call = mockUpsert.mock.calls[0]![0];
    expect(call.pipelineId).toBe("pipe-1");
    expect(call.identifier).toBe("bob@contoso.com");
    expect(call.principalType).toBe("User");
    expect(call.accessRight).toBe("Admin");
    expect(result.output).toEqual({
      granted: true,
      principalIdentifier: "bob@contoso.com",
    });
  });

  it("rejects an undocumented accessRight (only Admin is documented)", async () => {
    await expect(
      addOrUpdatePipelineUser(
        baseInput({ ...validConfig, accessRight: "Viewer" }),
      ),
    ).rejects.toThrow();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects an unsupported principalType (None is not offered)", async () => {
    await expect(
      addOrUpdatePipelineUser(
        baseInput({ ...validConfig, principalType: "None" }),
      ),
    ).rejects.toThrow();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects a missing accessRight (Q11 — no hidden default)", async () => {
    await expect(
      addOrUpdatePipelineUser(
        baseInput({
          pipelineId: "pipe-1",
          principalIdentifier: "bob@contoso.com",
          principalType: "User",
        }),
      ),
    ).rejects.toThrow();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      addOrUpdatePipelineUser(
        baseInput({ ...validConfig, identifier: "raw-wire-field" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await addOrUpdatePipelineUser({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockUpsert.mockRejectedValueOnce(
      new Error("Power BI pipeline user upsert POST failed: PrincipalNotFound"),
    );
    await expect(
      addOrUpdatePipelineUser(baseInput(validConfig)),
    ).rejects.toThrow(/PrincipalNotFound/);
  });

  it("never leaks the access token into the output", async () => {
    const result = await addOrUpdatePipelineUser(baseInput(validConfig));
    expect(JSON.stringify(result.output)).not.toContain('"tok"');
  });
});
