/**
 * @jest-environment node
 *
 * Discovery-surface tests for Typeform — Slice 5.TYPEFORM-1.
 *
 * Asserts the builder/AI-visible catalog is complete + consistent:
 * ZERO action metas (deliberate — the form_response payload is
 * self-contained), 1 webhook trigger meta, key format, options-source
 * wiring against the real resolver registry, activation/deactivation/
 * filter hook registration, and the sensitive posture of the payload
 * (answers + hidden carry respondent content).
 */
import {
  getTriggerMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { getOptionsResolver } from "@/services/options/_registry";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { getTriggerFilter } from "@/core/triggers/filterRegistry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";
// Side-effect: register the trigger hooks like every prod entrypoint does.
import "@/integrations/_registry";

const TRIGGER_KEY = "typeform:new_response_in_form";

describe("typeform action discovery — deliberately empty", () => {
  it("registers ZERO action metas and ZERO handlers (actions:false is honest)", () => {
    expect(listActionMetasForProvider("typeform")).toEqual([]);
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "typeform",
    );
    expect(handlers).toEqual([]);
  });
});

describe("typeform trigger discovery", () => {
  it("registers exactly the 1 form-webhook trigger meta", () => {
    const metas = listTriggerMetasForProvider("typeform");
    expect(metas.map((m) => m.key)).toEqual([TRIGGER_KEY]);
    expect(metas[0]!.activation).toBe("webhook");
    expect(metas[0]!.requiresIntegration).toBe(true);
  });

  it("has activation + deactivation hooks + a P-S2 formId filter registered", () => {
    expect(findActivation("typeform", "new_response_in_form")).not.toBeNull();
    expect(findDeactivation("typeform", "new_response_in_form")).not.toBeNull();
    expect(getTriggerFilter("typeform", "new_response_in_form")).not.toBeNull();
  });

  it("payload shape matches normalize.ts and marks respondent content sensitive", () => {
    const meta = getTriggerMeta(TRIGGER_KEY)!;
    const names = meta.payloadShape.map((p) => p.name).sort();
    expect(names).toEqual(
      [
        "changeKind",
        "formId",
        "responseToken",
        "providerEventId",
        "formTitle",
        "submittedAt",
        "landedAt",
        "answers",
        "hidden",
        "score",
      ].sort(),
    );
    const byName = new Map(meta.payloadShape.map((p) => [p.name, p]));
    // Free-form respondent content is sensitive.
    expect(byName.get("answers")?.sensitive).toBe(true);
    expect(byName.get("hidden")?.sensitive).toBe(true);
    // Opaque ids are not.
    expect(byName.get("formId")?.sensitive).toBeUndefined();
    expect(byName.get("responseToken")?.sensitive).toBeUndefined();
    // The admin response_url is deliberately NOT exposed.
    expect(byName.has("responseUrl")).toBe(false);
  });

  it("the formId config field wires to the real typeform:forms resolver", () => {
    const meta = getTriggerMeta(TRIGGER_KEY)!;
    const formField = meta.fields.find((f) => f.name === "formId")!;
    expect(formField.required).toBe(true);
    expect(formField.optionsSource).toBe("typeform:forms");
    expect(getOptionsResolver("typeform:forms")).toBeDefined();
  });
});
