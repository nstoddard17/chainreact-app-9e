/**
 * @jest-environment node
 *
 * Tests for integrations/native/triggers/manualTrigger — Native-nodes
 * Slice 2 Commit 1 (docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md §10.1).
 *
 * Manual trigger is a pure shape/registration module — no activation
 * hook, no provider-side I/O. These tests cover the resolved-config
 * schema, the run-now payload schema, and the exported event-type
 * constants.
 */

import { ZodError } from "zod";
import {
  MANUAL_TRIGGER_EVENT_TYPE,
  MANUAL_TRIGGER_PROVIDER,
  ManualTriggerConfigSchema,
  ManualTriggerPayloadSchema,
} from "@/integrations/native/triggers/manualTrigger";

describe("manualTrigger — constants", () => {
  it("MANUAL_TRIGGER_PROVIDER === 'native'", () => {
    expect(MANUAL_TRIGGER_PROVIDER).toBe("native");
  });

  it("MANUAL_TRIGGER_EVENT_TYPE === 'manual.run'", () => {
    expect(MANUAL_TRIGGER_EVENT_TYPE).toBe("manual.run");
  });
});

describe("ManualTriggerConfigSchema", () => {
  it("accepts an empty object", () => {
    expect(ManualTriggerConfigSchema.parse({})).toEqual({});
  });

  it("rejects unknown fields (.strict — V1 cosmetic flags fail loud)", () => {
    expect(() =>
      ManualTriggerConfigSchema.parse({ description: "x" }),
    ).toThrow(ZodError);
  });

  it("rejects non-object inputs", () => {
    expect(() => ManualTriggerConfigSchema.parse(null)).toThrow(ZodError);
    expect(() => ManualTriggerConfigSchema.parse("string")).toThrow(ZodError);
    expect(() => ManualTriggerConfigSchema.parse(42)).toThrow(ZodError);
  });
});

describe("ManualTriggerPayloadSchema", () => {
  it("accepts a payload with an empty inputs object", () => {
    expect(ManualTriggerPayloadSchema.parse({ inputs: {} })).toEqual({
      inputs: {},
    });
  });

  it("accepts arbitrary JSON-shaped inputs", () => {
    const payload = {
      inputs: {
        foo: 1,
        bar: "text",
        baz: { nested: true, list: [1, 2, 3] },
        nullable: null,
      },
    };
    expect(ManualTriggerPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("defaults `inputs` to an empty object when omitted", () => {
    expect(ManualTriggerPayloadSchema.parse({})).toEqual({ inputs: {} });
  });

  it("rejects extension fields at the top level (.strict)", () => {
    expect(() =>
      ManualTriggerPayloadSchema.parse({ inputs: {}, metadata: "x" }),
    ).toThrow(ZodError);
  });

  it("rejects when `inputs` is not an object", () => {
    expect(() =>
      ManualTriggerPayloadSchema.parse({ inputs: "string" }),
    ).toThrow(ZodError);
    expect(() =>
      ManualTriggerPayloadSchema.parse({ inputs: [1, 2] }),
    ).toThrow(ZodError);
  });

  it("does not strip nested keys (the payload is opaque JSON)", () => {
    const payload = {
      inputs: {
        deeply: { nested: { values: { stay: "intact" } } },
      },
    };
    expect(ManualTriggerPayloadSchema.parse(payload)).toEqual(payload);
  });
});
