/** @jest-environment node */
/**
 * CONFIG-UX-SETUP-ADVANCED-1 — if/then meta ↔ runtime parity.
 *
 * The builder's operator options MUST be exactly the runtime enum — a
 * drifted option value saves a config the handler's `z.enum` rejects at
 * run time (this bit real users: the meta shipped
 * `greater_than_or_equal` while the runtime enum is `greater_equal`).
 * Also pins the Value field's conditional contract to the runtime's
 * unary/binary superRefine.
 */
import { ifThenConditionMeta } from "@/integrations/native/actions/ifThenCondition.meta";
import { IF_THEN_OPERATORS } from "@/integrations/native/actions/_conditionEvaluator";
import { IfThenConditionConfigSchema } from "@/integrations/native/actions/ifThenCondition.schema";
import { isVisibleWhenMet } from "@/contracts/actionMeta";

const operatorField = ifThenConditionMeta.fields.find((f) => f.name === "operator")!;
const valueField = ifThenConditionMeta.fields.find((f) => f.name === "value")!;

const UNARY = ["is_empty", "is_not_empty", "is_truthy", "is_falsy"];

describe("if/then meta ↔ runtime operator parity", () => {
  it("every meta option value is a runtime operator, and vice versa", () => {
    const metaValues = (operatorField.options ?? []).map((o) => o.value).sort();
    expect(metaValues).toEqual([...IF_THEN_OPERATORS].sort());
  });

  it("every operator the builder offers produces a runtime-parseable config", () => {
    for (const option of operatorField.options ?? []) {
      const isUnary = UNARY.includes(option.value);
      const config = {
        input: "x",
        operator: option.value,
        ...(isUnary ? {} : { value: "y" }),
      };
      expect(() => IfThenConditionConfigSchema.parse(config)).not.toThrow();
    }
  });
});

describe("if/then Value field — conditional contract mirrors runtime cardinality", () => {
  it("Value is required and visible exactly for the binary operators", () => {
    expect(valueField.required).toBe(true);
    for (const op of IF_THEN_OPERATORS) {
      const visible = isVisibleWhenMet(valueField.visibleWhen, { operator: op });
      expect({ op, visible }).toEqual({ op, visible: !UNARY.includes(op) });
    }
  });

  it("runtime rejects a stale value on a unary operator (why the visibility cascade clears it)", () => {
    expect(() =>
      IfThenConditionConfigSchema.parse({
        input: "x",
        operator: "is_empty",
        value: "stale",
      }),
    ).toThrow();
  });
});
