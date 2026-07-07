/**
 * @jest-environment node
 *
 * Tests for the shared Asana activation builder — Slice 5.ASANA-1.
 *
 * The Asana-specific lifecycle: pre-upsert (handshakePending) →
 * POST /webhooks (handshake persists the secret mid-call, simulated here
 * via the mocked row read-back) → secret read-back → full config patch.
 */
const mockUpsert = jest.fn();
const mockFind = jest.fn();
const mockRefreshAndRetry = jest.fn();
const mockWebhooksCreate = jest.fn();
const mockWebhooksDelete = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  upsert: (...args: unknown[]) => mockUpsert(...args),
  findByWorkflowAndNode: (...args: unknown[]) => mockFind(...args),
}));

jest.mock("@/services/oauth/refreshAndRetry", () => {
  class Unauthorized401Error extends Error {}
  class InsufficientScopeError extends Error {}
  class IntegrationActionRequiredError extends Error {}
  return {
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
    Unauthorized401Error,
    InsufficientScopeError,
    IntegrationActionRequiredError,
  };
});

jest.mock("@/integrations/_shared/asana/api/webhooks", () => ({
  webhooksCreate: (...args: unknown[]) => mockWebhooksCreate(...args),
  webhooksDelete: (...args: unknown[]) => mockWebhooksDelete(...args),
}));

import { buildAsanaActivate } from "@/integrations/asana/triggers/_shared/activate";

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    accountId: "acct-1",
    connectedByUserId: "user-1",
    provider: "asana",
    providerAccountId: "marcus@example.test",
    displayName: "Marcus",
    accessTokenEncrypted: "enc",
    refreshTokenEncrypted: "enc-r",
    accessTokenExpiresAt: null,
    scopes: [],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as never;
}

function node(config: Record<string, unknown>) {
  return { id: "node-1", kind: "trigger", provider: "asana", type: "new_task_in_project", config } as never;
}

beforeEach(() => {
  mockUpsert.mockReset();
  mockFind.mockReset();
  mockRefreshAndRetry.mockReset();
  mockWebhooksCreate.mockReset();
  mockWebhooksDelete.mockReset();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  // Default: refreshAndRetry threads a token into the apiCall.
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.ASANA_WEBHOOK_URL;
});

const activate = buildAsanaActivate("new_task_in_project");

