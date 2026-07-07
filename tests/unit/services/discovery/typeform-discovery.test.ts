/**
 * @jest-environment node
 *
 * Discovery-surface tests for Typeform — Slice 5.TYPEFORM-1 + TYPEFORM-2.
 *
 * Asserts the builder/AI-visible catalog is complete + consistent:
 * 2 read-action metas (TYPEFORM-2 — list_responses / get_response behind
 * the new responses:read scope) with 1:1 handler parity, 1 webhook
 * trigger meta, key format, options-source wiring against the real
 * resolver registry, activation/deactivation/filter hook registration,
 * and the sensitive posture of respondent content (answers + hidden) on
 * BOTH the trigger payload and the action outputs.
 */
import {
  getActionMeta,
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
const ACTION_KEYS = ["typeform:list_responses", "typeform:get_response"];

describe("typeform action discovery (TYPEFORM-2)", () => {
  it("registers exactly the 2 read-action metas with 1:1 handler parity", () => {
    const metas = listActionMetasForProvider("typeform");
    expect(metas.map((m) => m.key).sort()).toEqual([...ACTION_KEYS].sort());

    const handlerKeys = listRegisteredHandlers()
      .filter((h) => h.provider === "typeform")
      .map((h) => `${h.provider}:${h.type}`)
      .sort();
    expect(handlerKeys).toEqual([...ACTION_KEYS].sort());
  });

  it("both actions are read-only, low-risk, integration-requiring data actions", () => {
    for (const key of ACTION_KEYS) {
      const meta = getActionMeta(key)!;
      expect(meta).toBeDefined();
      expect(meta.category).toBe("data");
      expect(meta.requiresIntegration).toBe(true);
      expect(meta.isDestructive).toBe(false);
      expect(meta.requiresConfirmation).toBe(false);
      expect(meta.riskLevel).toBe("low");
      expect(meta.producesFileRef).toBe(false);
    }
  });

  it("both formId config fields wire to the real typeform:forms resolver and carry the draft-form hint", () => {
    for (const key of ACTION_KEYS) {
      const meta = getActionMeta(key)!;
      const formField = meta.fields.find((f) => f.name === "formId")!;
      expect(formField.required).toBe(true);
      expect(formField.optionsSource).toBe("typeform:forms");
      expect(formField.description).toContain("Draft or unpublished forms");
    }
    expect(getOptionsResolver("typeform:forms")).toBeDefined();
  });

  it("list_responses outputs mark respondent content sensitive and expose the cursor contract", () => {
    const meta = getActionMeta("typeform:list_responses")!;
    const byName = new Map(meta.outputs.map((o) => [o.name, o]));
    expect([...byName.keys()].sort()).toEqual(
      ["responses", "count", "totalItems", "hasMore", "nextBefore"].sort(),
    );
    const responses = byName.get("responses")!;
    const byInner = new Map((responses.fields ?? []).map((f) => [f.name, f]));
    expect(byInner.get("answers")?.sensitive).toBe(true);
    expect(byInner.get("hidden")?.sensitive).toBe(true);
    // Opaque ids are not sensitive; admin/provider URLs are never exposed.
    expect(byInner.get("responseToken")?.sensitive).toBeUndefined();
    expect(byInner.has("responseUrl")).toBe(false);
    expect(byInner.has("metadata")).toBe(false);
    expect(byName.get("nextBefore")?.nullable).toBe(true);
  });

  it("get_response outputs mark respondent content sensitive and lead with the found flag", () => {
    const meta = getActionMeta("typeform:get_response")!;
    const byName = new Map(meta.outputs.map((o) => [o.name, o]));
    expect([...byName.keys()].sort()).toEqual(
      [
        "found",
        "responseToken",
        "submittedAt",
        "landedAt",
        "answers",
        "hidden",
        "score",
      ].sort(),
    );
    expect(byName.get("found")?.type).toBe("boolean");
    expect(byName.get("answers")?.sensitive).toBe(true);
    expect(byName.get("hidden")?.sensitive).toBe(true);
    expect(byName.has("responseUrl")).toBe(false);
    expect(byName.has("metadata")).toBe(false);
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
