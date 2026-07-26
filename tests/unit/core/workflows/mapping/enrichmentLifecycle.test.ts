/**
 * @jest-environment node
 *
 * Preview-enrichment lifecycle + PROVIDER-NEUTRALITY proof
 * (TYPEFORM-AGENT-PREVIEW-ENRICHMENT-CLOSEOUT-1).
 *
 * Two things are pinned here:
 *   1. the gate that decides when enrichment runs — every "do not enrich" case in the spec maps to
 *      exactly one skip reason, and enriching cannot loop;
 *   2. that the WHOLE generic path (dynamic-output merge → semantic mapping → enrichment →
 *      invalidation) works for a trigger that has nothing to do with Typeform. Typeform is the first
 *      consumer, not a special case, and the second fixture below is what proves it.
 */

import {
  computeEnrichmentIdentity,
  decideEnrichment,
  type DynamicOutputsReadiness,
} from "@/core/workflows/mapping/enrichmentLifecycle";
import { mergeDynamicTriggerOutputs } from "@/core/workflows/mapping/dynamicTriggerOutputs";
import { enrichProposal, findInvalidatedMappings } from "@/core/workflows/mapping/enrichProposal";
import type { MappingCandidate } from "@/core/workflows/mapping/semanticFieldMapping";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

// ───────────────────────── The gate ─────────────────────────

const BASE = {
  status: "ready" as DynamicOutputsReadiness,
  identity: "id-1",
  lastEnrichedIdentity: null as string | null,
  previewClosed: false,
};

describe("enrichment gate (#1-#10)", () => {
  it("(#1) a newly ready schema enriches", () => {
    expect(decideEnrichment(BASE)).toEqual({ enrich: true, identity: "id-1" });
  });

  it.each([
    ["(#2) loading", "loading", "loading"],
    ["(#3) waiting for the resource", "waiting_for_config", "awaiting_resource"],
    ["(#4) a retryable resolver failure", "retryable_error", "resolver_failed"],
    ["(#4) a disconnected integration", "reconnect_required", "resolver_failed"],
    ["(#4) a removed resource", "not_found", "resolver_failed"],
    ["an empty schema", "empty", "empty_schema"],
    ["a trigger with no dynamic source", "not_applicable", "no_dynamic_source"],
  ])("%s does not enrich", (_label, status, skipReason) => {
    const decision = decideEnrichment({ ...BASE, status: status as DynamicOutputsReadiness });
    expect(decision).toEqual({ enrich: false, skipReason });
  });

  it("(#8,#9) the SAME schema never enriches the same proposal twice", () => {
    const decision = decideEnrichment({ ...BASE, lastEnrichedIdentity: "id-1" });
    expect(decision).toEqual({ enrich: false, skipReason: "already_enriched" });
  });

  it("(#5,#6) a retry success or a resource change produces a NEW identity and re-enriches", () => {
    expect(decideEnrichment({ ...BASE, identity: "id-2", lastEnrichedIdentity: "id-1" })).toEqual({
      enrich: true,
      identity: "id-2",
    });
  });

  it("(#10) an applied or dismissed preview never enriches, whatever the resolver says", () => {
    for (const status of ["ready", "loading", "retryable_error"] as DynamicOutputsReadiness[]) {
      expect(decideEnrichment({ ...BASE, status, previewClosed: true })).toEqual({
        enrich: false,
        skipReason: "preview_closed",
      });
    }
  });
});

describe("enrichment identity (#7, #8)", () => {
  const input = {
    proposalId: "p1",
    triggerNodeId: "n1",
    resourceValue: "resource-a",
    outputKeys: ["email", "first_name"],
  };

  it("is stable for the same schema", () => {
    expect(computeEnrichmentIdentity(input)).toBe(computeEnrichmentIdentity(input));
  });

  it("ignores key ORDER — a reordered schema is the same schema", () => {
    expect(computeEnrichmentIdentity({ ...input, outputKeys: ["first_name", "email"] })).toBe(
      computeEnrichmentIdentity(input),
    );
  });

  it("(#7) changes when the selected resource changes, so a late old response cannot match", () => {
    expect(computeEnrichmentIdentity({ ...input, resourceValue: "resource-b" })).not.toBe(
      computeEnrichmentIdentity(input),
    );
  });

  it("changes when the schema's fields change", () => {
    expect(computeEnrichmentIdentity({ ...input, outputKeys: ["email"] })).not.toBe(
      computeEnrichmentIdentity(input),
    );
  });

  it("cannot collide across differently-split keys", () => {
    expect(computeEnrichmentIdentity({ ...input, outputKeys: ["ab"] })).not.toBe(
      computeEnrichmentIdentity({ ...input, outputKeys: ["a", "b"] }),
    );
  });

  it("distinguishes proposals, so a new proposal may enrich the same schema again", () => {
    expect(computeEnrichmentIdentity({ ...input, proposalId: "p2" })).not.toBe(
      computeEnrichmentIdentity(input),
    );
  });
});

// ───────────────── PROVIDER NEUTRALITY: a second, non-Typeform source ─────────────────

