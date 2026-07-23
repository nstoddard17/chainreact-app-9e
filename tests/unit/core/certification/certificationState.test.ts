/**
 * @jest-environment node
 *
 * Provider certification state model (CS-4 MCP-DRIFT). Proves the state
 * vocabulary is complete, plain-language, and that `blocked` is the ONLY state
 * that withholds execution — the single fact the runtime drift gate depends on.
 */
import {
  ALL_CERTIFICATION_STATES,
  CERTIFICATION_STATES,
  certificationStateInfo,
  isExecutionAllowed,
  type CertificationState,
} from "@/core/certification/certificationState";

describe("certification state model", () => {
  it("covers exactly the six health states", () => {
    expect([...ALL_CERTIFICATION_STATES].sort()).toEqual(
      ["blocked", "certification_pending", "deprecated", "experimental", "healthy", "needs_review"].sort(),
    );
  });

  it("only `blocked` withholds execution", () => {
    for (const s of ALL_CERTIFICATION_STATES) {
      expect(isExecutionAllowed(s)).toBe(s !== "blocked");
      expect(certificationStateInfo(s).executionAllowed).toBe(s !== "blocked");
    }
  });

  it("blocked is an error the user should understand as a protection, not a fault", () => {
    const info = certificationStateInfo("blocked");
    expect(info.executionAllowed).toBe(false);
    expect(info.severity).toBe("error");
    expect(info.needsReview).toBe(true);
    // Plain language — no protocol jargon.
    expect(info.label.toLowerCase()).not.toMatch(/mcp|schema|protocol|tool/);
    expect(info.description.toLowerCase()).not.toMatch(/mcp|json-rpc|tools\/list/);
  });

  it("needs_review runs but is flagged; healthy runs cleanly", () => {
    expect(certificationStateInfo("needs_review")).toMatchObject({ executionAllowed: true, needsReview: true, severity: "warning" });
    expect(certificationStateInfo("healthy")).toMatchObject({ executionAllowed: true, needsReview: false });
  });

  it("every state has non-empty, jargon-free label + description", () => {
    for (const s of ALL_CERTIFICATION_STATES) {
      const info = CERTIFICATION_STATES[s];
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.description.length).toBeGreaterThan(0);
      expect(info.label.toLowerCase()).not.toContain("mcp");
    }
  });

  it("is provider-agnostic — no MCP concept leaks into the type surface", () => {
    // A compile-time assurance mirrored at runtime: state ids are generic words.
    const ids: CertificationState[] = [...ALL_CERTIFICATION_STATES];
    expect(ids.every((s) => !s.includes("mcp"))).toBe(true);
  });
});