describe("buildAsanaActivate — happy path", () => {
  it("pre-upserts the pending row, creates the webhook with filters, and returns the full patch", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({ gid: "wh-1", active: true });
    mockFind.mockResolvedValueOnce({
      id: "tr-1",
      config: { hookSecretEncrypted: "enc(secret-1)" },
    });

    const patch = await activate({
      node: node({ projectId: "p-1", workspaceId: "w-1" }),
      integration: integration(),
      workflowId: "wf-1",
    });

    // 1. Pre-upsert happened BEFORE webhook creation, with the pending marker.
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upsertArg = mockUpsert.mock.calls[0]![0];
    expect(upsertArg).toMatchObject({
      workflowId: "wf-1",
      userId: "user-1",
      provider: "asana",
      eventType: "new_task_in_project",
      nodeId: "node-1",
    });
    expect(upsertArg.config).toMatchObject({
      projectId: "p-1",
      handshakePending: true,
      webhookEnabled: false,
    });
    expect(mockUpsert.mock.invocationCallOrder[0]!).toBeLessThan(
      mockWebhooksCreate.mock.invocationCallOrder[0]!,
    );

    // 2. Webhook created against the project with the task+added filter and
    // the strict-direct-lookup URL.
    const createArg = mockWebhooksCreate.mock.calls[0]![0];
    expect(createArg.resourceGid).toBe("p-1");
    expect(createArg.filters).toEqual([
      { resource_type: "task", action: "added" },
    ]);
    expect(createArg.target).toBe(
      "https://app.example.test/api/webhooks/asana?workflowId=wf-1&nodeId=node-1",
    );

    // 3. Patch carries the handshake-persisted secret forward.
    expect(patch).toEqual({
      webhookEnabled: true,
      projectId: "p-1",
      webhookId: "wh-1",
      hookSecretEncrypted: "enc(secret-1)",
      notificationUrl:
        "https://app.example.test/api/webhooks/asana?workflowId=wf-1&nodeId=node-1",
      handshakePending: false,
    });
  });

  it("uses the task+changed filter for task_updated_in_project", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({ gid: "wh-2", active: true });
    mockFind.mockResolvedValueOnce({
      id: "tr-1",
      config: { hookSecretEncrypted: "enc(s)" },
    });
    await buildAsanaActivate("task_updated_in_project")({
      node: node({ projectId: "p-1" }),
      integration: integration(),
      workflowId: "wf-1",
    });
    expect(mockWebhooksCreate.mock.calls[0]![0].filters).toEqual([
      { resource_type: "task", action: "changed" },
    ]);
  });

  it("ASANA-2: uses the field-scoped and subtype-scoped server filters per trigger type", async () => {
    const cases = [
      {
        type: "task_completed" as const,
        filters: [{ resource_type: "task", action: "changed", fields: ["completed"] }],
      },
      {
        type: "task_assigned" as const,
        filters: [{ resource_type: "task", action: "changed", fields: ["assignee"] }],
      },
      {
        type: "comment_added_to_task" as const,
        filters: [
          {
            resource_type: "story",
            action: "added",
            resource_subtype: "comment_added",
          },
        ],
      },
    ];
    for (const c of cases) {
      mockWebhooksCreate.mockResolvedValueOnce({ gid: `wh-${c.type}`, active: true });
      mockFind.mockResolvedValueOnce({
        id: "tr-1",
        config: { hookSecretEncrypted: "enc(s)" },
      });
      await buildAsanaActivate(c.type)({
        node: node({ projectId: "p-1" }),
        integration: integration(),
        workflowId: "wf-1",
      });
      const lastCall =
        mockWebhooksCreate.mock.calls[mockWebhooksCreate.mock.calls.length - 1]!;
      expect(lastCall[0].filters).toEqual(c.filters);
      // Same per-(workflow,node) strict-direct-lookup URL and pending
      // pre-upsert as the ASANA-1 triggers (shared lifecycle).
      const upsertArg = mockUpsert.mock.calls[mockUpsert.mock.calls.length - 1]![0];
      expect(upsertArg.eventType).toBe(c.type);
      expect(upsertArg.config).toMatchObject({ handshakePending: true });
    }
  });

  it("routes the provider call through refreshAndRetry (hourly tokens)", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({ gid: "wh-1", active: true });
    mockFind.mockResolvedValueOnce({
      id: "tr-1",
      config: { hookSecretEncrypted: "enc(s)" },
    });
    await activate({
      node: node({ projectId: "p-1" }),
      integration: integration(),
      workflowId: "wf-1",
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "asana",
      providerAccountId: "marcus@example.test",
    });
  });
});

describe("buildAsanaActivate — failure paths", () => {
  it("throws without a projectId (no upsert, no provider call)", async () => {
    await expect(
      activate({
        node: node({}),
        integration: integration(),
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/projectId is required/);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockWebhooksCreate).not.toHaveBeenCalled();
  });

  it("throws on a legacy row without connectedByUserId", async () => {
    await expect(
      activate({
        node: node({ projectId: "p-1" }),
        integration: integration({ connectedByUserId: null }),
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/connectedByUserId/);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("propagates a webhook-creation failure (activation aborts)", async () => {
    mockWebhooksCreate.mockRejectedValueOnce(new Error("Asana POST /webhooks failed: no"));
    await expect(
      activate({
        node: node({ projectId: "p-1" }),
        integration: integration(),
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/failed/);
  });

  it("fails closed + best-effort deletes the webhook when no secret was persisted", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({ gid: "wh-orphan", active: true });
    mockFind.mockResolvedValueOnce({ id: "tr-1", config: {} }); // no secret
    mockWebhooksDelete.mockResolvedValueOnce(undefined);

    await expect(
      activate({
        node: node({ projectId: "p-1" }),
        integration: integration(),
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/did not persist a secret/);
    expect(mockWebhooksDelete).toHaveBeenCalledTimes(1);
    expect(mockWebhooksDelete.mock.calls[0]![0].webhookGid).toBe("wh-orphan");
  });

  it("still throws the handshake error when the orphan-webhook cleanup itself fails", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({ gid: "wh-orphan", active: true });
    mockFind.mockResolvedValueOnce(null);
    mockWebhooksDelete.mockRejectedValueOnce(new Error("delete also failed"));

    await expect(
      activate({
        node: node({ projectId: "p-1" }),
        integration: integration(),
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/did not persist a secret/);
  });
});
