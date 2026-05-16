/**
 * @jest-environment node
 *
 * Type-contract tests for services/execution/handlers/types.ts.
 *
 * ActionHandlerResult is a plain TypeScript interface (not a Zod schema)
 * because the handler return shape is statically known to every handler
 * file. These tests use `@ts-expect-error` to prove the compiler enforces
 * the contract: any drift in ActionHandlerResult.branchTaken's type makes
 * `npx tsc --noEmit` fail. There is also a small runtime assertion per
 * case so jest counts the test toward the suite.
 *
 * Engine-branching Commit 1 adds `branchTaken?: string | null`. See
 * docs/slices/parity/engine-branching-plan.md §3.2.
 */
import type { ActionHandlerResult } from "@/services/execution/handlers/types";

describe("ActionHandlerResult — branchTaken contract", () => {
  it("accepts a result with no branchTaken (legacy / provider handlers)", () => {
    const r: ActionHandlerResult = { output: { messageId: "m1" } };
    expect(r.branchTaken).toBeUndefined();
  });

  it("accepts an explicit branchTaken: undefined", () => {
    const r: ActionHandlerResult = {
      output: { ok: true },
      branchTaken: undefined,
    };
    expect(r.branchTaken).toBeUndefined();
  });

  it("accepts branchTaken: string (selected branch label)", () => {
    const r: ActionHandlerResult = {
      output: { matched: "yes" },
      branchTaken: "yes",
    };
    expect(r.branchTaken).toBe("yes");
  });

  it("accepts branchTaken: null (skip all labeled outgoing edges)", () => {
    const r: ActionHandlerResult = {
      output: { skipped: true },
      branchTaken: null,
    };
    expect(r.branchTaken).toBeNull();
  });

  it("rejects branchTaken: number (compile-time)", () => {
    const r: ActionHandlerResult = {
      output: {},
      // @ts-expect-error — branchTaken must be string | null | undefined.
      branchTaken: 42,
    };
    expect(r.output).toEqual({});
  });

  it("rejects branchTaken: boolean (compile-time)", () => {
    const r: ActionHandlerResult = {
      output: {},
      // @ts-expect-error — booleans are not branch labels.
      branchTaken: true,
    };
    expect(r.output).toEqual({});
  });

  it("rejects branchTaken: object (compile-time)", () => {
    const r: ActionHandlerResult = {
      output: {},
      // @ts-expect-error — only primitive string | null | undefined.
      branchTaken: { label: "yes" },
    };
    expect(r.output).toEqual({});
  });

  it("rejects branchTaken: string[] (compile-time)", () => {
    const r: ActionHandlerResult = {
      output: {},
      // @ts-expect-error — multi-branch is not supported in this contract
      // (multiple matching labels are expressed via per-edge labels and
      // a single branchTaken string).
      branchTaken: ["yes", "no"],
    };
    expect(r.output).toEqual({});
  });

  it("output stays the required field — empty result {} is rejected (compile-time)", () => {
    // @ts-expect-error — `output` is required.
    const r: ActionHandlerResult = {};
    expect(r).toBeDefined();
  });
});