/**
 * A spreadsheet-columns trigger. Entirely fictional, deliberately NOT Typeform, and it declares its
 * dynamic outputs the same generic way. If the platform layer had any Typeform-specific branch, this
 * fixture would not map anything.
 */
const SHEETS_TRIGGER = {
  payloadShape: [
    { name: "rowNumber", type: "number" as const },
    { name: "sheetName", type: "string" as const },
    { name: "columns", type: "object" as const },
  ],
  dynamicOutputSource: {
    configField: "sheetId",
    source: "acme_sheets:columns",
    attachUnder: "columns",
  },
};

const SHEET_COLUMNS = [
  { key: "contact_email", label: "Contact email", type: "string" },
  { key: "given_name", label: "Given name", type: "string" },
  { key: "surname", label: "Surname", type: "string" },
  { key: "employer", label: "Employer", type: "string" },
  { key: "notes", label: "Notes", type: "string" },
];

function sheetProposal(): WorkflowDefinition {
  return {
    nodes: [
      { id: "trig", kind: "trigger", provider: "acme_sheets", type: "new_row", config: { sheetId: "sheet-1" } },
      { id: "crm", kind: "action", provider: "some_crm", type: "create_person", config: {} },
    ],
    edges: [{ id: "e1", from: "trig", to: "crm" }],
  } as WorkflowDefinition;
}

const CRM_SPEC = [
  {
    nodeId: "crm",
    fields: [
      { name: "email", label: "Email", type: "text" },
      { name: "firstName", label: "First name", type: "text" },
      { name: "lastName", label: "Last name", type: "text" },
      { name: "company", label: "Company", type: "text" },
      { name: "ownerId", label: "Owner", type: "combobox" },
    ],
  },
];

describe("the generic path works with NO Typeform involved", () => {
  const merged = mergeDynamicTriggerOutputs(SHEETS_TRIGGER, SHEET_COLUMNS);
  const candidates: MappingCandidate[] = (
    merged.outputs.find((o) => o.name === "columns")!.fields ?? []
  ).map((c) => ({ path: `columns.${c.name}`, label: c.description ?? c.name, type: c.type }));

  it("merges dynamic outputs from metadata alone", () => {
    expect(merged.synthesized).toBe(true);
    expect(candidates.map((c) => c.path)).toEqual([
      "columns.contact_email",
      "columns.given_name",
      "columns.surname",
      "columns.employer",
      "columns.notes",
    ]);
  });

  it("semantic mapping works on labels that share no vocabulary with Typeform", () => {
    const result = enrichProposal({
      definition: sheetProposal(),
      sourceId: "trig",
      candidates,
      nodeSpecs: CRM_SPEC,
      agentOwnedFields: { crm: ["email", "firstName", "lastName", "company", "ownerId"] },
    });
    const crm = result.definition.nodes.find((n) => n.id === "crm")!;
    // "Contact email" → email, "Given name" → first name, "Surname" → last name, "Employer" → company.
    expect(crm.config.email).toBe("{{trig.columns.contact_email}}");
    expect(crm.config.firstName).toBe("{{trig.columns.given_name}}");
    expect(crm.config.lastName).toBe("{{trig.columns.surname}}");
    expect(crm.config.company).toBe("{{trig.columns.employer}}");
    // A field with no concept stays a user decision.
    expect(crm.config.ownerId).toBeUndefined();
  });

  it("preserves user overrides identically", () => {
    const def = sheetProposal();
    def.nodes.find((n) => n.id === "crm")!.config = { email: "picked@myco.com" };
    const result = enrichProposal({
      definition: def,
      sourceId: "trig",
      candidates,
      nodeSpecs: CRM_SPEC,
      agentOwnedFields: { crm: ["firstName", "lastName"] },
    });
    const crm = result.definition.nodes.find((n) => n.id === "crm")!;
    expect(crm.config.email).toBe("picked@myco.com");
    expect(crm.config.firstName).toBe("{{trig.columns.given_name}}");
  });

  it("invalidates mappings when the resource's schema loses a column", () => {
    const enriched = enrichProposal({
      definition: sheetProposal(),
      sourceId: "trig",
      candidates,
      nodeSpecs: CRM_SPEC,
      agentOwnedFields: { crm: ["email", "firstName", "lastName", "company"] },
    }).definition;
    const invalid = findInvalidatedMappings({
      definition: enriched,
      sourceId: "trig",
      validPaths: ["columns.contact_email", "columns.given_name", "columns.surname"],
    });
    expect(invalid.map((i) => i.field)).toEqual(["company"]);
  });

  it("runs the same lifecycle from metadata alone", () => {
    const identity = computeEnrichmentIdentity({
      proposalId: "p1",
      triggerNodeId: "trig",
      resourceValue: "sheet-1",
      outputKeys: SHEET_COLUMNS.map((c) => c.key),
    });
    expect(decideEnrichment({ status: "ready", identity, lastEnrichedIdentity: null, previewClosed: false })).toEqual({
      enrich: true,
      identity,
    });
    expect(
      decideEnrichment({ status: "ready", identity, lastEnrichedIdentity: identity, previewClosed: false }),
    ).toEqual({ enrich: false, skipReason: "already_enriched" });
  });
});
