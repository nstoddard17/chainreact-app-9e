import {
  toMcpAccountDto,
  toMcpWorkflowSummaryDto,
  toMcpWorkflowDetailDto,
  toMcpRunDetailDto,
  toMcpIntegrationDto,
} from "@/services/mcp/tools/serialize";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowRunRecord } from "@/repositories/workflowRuns";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { AccountRecord } from "@/contracts/accounts";

/**
 * No-leak serializer tests (Slice 4.PUBLIC-MCP-6).
 *
 * The MCP server's egress guarantee. Each serializer must drop EVERY sensitive
 * field — token columns, raw provider payloads, node config (can hold secrets),
 * step outputs, engine internals, scopes, provenance ids. These tests deep-scan the
 * serialized JSON for known sensitive markers and assert their absence.
 */

const SENSITIVE_MARKERS = [
  "SECRET-ACCESS-TOKEN",
  "SECRET-REFRESH-TOKEN",
  "SECRET-CONFIG-API-KEY",
  "SECRET-STEP-OUTPUT",
  "SECRET-PROVIDER-PAYLOAD",
  "SECRET-FATAL",
  "connected_by_user_id-SECRET",
];

function assertNoSensitive(value: unknown) {
  const json = JSON.stringify(value);
  for (const marker of SENSITIVE_MARKERS) {
    expect(json).not.toContain(marker);
  }
}

describe("services/mcp/tools/serialize — no-leak boundary", () => {
  it("account DTO carries only id/name/type/role", () => {
    const account = {
      id: "acct-1",
      type: "team",
      name: "Acme",
      ownerUserId: "u-SECRET",
      deletionStatus: "active",
    } as unknown as AccountRecord;
    const dto = toMcpAccountDto(account, "admin");
    expect(dto).toEqual({ id: "acct-1", name: "Acme", type: "team", role: "admin" });
    expect(JSON.stringify(dto)).not.toContain("u-SECRET");
  });

  it("workflow detail strips node config (which may hold secrets)", () => {
    const wf = {
      id: "wf-1",
      accountId: "acct-1",
      createdByUserId: "u-1",
      name: "My flow",
      state: "active",
      draftDefinition: {
        nodes: [
          {
            id: "n1",
            kind: "trigger",
            provider: "gmail",
            type: "new_email",
            config: { apiKey: "SECRET-CONFIG-API-KEY", token: "SECRET-ACCESS-TOKEN" },
            position: { x: 0, y: 0 },
            displayName: "Inbox",
          },
          {
            id: "n2",
            kind: "action",
            provider: "slack",
            type: "send_message",
            config: { webhook: "SECRET-CONFIG-API-KEY" },
            position: { x: 0, y: 1 },
          },
        ],
        edges: [{ id: "e1", from: "n1", to: "n2", label: "ok" }],
      },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    } as unknown as WorkflowRecord;

    const dto = toMcpWorkflowDetailDto(wf);
    assertNoSensitive(dto);
    expect(dto.nodes).toEqual([
      { id: "n1", kind: "trigger", provider: "gmail", type: "new_email", name: "Inbox" },
      { id: "n2", kind: "action", provider: "slack", type: "send_message" },
    ]);
    expect(dto.edges).toEqual([{ from: "n1", to: "n2", label: "ok" }]);
    expect(dto.nodeCount).toBe(2);
    // Every serialized node has NO `config` key.
    for (const n of dto.nodes) expect("config" in n).toBe(false);
  });

  it("run detail strips step outputs, trigger event, fatal error and raw error text", () => {
    const run = {
      id: "run-1",
      workflowId: "wf-1",
      accountId: "acct-1",
      triggeredByUserId: "u-SECRET",
      status: "failed",
      triggerNodeId: "n1",
      triggerEvent: { provider: "gmail", payload: { body: "SECRET-PROVIDER-PAYLOAD" } },
      steps: [
        {
          nodeId: "n1",
          status: "succeeded",
          output: { token: "SECRET-STEP-OUTPUT" },
        },
        {
          nodeId: "n2",
          status: "failed",
          error: { code: "MISSING_VARIABLE", message: "SECRET-PROVIDER-PAYLOAD", details: { x: 1 } },
        },
      ],
      fatalError: { code: "BOOM", message: "SECRET-FATAL" },
      errorClassification: {
        title: "A step couldn't run",
        description: "Reconnect Slack and retry.",
        severity: "error",
      },
      startedAt: "2026-01-01T00:00:00Z",
      finishedAt: "2026-01-01T00:01:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      isTest: false,
      triggeredBy: "manual",
      triggeredByApiKeyId: null,
      triggeredByApiKeyPrefix: null,
    } as unknown as WorkflowRunRecord;

    const dto = toMcpRunDetailDto(run);
    assertNoSensitive(dto);
    expect(dto.error).toEqual({
      title: "A step couldn't run",
      description: "Reconnect Slack and retry.",
      severity: "error",
    });
    expect(dto.steps).toEqual([
      { nodeId: "n1", status: "succeeded", errorCode: null },
      { nodeId: "n2", status: "failed", errorCode: "MISSING_VARIABLE" },
    ]);
    // No step carries an output or raw error message.
    const json = JSON.stringify(dto);
    expect(json).not.toContain("output");
    expect(json).not.toContain("MISSING_VARIABLE_message");
  });

  it("integration DTO strips tokens, scopes, metadata, provider_account_id, provenance", () => {
    const integration = {
      id: "int-1",
      accountId: "acct-1",
      connectedByUserId: "connected_by_user_id-SECRET",
      provider: "slack",
      providerAccountId: "T-WORKSPACE-SECRET",
      displayName: "acme.slack.com",
      accessTokenEncrypted: "SECRET-ACCESS-TOKEN",
      refreshTokenEncrypted: "SECRET-REFRESH-TOKEN",
      accessTokenExpiresAt: null,
      scopes: ["chat:write", "channels:read"],
      accountMetadata: { team: "SECRET-PROVIDER-PAYLOAD" },
      disconnectedAt: null,
      needsReconnectAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    } as unknown as IntegrationRecord;

    const dto = toMcpIntegrationDto(integration);
    assertNoSensitive(dto);
    expect(dto).toEqual({
      id: "int-1",
      provider: "slack",
      displayName: "acme.slack.com",
      status: "connected",
      connectedAt: "2026-01-01T00:00:00Z",
    });
    const json = JSON.stringify(dto);
    expect(json).not.toContain("T-WORKSPACE-SECRET");
    expect(json).not.toContain("chat:write"); // scopes are not exposed
  });

  it("workflow summary excludes the draft definition", () => {
    const wf = {
      id: "wf-1",
      name: "Flow",
      state: "draft",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      draftDefinition: { nodes: [{ config: { k: "SECRET-CONFIG-API-KEY" } }], edges: [] },
    } as unknown as WorkflowRecord;
    const dto = toMcpWorkflowSummaryDto(wf);
    expect(JSON.stringify(dto)).not.toContain("SECRET-CONFIG-API-KEY");
    expect("nodes" in dto).toBe(false);
  });
});
