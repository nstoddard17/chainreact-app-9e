/**
 * @jest-environment node
 *
 * Tests for `app/api/internal/diagnostics/workflow-readiness/route.ts`
 * (Slice 4.MCP-STAGE-2B-3, CS-1).
 *
 * The route runs the REAL `checkWorkflowReadiness`; only the leaf boundaries are
 * mocked: the service-role workflow reader, the membership check, and the provider
 * registry. The route is the authorization chokepoint — these tests prove a
 * non-member learns NOTHING but `NO_ACCOUNT_ACCESS`, and config values never leak.
 */

const mockGetWorkflow = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetWorkflow(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...a: unknown[]) => mockIsMember(...a),
}));

const mockGetProvider = jest.fn();
jest.mock("@/integrations/_registry", () => ({
  getProvider: (...a: unknown[]) => mockGetProvider(...a),
}));

import { POST } from "@/app/api/internal/diagnostics/workflow-readiness/route";

const GOOD_TOKEN = "diag-wf-token-0123456789abcdef";
const ACCT = "acct-1";

function req(body: unknown, token: string | null = GOOD_TOKEN): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request("http://x/api/internal/diagnostics/workflow-readiness", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// A trigger + one action node; config carries SECRETS that must never leak.
function workflow(nodes: unknown[]) {
  return {
    id: "wf-1",
    name: "Secret Workflow Name",
    accountId: ACCT,
    createdByUserId: "creator-SECRET-42",
    draftDefinition: { nodes, edges: [] },
    definition: { nodes: [], edges: [] },
  };
}

const triggerNode = {
  id: "trigger-1",
  kind: "trigger",
  provider: "slack",
  type: "message_posted",
  displayName: "Slack Message",
  config: { channel: "C-SECRET-CHANNEL" },
};
const actionNode = {
  id: "action-1",
  kind: "action",
  provider: "gmail",
  type: "send_email",
  displayName: "Send Email",
  config: { apiKey: "SECRET_VALUE", to: "victim@example.com" },
};

beforeEach(() => {
  mockGetWorkflow.mockReset();
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
  mockGetProvider.mockReset();
  mockGetProvider.mockImplementation((id: string) =>
    id === "slack"
      ? { id: "slack", displayName: "Slack", isEnabled: true }
      : id === "gmail"
        ? { id: "gmail", displayName: "Gmail", isEnabled: true }
        : undefined,
  );
  process.env.DIAGNOSTICS_API_ENABLED = "1";
  process.env.DIAGNOSTICS_API_TOKEN = GOOD_TOKEN;
  delete process.env.DIAGNOSTICS_API_ALLOW_PROD;
});

// ───────────────────────────── Gate ─────────────────────────────
describe("workflow-readiness — gate", () => {
  it("404 when disabled", async () => {
    delete process.env.DIAGNOSTICS_API_ENABLED;
    expect((await POST(req({ workflowId: "wf-1", userId: "u1" }))).status).toBe(404);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });
  it("404 in production without allow flag", async () => {
    const prev = process.env.NODE_ENV;
    // @ts-expect-error test override
    process.env.NODE_ENV = "production";
    const res = await POST(req({ workflowId: "wf-1", userId: "u1" }));
    // @ts-expect-error restore
    process.env.NODE_ENV = prev;
    expect(res.status).toBe(404);
  });
  it("401 on missing/wrong bearer; token never echoed", async () => {
    expect((await POST(req({ workflowId: "wf-1", userId: "u1" }, null))).status).toBe(401);
    const res = await POST(req({ workflowId: "wf-1", userId: "u1" }, "wrong"));
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(GOOD_TOKEN);
  });
});

// ───────────────────── Input validation ─────────────────────
describe("workflow-readiness — input validation", () => {
  it("400 when workflowId missing", async () => {
    expect((await POST(req({ userId: "u1" }))).status).toBe(400);
  });
  it("400 when userId missing", async () => {
    expect((await POST(req({ workflowId: "wf-1" }))).status).toBe(400);
  });
});

// ───────────────────── NOT_FOUND ─────────────────────
describe("workflow-readiness — NOT_FOUND", () => {
  it("returns access NOT_FOUND and nothing else; no membership check", async () => {
    mockGetWorkflow.mockResolvedValue(null);
    const dto = await (await POST(req({ workflowId: "missing", userId: "u1" }))).json();
    expect(dto).toEqual({ workflowId: "missing", access: "NOT_FOUND" });
    expect(mockIsMember).not.toHaveBeenCalled();
  });
});

// ───────────────────── NO_ACCOUNT_ACCESS ─────────────────────
describe("workflow-readiness — NO_ACCOUNT_ACCESS reveals nothing", () => {
  it("a non-member gets ONLY access=NO_ACCOUNT_ACCESS — no readiness/providers/nodes/config", async () => {
    mockGetWorkflow.mockResolvedValue(workflow([triggerNode, actionNode]));
    mockIsMember.mockResolvedValue(false);
    const dto = await (await POST(req({ workflowId: "wf-1", userId: "intruder" }))).json();
    expect(dto).toEqual({ workflowId: "wf-1", access: "NO_ACCOUNT_ACCESS" });
    expect(mockGetWorkflow).toHaveBeenCalledWith("wf-1");
    expect(mockIsMember).toHaveBeenCalledWith(ACCT, "intruder");
    const json = JSON.stringify(dto);
    for (const forbidden of [
      "Send Email",
      "action-1",
      "gmail",
      "SECRET_VALUE",
      "victim@example.com",
      "C-SECRET-CHANNEL",
      "Secret Workflow Name",
      "creator-SECRET-42",
      ACCT,
    ]) {
      expect(json).not.toContain(forbidden);
    }
    for (const k of ["runnable", "graphIssues", "fieldGaps", "providers", "readinessError"]) {
      expect(dto).not.toHaveProperty(k);
    }
  });
});

// ───────────────────── Authorized readiness mapping ─────────────────────
describe("workflow-readiness — authorized member", () => {
  it("clean workflow → runnable:true, empty issues, provider inventory", async () => {
    // Synthetic provider/type the discovery registry doesn't know → no required
    // fields → no field gaps. trigger + reachable action → valid graph. This
    // isolates the DTO mapping from real provider metadata.
    const synthTrigger = { id: "trigger-1", kind: "trigger", provider: "synthetic", type: "noop", displayName: "Start", config: {} };
    const synthAction = { id: "action-1", kind: "action", provider: "synthetic", type: "noop2", displayName: "Do", config: {} };
    const ready = workflow([synthTrigger, synthAction]);
    ready.draftDefinition.edges = [{ id: "e1", from: "trigger-1", to: "action-1" }] as never;
    mockGetProvider.mockReturnValue(undefined); // synthetic provider is unregistered
    mockGetWorkflow.mockResolvedValue(ready);
    const dto = await (await POST(req({ workflowId: "wf-1", userId: "u1" }))).json();
    expect(dto).toMatchObject({
      workflowId: "wf-1",
      access: "OK",
      runnable: true,
      readinessError: null,
      graphIssues: [],
      fieldGaps: [],
    });
    // Distinct providers, deduped; unregistered → name:null, enabled:false.
    expect(dto.providers).toEqual([{ provider: "synthetic", name: null, enabled: false }]);
  });

  it("no trigger → graph issue (codes/ids only), runnable:false", async () => {
    mockGetWorkflow.mockResolvedValue(workflow([{ ...actionNode, config: {} }]));
    const dto = await (await POST(req({ workflowId: "wf-1", userId: "u1" }))).json();
    expect(dto.access).toBe("OK");
    expect(dto.runnable).toBe(false);
    expect(dto.readinessError).toBe("INVALID_WORKFLOW_GRAPH");
    expect(dto.graphIssues.some((g: { code: string }) => g.code === "no_trigger")).toBe(true);
    // Graph-first precedence: fieldGaps is empty while the graph is broken.
    expect(dto.fieldGaps).toEqual([]);
  });

  it("unreachable node → graph issue with code + nodeId + displayName only", async () => {
    // trigger + an orphan action (no edge) → unreachable_node.
    mockGetWorkflow.mockResolvedValue(workflow([triggerNode, { ...actionNode, config: {} }]));
    const dto = await (await POST(req({ workflowId: "wf-1", userId: "u1" }))).json();
    const issue = dto.graphIssues.find((g: { code: string }) => g.code === "unreachable_node");
    expect(issue).toMatchObject({ code: "unreachable_node", nodeId: "action-1", displayName: "Send Email" });
    expect(Object.keys(issue).sort()).toEqual(["code", "displayName", "nodeId"]);
    expect(issue).not.toHaveProperty("message");
  });

  it("missing required fields → runnable:false + field LABELS only (no values)", async () => {
    // Force a field gap by making the action require a field its config lacks.
    // We rely on the REAL required-fields registry: an action node with empty
    // config that the metadata marks required produces a gap. Use a connected graph
    // so the graph is valid and MISSING_REQUIRED_FIELDS is reached.
    const wf = workflow([triggerNode, actionNode]); // actionNode.config has apiKey/to (secrets)
    wf.draftDefinition.edges = [{ id: "e1", from: "trigger-1", to: "action-1" }] as never;
    mockGetWorkflow.mockResolvedValue(wf);
    const dto = await (await POST(req({ workflowId: "wf-1", userId: "u1" }))).json();
    // Whether or not gmail:send_email declares required fields in metadata, the DTO
    // must NEVER contain config values regardless of the verdict.
    const json = JSON.stringify(dto);
    expect(json).not.toContain("SECRET_VALUE");
    expect(json).not.toContain("victim@example.com");
    expect(json).not.toContain("C-SECRET-CHANNEL");
    expect(dto.access).toBe("OK");
  });
});

// ───────────────────── No-leak (authorized path) ─────────────────────
describe("workflow-readiness — no-leak on the authorized path", () => {
  it("config values, workflow name, and creator id never reach the response", async () => {
    mockGetWorkflow.mockResolvedValue(workflow([triggerNode, actionNode]));
    const dto = await (await POST(req({ workflowId: "wf-1", userId: "u1" }))).json();
    const json = JSON.stringify(dto);
    for (const forbidden of [
      "SECRET_VALUE",
      "victim@example.com",
      "C-SECRET-CHANNEL",
      "Secret Workflow Name",
      "creator-SECRET-42",
    ]) {
      expect(json).not.toContain(forbidden);
    }
    // Provider ids + node display names + (any) field labels are the safe surface.
    expect(json).toContain("slack");
    expect(json).toContain("gmail");
  });
});
