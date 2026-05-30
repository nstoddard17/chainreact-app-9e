/**
 * @jest-environment node
 *
 * Tests for integrations/native/actions/ifThenCondition — Native-nodes
 * Slice 3 Commit 2 (docs/slices/parity/native-nodes-3-tier-c-control-flow-plan.md §9.2).
 *
 * Boolean branching action backing the engine's label-aware traversal.
 * Operator semantics live in `_conditionEvaluator.ts` (Commit 1, fully
 * tested in `conditionEvaluator.test.ts`); these tests focus on the
 * handler's schema enforcement + branchTaken emission + output shape.
 */

import { ZodError } from "zod";
import { ifThenCondition } from "@/integrations/native/actions/ifThenCondition";
import { IfThenConditionConfigSchema } from "@/integrations/native/actions/ifThenCondition.schema";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const triggerEvent: TriggerEvent = {
  provider: "native",
  eventType: "manual.run",
  eventId: "evt-1",
  occurredAt: "2026-05-16T00:00:00Z",
  providerAccountId: "system",
  payload: {},
};

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "n-if",
    config,
    triggerEvent,
  };
}

// ── Schema tests ────────────────────────────────────────────────────────────

describe("if_then_condition schema", () => {
  it("accepts a valid binary config and defaults onFalse to 'branch'", () => {
    const r = IfThenConditionConfigSchema.parse({
      input: "active",
      operator: "equals",
      value: "active",
    });
    expect(r.onFalse).toBe("branch");
    expect(r.operator).toBe("equals");
  });

  it("rejects missing required fields (input, operator)", () => {
    expect(() => IfThenConditionConfigSchema.parse({})).toThrow(ZodError);
    expect(() =>
      IfThenConditionConfigSchema.parse({ input: "x" }),
    ).toThrow(ZodError);
  });

  it("rejects unknown fields via .strict() (guards V1's dropped continueOnFalse + conditionType)", () => {
    expect(() =>
      IfThenConditionConfigSchema.parse({
        input: "x",
        operator: "equals",
        value: "x",
        continueOnFalse: false,
      }),
    ).toThrow(ZodError);
    expect(() =>
      IfThenConditionConfigSchema.parse({
        input: "x",
        operator: "equals",
        value: "x",
        conditionType: "advanced",
      }),
    ).toThrow(ZodError);
  });

  it("requires `value` for binary operators", () => {
    expect(() =>
      IfThenConditionConfigSchema.parse({
        input: "x",
        operator: "equals",
      }),
    ).toThrow(/binary.*requires/i);
    expect(() =>
      IfThenConditionConfigSchema.parse({
        input: "x",
        operator: "contains",
      }),
    ).toThrow(/binary.*requires/i);
  });

  it("forbids `value` for unary operators (is_empty / is_not_empty / is_truthy / is_falsy)", () => {
    for (const op of ["is_empty", "is_not_empty", "is_truthy", "is_falsy"]) {
      expect(() =>
        IfThenConditionConfigSchema.parse({
          input: "x",
          operator: op,
          value: "anything",
        }),
      ).toThrow(/unary.*does not take/i);
    }
  });

  it("accepts unary operators without `value`", () => {
    for (const op of ["is_empty", "is_not_empty", "is_truthy", "is_falsy"]) {
      const r = IfThenConditionConfigSchema.parse({
        input: "x",
        operator: op,
      });
      expect(r.operator).toBe(op);
      expect(r.value).toBeUndefined();
    }
  });

  it("accepts onFalse: 'skip' and onFalse: 'branch' explicitly", () => {
    expect(
      IfThenConditionConfigSchema.parse({
        input: "x",
        operator: "equals",
        value: "x",
        onFalse: "skip",
      }).onFalse,
    ).toBe("skip");
    expect(
      IfThenConditionConfigSchema.parse({
        input: "x",
        operator: "equals",
        value: "x",
        onFalse: "branch",
      }).onFalse,
    ).toBe("branch");
  });

  it("rejects unknown onFalse values", () => {
    expect(() =>
      IfThenConditionConfigSchema.parse({
        input: "x",
        operator: "equals",
        value: "x",
        onFalse: "ignore",
      }),
    ).toThrow(ZodError);
  });
});

// ── Handler — true branch ───────────────────────────────────────────────────

describe("if_then_condition handler — true branch", () => {
  it("returns branchTaken: 'true' + conditionMet: true when condition matches", async () => {
    const r = await ifThenCondition(
      makeInput({ input: "active", operator: "equals", value: "active" }),
    );
    expect(r.branchTaken).toBe("true");
    expect(r.output.conditionMet).toBe(true);
  });

  it("echoes operator and resolved onFalse in output (debug aid)", async () => {
    const r = await ifThenCondition(
      makeInput({
        input: "hello",
        operator: "contains",
        value: "ell",
      }),
    );
    expect(r.output.operator).toBe("contains");
    expect(r.output.onFalse).toBe("branch"); // default
  });

  it("true branch is the same regardless of onFalse setting", async () => {
    const rBranch = await ifThenCondition(
      makeInput({
        input: 10,
        operator: "greater_than",
        value: 5,
        onFalse: "branch",
      }),
    );
    const rSkip = await ifThenCondition(
      makeInput({
        input: 10,
        operator: "greater_than",
        value: 5,
        onFalse: "skip",
      }),
    );
    expect(rBranch.branchTaken).toBe("true");
    expect(rSkip.branchTaken).toBe("true");
  });
});

