/**
 * Unit tests for the TriggerMeta Zod contract.
 *
 * Mirrors actionMeta.test.ts shape but covers trigger-specific concerns:
 *   - activation enum is one of webhook / polling / manual / scheduled.
 *   - dotted trigger keys allowed (e.g. native:schedule.fired).
 *   - payloadShape defaults to [] and accepts nested object outputs.
 *   - duplicate field names rejected.
 *   - strict mode rejects unknown top-level fields.
 */
import {
  TriggerMetaSchema,
  type TriggerMeta,
} from "@/contracts/triggerMeta";

function validTriggerMeta(overrides: Partial<TriggerMeta> = {}): unknown {
  return {
    key: "native:thing.fired",
    provider: "native",
    type: "thing.fired",
    displayName: "Thing Fired",
    description: "Fires when the thing happens.",
    category: "logic",
    activation: "manual",
    requiresIntegration: false,
    fields: [],
    ...overrides,
  };
}

describe("TriggerMetaSchema — happy path", () => {
  it("parses a minimal valid meta", () => {
    const parsed = TriggerMetaSchema.parse(validTriggerMeta());
    expect(parsed.key).toBe("native:thing.fired");
    expect(parsed.activation).toBe("manual");
    expect(parsed.payloadShape).toEqual([]);
    expect(parsed.displayOrder).toBeNull();
  });

  it("accepts a dotted trigger key (event-type suffix)", () => {
    expect(() =>
      TriggerMetaSchema.parse(
        validTriggerMeta({
          key: "native:schedule.fired",
          type: "schedule.fired",
        }),
      ),
    ).not.toThrow();
  });

  it("accepts every activation enum value", () => {
    for (const activation of ["webhook", "polling", "manual", "scheduled"] as const) {
      expect(() =>
        TriggerMetaSchema.parse(validTriggerMeta({ activation })),
      ).not.toThrow();
    }
  });
});

describe("TriggerMetaSchema — invariants", () => {
  it("rejects a meta whose key does not match provider:type", () => {
    const result = TriggerMetaSchema.safeParse(
      validTriggerMeta({ key: "native:other" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toMatch(/must equal/);
    }
  });

  it("rejects duplicate field names in trigger config", () => {
    const result = TriggerMetaSchema.safeParse(
      validTriggerMeta({
        fields: [
          {
            name: "a",
            label: "A",
            type: "text",
            required: true,
          },
          {
            name: "a",
            label: "A again",
            type: "text",
            required: false,
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    const result = TriggerMetaSchema.safeParse({
      ...(validTriggerMeta() as object),
      surprise: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown activation values", () => {
    const result = TriggerMetaSchema.safeParse(
      validTriggerMeta({
        activation: "telepathy" as unknown as TriggerMeta["activation"],
      }),
    );
    expect(result.success).toBe(false);
  });
});

describe("TriggerMetaSchema — payloadShape", () => {
  it("accepts a single object payload with nested fields", () => {
    expect(() =>
      TriggerMetaSchema.parse(
        validTriggerMeta({
          payloadShape: [
            {
              name: "inputs",
              type: "object",
              fields: [
                { name: "name", type: "string" },
                { name: "count", type: "number" },
              ],
            },
          ],
        }),
      ),
    ).not.toThrow();
  });
});
