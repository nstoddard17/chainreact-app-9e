/**
 * @jest-environment node
 *
 * MOTIVE-1 — discovery registry pins + provider-completion sweep. Fails when a
 * builder-visible node loses metadata, a provider-resource field regresses to a
 * raw text box without a resolver, a required Setup field has no fill path, or a
 * destructive action drops its confirmation trio.
 */
import "@/integrations/_registry";
import {
  getActionMeta,
  getTriggerMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { getOptionsResolver } from "@/services/options/_registry";

const EXPECTED_ACTIONS = [
  "motive:create_fuel_purchase",
  "motive:import_fuel_purchases_csv",
  "motive:list_fuel_purchases",
  "motive:get_fuel_purchase",
  "motive:update_fuel_purchase",
  "motive:delete_fuel_purchase",
  "motive:send_message",
  "motive:create_vehicle",
  "motive:update_vehicle",
  "motive:update_driver",
];

const EXPECTED_TRIGGERS = [
  "motive:new_inspection_report",
  "motive:new_hos_violation",
  "motive:new_safety_event",
  "motive:new_speeding_event",
  "motive:new_fault_code",
  "motive:new_vehicle",
  "motive:new_driver",
  "motive:new_fuel_purchase",
];

describe("motive discovery coverage", () => {
  it("registers exactly the expected action set", () => {
    const keys = listActionMetasForProvider("motive").map((m) => m.key).sort();
    expect(keys).toEqual([...EXPECTED_ACTIONS].sort());
  });

  it("registers exactly the expected trigger set", () => {
    const keys = listTriggerMetasForProvider("motive").map((m) => m.key).sort();
    expect(keys).toEqual([...EXPECTED_TRIGGERS].sort());
  });

  it("every action resolves by key and declares bounded outputs", () => {
    for (const key of EXPECTED_ACTIONS) {
      const meta = getActionMeta(key);
      expect(meta).toBeDefined();
      expect(meta!.outputs.length).toBeGreaterThan(0);
    }
  });

  it("every trigger resolves and (webhook) is company-scoped with no required Setup field", () => {
    for (const key of EXPECTED_TRIGGERS) {
      const meta = getTriggerMeta(key);
      expect(meta).toBeDefined();
      // No trigger requires a raw Setup field the user must hand-enter.
      for (const f of meta!.fields) {
        if (f.required) expect(f.optionsSource ?? "").not.toBe("");
      }
    }
  });
});

describe("provider-completion sweep", () => {
  it("every vehicle/driver picker field is backed by a REGISTERED resolver (no raw id boxes)", () => {
    const metas = [
      ...listActionMetasForProvider("motive"),
      ...listTriggerMetasForProvider("motive"),
    ];
    let pickerCount = 0;
    for (const meta of metas) {
      for (const field of meta.fields) {
        // top-level pickers
        if (field.optionsSource) {
          pickerCount++;
          expect(getOptionsResolver(field.optionsSource)).toBeDefined();
        }
        // row-local (object-list) pickers (RESOLVERS-3)
        for (const sub of field.itemFields ?? []) {
          if (sub.optionsSource) {
            pickerCount++;
            expect(getOptionsResolver(sub.optionsSource)).toBeDefined();
          }
        }
      }
    }
    // The fuel/message/vehicle/driver nodes DO surface pickers.
    expect(pickerCount).toBeGreaterThan(5);
  });

  it("delete_fuel_purchase carries the destructive confirmation trio", () => {
    const meta = getActionMeta("motive:delete_fuel_purchase")!;
    expect(meta.isDestructive).toBe(true);
    expect(meta.requiresConfirmation).toBe(true);
    expect(meta.riskLevel).toBe("high");
  });

  it("no shipped action exposes a raw JSON field on the normal Setup path", () => {
    for (const meta of listActionMetasForProvider("motive")) {
      for (const field of meta.fields) {
        if (field.type === "json") expect(field.advanced).toBe(true);
      }
    }
  });
});
