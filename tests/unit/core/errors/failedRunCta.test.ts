/** @jest-environment node */
/**
 * CR-FAILREASON-2 — failedRunCta mapping (one primary CTA per classified action).
 */
import { failedRunCta } from "@/core/errors/failedRunCta";

const ctx = { workflowId: "wf-123" };

describe("failedRunCta", () => {
  it("reconnect → Apps page", () => {
    expect(failedRunCta("reconnect", ctx)).toEqual({
      label: "Reconnect app",
      href: "/apps",
    });
  });

  it("upgrade_plan → billing/plan page (/account)", () => {
    expect(failedRunCta("upgrade_plan", ctx)).toEqual({
      label: "Upgrade plan",
      href: "/account",
    });
  });

  it("open_node → the builder for that workflow (safe 'fix setup' fallback)", () => {
    expect(failedRunCta("open_node", ctx)).toEqual({
      label: "Fix workflow setup",
      href: "/workflows/wf-123",
    });
  });

  it("open_node encodes the workflow id", () => {
    const cta = failedRunCta("open_node", { workflowId: "a/b c" });
    expect(cta?.href).toBe(`/workflows/${encodeURIComponent("a/b c")}`);
  });

  it("retry_later → guidance only (no invented retry route)", () => {
    expect(failedRunCta("retry_later", ctx)).toEqual({
      label: "Try again later",
      href: null,
    });
  });

  it("contact_support → guidance only (no support route exists)", () => {
    expect(failedRunCta("contact_support", ctx)).toEqual({
      label: "Contact support",
      href: null,
    });
  });

  it("review_pending → guidance only (CS-4; no review route exists yet)", () => {
    expect(failedRunCta("review_pending", ctx)).toEqual({
      label: "ChainReact is reviewing this",
      href: null,
    });
  });

  it("missing action → null (no CTA)", () => {
    expect(failedRunCta(undefined, ctx)).toBeNull();
  });

  it("unknown/legacy action value → null (no crash, no misleading CTA)", () => {
    expect(failedRunCta("totally_unknown" as never, ctx)).toBeNull();
  });

  it("no-leak: hrefs are static internal routes carrying at most the workflow id", () => {
    for (const action of [
      "reconnect",
      "upgrade_plan",
      "open_node",
      "retry_later",
      "review_pending",
      "contact_support",
    ] as const) {
      const cta = failedRunCta(action, { workflowId: "wf-123" });
      if (!cta?.href) continue;
      // Only ever a fixed path, optionally + the workflow id. Never a token,
      // email, provider account id, or query payload.
      expect(cta.href).toMatch(/^\/(apps|account|workflows\/wf-123)$/);
    }
  });
});
