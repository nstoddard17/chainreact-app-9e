/**
 * Tests for the shared current-builder-draft parser
 * (`services/ai/diagnostics/draftOverride.ts`, AI-DIAG-FIX-1). The diagnose /
 * explain / repair routes use it to accept the client's CURRENT builder state for
 * the deterministic diagnosis — strictly validated, never persisted.
 */
import { parseDraftOverride } from "@/services/ai/diagnostics/draftOverride";

const validNode = {
  id: "n1",
  kind: "trigger",
  provider: "native",
  type: "manual_trigger",
  config: {},
  position: { x: 0, y: 0 },
};

describe("parseDraftOverride", () => {
  it("no body / empty object → ok, no override (diagnose saved state)", () => {
    expect(parseDraftOverride(undefined)).toEqual({ ok: true });
    expect(parseDraftOverride(null)).toEqual({ ok: true });
    expect(parseDraftOverride({})).toEqual({ ok: true });
  });

  it("null/absent draftDefinition → ok, no override", () => {
    expect(parseDraftOverride({ draftDefinition: null })).toEqual({ ok: true });
    expect(parseDraftOverride({ other: 1 })).toEqual({ ok: true });
  });

  it("valid draftDefinition → ok with a parsed override (defaults applied)", () => {
    const res = parseDraftOverride({
      draftDefinition: { nodes: [validNode], edges: [] },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.draftOverride?.nodes).toHaveLength(1);
      expect(res.draftOverride?.nodes[0]!.id).toBe("n1");
    }
  });

  it("malformed draftDefinition → ok:false (route maps to 400, never used)", () => {
    // Edge references a non-existent node — WorkflowDefinitionSchema rejects it.
    expect(
      parseDraftOverride({
        draftDefinition: { nodes: [validNode], edges: [{ id: "e1", from: "n1", to: "ghost" }] },
      }),
    ).toEqual({ ok: false });
    // Two triggers — also rejected.
    expect(
      parseDraftOverride({
        draftDefinition: { nodes: [validNode, { ...validNode, id: "n2" }], edges: [] },
      }),
    ).toEqual({ ok: false });
    // Not even an object.
    expect(parseDraftOverride({ draftDefinition: "nope" })).toEqual({ ok: false });
  });
});
