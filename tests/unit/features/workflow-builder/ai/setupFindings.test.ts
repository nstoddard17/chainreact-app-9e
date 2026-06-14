/**
 * Tests for CHECK-ACTIONS-1 — `setupFindingCards`, the pure classifier behind the
 * "Needs setup" group on the Check workflow card.
 *
 * Proves: only `source: "connection"` findings become setup cards; reconnect-class
 * codes get an `/apps` link, owner/disabled/unknown codes get guidance-only (no
 * action); the rendered label is the provider's PUBLIC name (slug fallback) and never
 * a raw code/scope; finding order + severity are preserved.
 */
import { setupFindingCards } from "@/features/workflow-builder/ai/setupFindings";
import type { AgentWorkflowDiagnosis } from "@/lib/api/ai";

const conn = (
  code: string,
  extra: Record<string, unknown> = {},
) => ({
  source: "connection",
  code,
  severity: code === "TOKEN_EXPIRED" ? "warning" : "error",
  title: "x",
  provider: "slack",
  providerName: "Slack",
  nodeIds: ["s1"],
  ...extra,
});

const dx = (findings: unknown[]): AgentWorkflowDiagnosis =>
  ({ workflowId: "w", access: "OK", findings } as never);

describe("setupFindingCards — selection", () => {
  it("returns [] for null / no findings / only non-connection findings", () => {
    expect(setupFindingCards(null)).toEqual([]);
    expect(setupFindingCards(dx([]))).toEqual([]);
    expect(
      setupFindingCards(
        dx([
          { source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "x", nodeIds: ["s1"] },
          { source: "graph", code: "no_trigger", severity: "error", title: "x" },
          { source: "run", code: "RECENT_RUN_FAILED", severity: "warning", title: "x" },
        ]),
      ),
    ).toEqual([]);
  });

  it("preserves finding order across multiple connection findings", () => {
    const cards = setupFindingCards(
      dx([
        conn("DISCONNECTED", { provider: "slack", providerName: "Slack" }),
        conn("RECONNECT_REQUIRED", { provider: "notion", providerName: "Notion" }),
      ]),
    );
    expect(cards.map((c) => c.providerLabel)).toEqual(["Slack", "Notion"]);
  });
});

describe("setupFindingCards — reconnect-actionable codes get an /apps link", () => {
  it.each([
    ["DISCONNECTED", "Connect Slack in Apps"],
    ["RECONNECT_REQUIRED", "Reconnect Slack in Apps"],
    ["TOKEN_EXPIRED", "Reconnect Slack in Apps"],
    ["MISSING_SCOPES", "Reconnect Slack in Apps"],
  ])("%s → /apps action '%s'", (code, label) => {
    const [card] = setupFindingCards(dx([conn(code)]));
    expect(card!.action).toEqual({ href: "/apps", label });
  });

  it("DISCONNECTED uses 'Connect', other reconnect codes use 'Reconnect'", () => {
    const d = setupFindingCards(dx([conn("DISCONNECTED")]))[0]!;
    const r = setupFindingCards(dx([conn("RECONNECT_REQUIRED")]))[0]!;
    expect(d.action!.label.startsWith("Connect ")).toBe(true);
    expect(r.action!.label.startsWith("Reconnect ")).toBe(true);
  });
});

describe("setupFindingCards — guidance-only codes have no action", () => {
  it.each(["NOT_WORKFLOW_OWNER", "PROVIDER_DISABLED", "PROVIDER_UNKNOWN", "SOMETHING_NEW"])(
    "%s → action null (no broken button)",
    (code) => {
      const [card] = setupFindingCards(dx([conn(code)]));
      expect(card!.action).toBeNull();
    },
  );

  it("NOT_WORKFLOW_OWNER guidance says the creator must reconnect", () => {
    const [card] = setupFindingCards(dx([conn("NOT_WORKFLOW_OWNER")]));
    expect(card!.message).toContain("creator");
    expect(card!.message.toLowerCase()).toContain("can't be done from your account");
  });
});

describe("setupFindingCards — no-leak + labels", () => {
  it("renders the public provider NAME, falling back to slug, then a generic label", () => {
    expect(setupFindingCards(dx([conn("DISCONNECTED", { providerName: "Slack" })]))[0]!.providerLabel).toBe("Slack");
    expect(
      setupFindingCards(dx([conn("DISCONNECTED", { provider: "slack", providerName: null })]))[0]!.providerLabel,
    ).toBe("slack");
    expect(
      setupFindingCards(dx([conn("DISCONNECTED", { provider: undefined, providerName: null })]))[0]!.providerLabel,
    ).toBe("This connection");
  });

  it("never surfaces the raw code or scope names in the message", () => {
    const [card] = setupFindingCards(
      dx([conn("MISSING_SCOPES", { missingScopes: ["channels:read", "chat:write"] })]),
    );
    expect(card!.message).not.toContain("MISSING_SCOPES");
    expect(card!.message).not.toContain("channels:read");
    expect(card!.message).not.toContain("chat:write");
  });

  it("carries severity through (TOKEN_EXPIRED warning, others error)", () => {
    expect(setupFindingCards(dx([conn("TOKEN_EXPIRED")]))[0]!.severity).toBe("warning");
    expect(setupFindingCards(dx([conn("DISCONNECTED")]))[0]!.severity).toBe("error");
  });
});
