/**
 * @jest-environment node
 *
 * Tests for the server-side readiness gates (`services/workflows/executionReadiness`).
 *
 * `checkWritePathReadiness` (AI-READINESS-CONVERGENCE CS-2) is the WRITE-PATH gate used
 * by Activate + Publish: it composes the shared runtime verdict (`checkWorkflowReadiness`
 * — graph integrity incl. self-loops, required fields) with a broken deleted-step
 * variable-reference check. The runtime gate (`checkWorkflowReadiness`, used by
 * engine pre-dispatch / run-now) is deliberately UNCHANGED — it must NOT scan invalid
 * refs, so an already-live definition with a dangling ref keeps running.
 *
 * Uses the REAL discovery registry (native:manual.run trigger + native:http_request
 * action) so required-field resolution is exercised end to end.
 */
import {
  checkWorkflowReadiness,
  checkWritePathReadiness,
} from "@/services/workflows/executionReadiness";
import type { WorkflowDefinition } from "@/contracts/workflow";

function trigger() {
  return { id: "t1", kind: "trigger" as const, provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } };
}
function http(config: Record<string, unknown>) {
  return { id: "a1", kind: "action" as const, provider: "native", type: "http_request", config, position: { x: 0, y: 100 } };
}
const edge = { id: "e1", from: "t1", to: "a1" };
const def = (nodes: unknown[], edges: unknown[] = [edge]): WorkflowDefinition =>
  ({ nodes, edges }) as unknown as WorkflowDefinition;

const CLEAN = def([trigger(), http({ method: "GET", url: "https://example.com" })]);
// `url` is a NON-EMPTY string (so the required-field check passes) but references a node
// that isn't in the graph → a broken/deleted-step reference.
const BROKEN_REF = def([trigger(), http({ method: "GET", url: "{{ghost.endpoint}}" })]);

describe("checkWritePathReadiness (CS-2)", () => {
  it("returns null for a clean, configured workflow", () => {
    expect(checkWritePathReadiness(CLEAN)).toBeNull();
  });

  it("flags a broken deleted-step variable reference as INVALID_VARIABLE_REFERENCE", () => {
    const result = checkWritePathReadiness(BROKEN_REF);
    expect(result?.error).toBe("INVALID_VARIABLE_REFERENCE");
    expect(result && "references" in result && result.references).toEqual([
      { nodeId: "a1", fieldKey: "url" },
    ]);
  });

  it("structural/field problems take precedence over a broken reference", () => {
    // Orphan action (no edge) AND a broken ref → the structural verdict wins.
    const result = checkWritePathReadiness(def([trigger(), http({ method: "GET", url: "{{ghost.x}}" })], []));
    expect(result?.error).toBe("INVALID_WORKFLOW_GRAPH");
  });

  it("surfaces a self-loop (CS-1) through the write-path gate too", () => {
    const result = checkWritePathReadiness(
      def([trigger(), http({ method: "GET", url: "https://example.com" })], [edge, { id: "e-loop", from: "a1", to: "a1" }]),
    );
    expect(result?.error).toBe("INVALID_WORKFLOW_GRAPH");
  });

  it("no-leak: the rejection payload carries no config VALUE or raw {{...}} token", () => {
    const json = JSON.stringify(checkWritePathReadiness(BROKEN_REF));
    expect(json).not.toContain("ghost");
    expect(json).not.toContain("{{");
    expect(json).not.toContain("endpoint");
  });

  describe("engine pre-dispatch is NOT changed (invalid refs stay out of the runtime gate)", () => {
    it("checkWorkflowReadiness IGNORES a broken variable reference (live defs keep running)", () => {
      // The runtime gate (engine.ts / run-now) uses THIS function. It must NOT flag the
      // dangling ref — only the write-path gate does.
      expect(checkWorkflowReadiness(BROKEN_REF)).toBeNull();
      // …while the write-path gate DOES flag the very same definition.
      expect(checkWritePathReadiness(BROKEN_REF)?.error).toBe("INVALID_VARIABLE_REFERENCE");
    });
  });
});
