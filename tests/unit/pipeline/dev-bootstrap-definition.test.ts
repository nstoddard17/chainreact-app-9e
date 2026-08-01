/**
 * @jest-environment node
 *
 * HOSTED-DEV-WORKFLOW-DEFINITION-CRASH-1 — the dev bootstrap's synthetic
 * workflow must use the canonical WorkflowDefinition shape, and its repair
 * path must be scoped to the synthetic row alone.
 *
 * The script is .mjs and cannot import the TS contract, so it duplicates the
 * canonical empty shape; these tests pin the duplicate to the real
 * EMPTY_WORKFLOW_DEFINITION and pin the script text to the safety properties
 * (a live repair run against the hosted dev project is the integration proof).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EMPTY_WORKFLOW_DEFINITION,
  WorkflowDefinitionSchema,
} from "@/contracts/workflowDefinition";

const script = readFileSync(resolve(__dirname, "../../../scripts/dev-bootstrap.mjs"), "utf8");

describe("dev-bootstrap synthetic workflow definition", () => {
  it("declares the canonical empty definition — identical to EMPTY_WORKFLOW_DEFINITION", () => {
    const m = script.match(/const CANONICAL_EMPTY_DEFINITION = (\{[^;]*\});/);
    expect(m).not.toBeNull();
    // The literal is plain JSON-compatible; evaluate it safely via Function.
    const declared = new Function(`return ${m![1]}`)() as unknown;
    expect(declared).toEqual(EMPTY_WORKFLOW_DEFINITION);
    expect(WorkflowDefinitionSchema.safeParse(declared).success).toBe(true);
  });

  it("never inserts the crash-causing bare `{}` definition", () => {
    expect(script).not.toMatch(/draft_definition:\s*\{\s*\}/);
    expect(script).toMatch(/draft_definition:\s*CANONICAL_EMPTY_DEFINITION/);
  });

  it("repairs a non-canonical synthetic row, keyed by the exact row id from the name-scoped lookup", () => {
    expect(script).toContain("isCanonicalDefinition(row.draft_definition)");
    // The update targets exactly the row found by the synthetic-name lookup —
    // never a broader predicate that could touch user-created workflows.
    expect(script).toMatch(/\.update\(\{ draft_definition: CANONICAL_EMPTY_DEFINITION \}\)\s*\n?\s*\.eq\("id", row\.id\)/);
  });

  it("stays idempotent: a canonical row short-circuits before any write", () => {
    expect(script).toMatch(/isCanonicalDefinition\(row\.draft_definition\)\)\s*\{\s*\n?\s*console\.log\(` {2}= sample workflow \(exists, canonical\)`\);\s*\n?\s*return;/);
  });
});
