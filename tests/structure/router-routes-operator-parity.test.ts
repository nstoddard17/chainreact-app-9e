/**
 * @jest-environment node
 *
 * Slice 3.6 — structural test asserting drift parity between the
 * client-side router operator list and the server-side condition
 * evaluator's authoritative list.
 *
 * The renderer's `ROUTER_OPERATORS` const in
 * `features/workflow-builder/config-modal/fields/_routesValidator.ts`
 * is intentionally duplicated from `IF_THEN_OPERATORS` in
 * `integrations/native/actions/_conditionEvaluator.ts` because the
 * `features/` → `integrations/` import boundary is forbidden by
 * project-structure rule §4.
 *
 * If either list grows or shrinks, this test fails — the duplicate
 * must be updated in lockstep, or the structural reference (operators
 * relocated to `core/`) revisited.
 */

import { ROUTER_OPERATORS } from "@/features/workflow-builder/config-modal/fields/_routesValidator";
import { IF_THEN_OPERATORS } from "@/integrations/native/actions/_conditionEvaluator";

describe("Router routes operator parity", () => {
  it("client-side ROUTER_OPERATORS matches server-side IF_THEN_OPERATORS exactly (same order)", () => {
    expect([...ROUTER_OPERATORS]).toEqual([...IF_THEN_OPERATORS]);
  });

  it("both lists have the same length", () => {
    expect(ROUTER_OPERATORS.length).toBe(IF_THEN_OPERATORS.length);
  });
});
