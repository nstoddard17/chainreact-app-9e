/**
 * @jest-environment node
 *
 * REACT-LIVE-SKELETON-3 — anonymous workflow-guidance runner. Proves it reuses the gateway client
 * with NO account/workflow/credential context, gates on Hermes availability (no network when off),
 * and surfaces only the validated plan.
 */
const mockNormalized = jest.fn();
jest.mock("@/services/ai-guidance/gateway/hermesAgentGatewayClient", () => ({
  requestHermesAgentGuidanceNormalized: (...a: unknown[]) => mockNormalized(...a),
}));

const mockEnabled = jest.fn();
const mockConfig = jest.fn();
jest.mock("@/services/ai-guidance/gateway/gatewayConfig", () => ({
  isHermesAgentEnabled: () => mockEnabled(),
  getHermesAgentGatewayConfig: () => mockConfig(),
}));

import { runAnonymousWorkflowGuidance } from "@/services/ai-guidance/anonymousGuidance";

const PLAN = { schemaVersion: 1, title: "P", summary: "", notApplied: true, steps: [{ ref: "s0", role: "trigger", provider: "native", type: "manual.run", purpose: "" }] };

beforeEach(() => {
  mockNormalized.mockReset();
  mockEnabled.mockReset().mockReturnValue(true);
  mockConfig.mockReset().mockReturnValue({ gatewayUrl: "https://gw.example.com", gatewayToken: "tok", timeoutMs: 30000 });
});

describe("runAnonymousWorkflowGuidance", () => {
  it("returns the validated plan and sends NO account/workflow/credential context", async () => {
    mockNormalized.mockResolvedValue({ ok: true, guidanceText: "Here's a plan.", source: "hermes-agent", workflowPlan: PLAN });
    const res = await runAnonymousWorkflowGuidance({ goalText: "send a slack message when a lead comes in" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.workflowPlan).toEqual(PLAN);
    // The gateway call carried only the empty request + goal — no context, no capabilityCatalog, no scope.
    const args = mockNormalized.mock.calls[0]![0];
    expect(args.request.workflow).toEqual({ nodeCount: 0, edgeCount: 0, nodes: [], edges: [] });
    expect(args.context).toBeUndefined();
    expect(args.capabilityCatalog).toBeUndefined();
    expect(args).not.toHaveProperty("scope");
  });

  it("forwards bounded recentTurns when provided", async () => {
    mockNormalized.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan: null });
    await runAnonymousWorkflowGuidance({ goalText: "g", recentTurns: [{ role: "user", text: "hi" }] });
    expect(mockNormalized.mock.calls[0]![0].recentTurns).toEqual([{ role: "user", text: "hi" }]);
  });

  it("gates closed when Hermes is disabled — NO network call", async () => {
    mockEnabled.mockReturnValue(false);
    const res = await runAnonymousWorkflowGuidance({ goalText: "g" });
    expect(res).toMatchObject({ ok: false, code: "PROVIDER_DISABLED" });
    expect(mockNormalized).not.toHaveBeenCalled();
  });

  it("gates closed when the gateway is unconfigured", async () => {
    mockConfig.mockReturnValue(null);
    const res = await runAnonymousWorkflowGuidance({ goalText: "g" });
    expect(res).toMatchObject({ ok: false, code: "PROVIDER_NOT_CONFIGURED" });
    expect(mockNormalized).not.toHaveBeenCalled();
  });

  it("maps a gateway failure to a safe unavailable result (no raw detail)", async () => {
    mockNormalized.mockResolvedValue({ ok: false, code: "PROVIDER_ERROR", reason: "status_502" });
    const res = await runAnonymousWorkflowGuidance({ goalText: "g" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("PROVIDER_ERROR");
      expect(res.message).not.toContain("502");
    }
  });
});