// ── Handler — false branch with onFalse: 'branch' (default) ────────────────

describe("if_then_condition handler — false branch (onFalse: 'branch' default)", () => {
  it("returns branchTaken: 'false' + conditionMet: false", async () => {
    const r = await ifThenCondition(
      makeInput({ input: "active", operator: "equals", value: "inactive" }),
    );
    expect(r.branchTaken).toBe("false");
    expect(r.output.conditionMet).toBe(false);
    expect(r.output.onFalse).toBe("branch");
  });

  it("returns 'false' when explicit onFalse: 'branch'", async () => {
    const r = await ifThenCondition(
      makeInput({
        input: 1,
        operator: "greater_than",
        value: 100,
        onFalse: "branch",
      }),
    );
    expect(r.branchTaken).toBe("false");
  });
});

// ── Handler — false branch with onFalse: 'skip' ─────────────────────────────

describe("if_then_condition handler — false branch (onFalse: 'skip')", () => {
  it("returns branchTaken: null on false when onFalse: 'skip' (D-IT6 + skip-rest semantics)", async () => {
    const r = await ifThenCondition(
      makeInput({
        input: "active",
        operator: "equals",
        value: "inactive",
        onFalse: "skip",
      }),
    );
    expect(r.branchTaken).toBeNull();
    expect(r.output.conditionMet).toBe(false);
    expect(r.output.onFalse).toBe("skip");
  });

  it("returns null on false for unary operators too", async () => {
    const r = await ifThenCondition(
      makeInput({
        input: "hello",
        operator: "is_empty",
        onFalse: "skip",
      }),
    );
    expect(r.branchTaken).toBeNull();
    expect(r.output.conditionMet).toBe(false);
  });
});

// ── Handler — unary operators ──────────────────────────────────────────────

describe("if_then_condition handler — unary operators", () => {
  it("is_empty on null → branchTaken: 'true'", async () => {
    const r = await ifThenCondition(
      makeInput({ input: null, operator: "is_empty" }),
    );
    expect(r.branchTaken).toBe("true");
    expect(r.output.conditionMet).toBe(true);
  });

  it("is_empty on numeric 0 → branchTaken: 'false' (zero is NOT empty)", async () => {
    const r = await ifThenCondition(
      makeInput({ input: 0, operator: "is_empty" }),
    );
    expect(r.branchTaken).toBe("false");
    expect(r.output.conditionMet).toBe(false);
  });

  it("is_truthy on empty array → branchTaken: 'true' (JS Boolean([]) is true)", async () => {
    const r = await ifThenCondition(
      makeInput({ input: [], operator: "is_truthy" }),
    );
    expect(r.branchTaken).toBe("true");
  });

  it("is_falsy on numeric 0 → branchTaken: 'true'", async () => {
    const r = await ifThenCondition(
      makeInput({ input: 0, operator: "is_falsy" }),
    );
    expect(r.branchTaken).toBe("true");
  });
});

// ── Handler — operator/type mismatch (D-IT7 defensive false) ───────────────

describe("if_then_condition handler — operator/type mismatch returns false", () => {
  it("greater_than with non-numeric input → branchTaken: 'false' (no throw)", async () => {
    const r = await ifThenCondition(
      makeInput({ input: "abc", operator: "greater_than", value: 5 }),
    );
    expect(r.branchTaken).toBe("false");
    expect(r.output.conditionMet).toBe(false);
  });

  it("contains with non-string non-array input → branchTaken: 'false'", async () => {
    const r = await ifThenCondition(
      makeInput({ input: null, operator: "contains", value: "x" }),
    );
    expect(r.branchTaken).toBe("false");
  });

  it("starts_with with object input → branchTaken: 'false'", async () => {
    const r = await ifThenCondition(
      makeInput({ input: { a: 1 }, operator: "starts_with", value: "y" }),
    );
    expect(r.branchTaken).toBe("false");
  });

  it("type-mismatch false still respects onFalse: 'skip' → branchTaken: null", async () => {
    const r = await ifThenCondition(
      makeInput({
        input: null,
        operator: "contains",
        value: "x",
        onFalse: "skip",
      }),
    );
    expect(r.branchTaken).toBeNull();
  });
});

// ── Handler — defense-in-depth ─────────────────────────────────────────────

describe("if_then_condition handler — defense-in-depth schema parse", () => {
  it("re-parses config and rejects malformed input (binary operator missing value)", async () => {
    await expect(
      ifThenCondition(makeInput({ input: "x", operator: "equals" })),
    ).rejects.toThrow(ZodError);
  });
});
