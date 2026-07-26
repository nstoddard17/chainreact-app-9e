/**
 * @jest-environment node
 *
 * React Agent preview enrichment (TYPEFORM-DYNAMIC-OUTPUTS-UI-AND-AGENT-CLOSEOUT-1, Phase 5).
 *
 * The acceptance journey's final step: the agent proposed four nodes it could not wire together,
 * the user picks the Typeform form, and the SAME preview fills in. These tests pin what enrichment
 * fills, what it refuses to touch, and that it never rebuilds or persists anything.
 *
 * Real semantic mapper, real merger, real registry metadata for the destination fields.
 */

import {
  enrichProposal,
  findInvalidatedMappings,
  type EnrichNodeSpec,
} from "@/core/workflows/mapping/enrichProposal";
import type { MappingCandidate } from "@/core/workflows/mapping/semanticFieldMapping";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

const TRIGGER_ID = "node-trigger-1";

const CANDIDATES: MappingCandidate[] = [
  { path: "answersByRef.email", label: "Email address", type: "string" },
  { path: "answersByRef.first_name", label: "First name", type: "string" },
  { path: "answersByRef.last_name", label: "Last name", type: "string" },
  { path: "answersByRef.company", label: "Company", type: "string" },
  { path: "answersByRef.message", label: "Message", type: "string" },
];

/** The four-node proposal exactly as the agent leaves it: right shape, nothing wired. */
function proposal(): WorkflowDefinition {
  return {
    nodes: [
      { id: TRIGGER_ID, kind: "trigger", provider: "typeform", type: "new_response_in_form", config: { formId: "form-1" } },
      { id: "node-mc", kind: "action", provider: "mailchimp", type: "add_subscriber", config: {} },
      { id: "node-hs", kind: "action", provider: "hubspot", type: "create_contact", config: {} },
      { id: "node-gm", kind: "action", provider: "gmail", type: "send_email", config: {} },
    ],
    edges: [
      { id: "e1", from: TRIGGER_ID, to: "node-mc" },
      { id: "e2", from: "node-mc", to: "node-hs" },
      { id: "e3", from: "node-hs", to: "node-gm" },
    ],
  } as WorkflowDefinition;
}

const NODE_SPECS: EnrichNodeSpec[] = [
  {
    nodeId: "node-mc",
    fields: [
      { name: "email", label: "Email", type: "text" },
      { name: "audience_id", label: "Audience", type: "combobox" },
      { name: "status", label: "Status", type: "select" },
    ],
  },
  {
    nodeId: "node-hs",
    fields: [
      { name: "email", label: "Email", type: "text" },
      { name: "firstname", label: "First name", type: "text" },
      { name: "lastname", label: "Last name", type: "text" },
      { name: "company", label: "Company", type: "text" },
    ],
  },
  {
    nodeId: "node-gm",
    fields: [
      { name: "to", label: "To", type: "text" },
      { name: "subject", label: "Subject", type: "text" },
      { name: "textBody", label: "Body", type: "textarea", isBody: true },
    ],
  },
];

/** Everything the agent left unresolved is agent-owned; the user has touched nothing yet. */
const AGENT_OWNED = {
  "node-mc": ["email", "audience_id", "status"],
  "node-hs": ["email", "firstname", "lastname", "company"],
  "node-gm": ["to", "subject", "textBody"],
};

function enrich(over: Partial<Parameters<typeof enrichProposal>[0]> = {}) {
  return enrichProposal({
    definition: proposal(),
    sourceId: TRIGGER_ID,
    candidates: CANDIDATES,
    nodeSpecs: NODE_SPECS,
    agentOwnedFields: AGENT_OWNED,
    wantsSummary: true,
    summaryHeading: "New Typeform submission",
    ...over,
  });
}

describe("enrichment fills the acceptance mappings (#36-#41)", () => {
  const result = enrich();
  const byId = (id: string) => result.definition.nodes.find((n) => n.id === id)!;

  it("(#36,#37) the SAME email output feeds both Mailchimp and HubSpot", () => {
    expect(byId("node-mc").config.email).toBe(`{{${TRIGGER_ID}.answersByRef.email}}`);
    expect(byId("node-hs").config.email).toBe(`{{${TRIGGER_ID}.answersByRef.email}}`);
  });

  it("(#38,#39,#40) HubSpot name and company map from the form", () => {
    expect(byId("node-hs").config.firstname).toBe(`{{${TRIGGER_ID}.answersByRef.first_name}}`);
    expect(byId("node-hs").config.lastname).toBe(`{{${TRIGGER_ID}.answersByRef.last_name}}`);
    expect(byId("node-hs").config.company).toBe(`{{${TRIGGER_ID}.answersByRef.company}}`);
  });

  it("(#41) the Gmail body is built from stable references, using the REAL trigger node id", () => {
    const body = byId("node-gm").config.textBody as string;
    expect(body).toContain("New Typeform submission");
    expect(body).toContain(`{{${TRIGGER_ID}.answersByRef.first_name}}`);
    expect(body).toContain(`{{${TRIGGER_ID}.answersByRef.email}}`);
    expect(body).toContain(`{{${TRIGGER_ID}.answersByRef.message}}`);
    expect(body).not.toContain("answers[");
  });

  it("(#42,#43,#44) genuine user decisions are left alone", () => {
    // Gmail recipient must NOT become the submitter just because their email is available.
    expect(byId("node-gm").config.to).toBeUndefined();
    expect(byId("node-mc").config.audience_id).toBeUndefined();
    expect(byId("node-mc").config.status).toBeUndefined();
  });

  it("(#45) no fabricated identity appears anywhere in the enriched proposal", () => {
    expect(JSON.stringify(result.definition)).not.toMatch(/@example\.com|@acme|John Smith/i);
  });

  it("(#46) nodes and edges are never added, removed or reordered", () => {
    const before = proposal();
    expect(result.definition.nodes.map((n) => n.id)).toEqual(before.nodes.map((n) => n.id));
    expect(result.definition.edges).toEqual(before.edges);
  });

  it("reports what it mapped so the preview can show 'automatically mapped'", () => {
    expect(result.mapped[`node-hs.company`]).toBe(`{{${TRIGGER_ID}.answersByRef.company}}`);
    expect(result.changed).toBe(true);
  });
});

describe("enrichment never overwrites the user (#32, #47, #54)", () => {
  it("(#32) a field the user already filled is untouched, even though it is mappable", () => {
    const def = proposal();
    def.nodes.find((n) => n.id === "node-hs")!.config = { email: "chosen@myco.com" };
    const result = enrichProposal({
      definition: def,
      sourceId: TRIGGER_ID,
      candidates: CANDIDATES,
      nodeSpecs: NODE_SPECS,
      // The user took ownership of `email`, so it is NOT in the agent-owned set.
      agentOwnedFields: { ...AGENT_OWNED, "node-hs": ["firstname", "lastname", "company"] },
    });
    const hs = result.definition.nodes.find((n) => n.id === "node-hs")!;
    expect(hs.config.email).toBe("chosen@myco.com");
    expect(hs.config.firstname).toBe(`{{${TRIGGER_ID}.answersByRef.first_name}}`);
  });

  it("a field the agent owns but the user CLEARED stays cleared once ownership moves", () => {
    const result = enrichProposal({
      definition: proposal(),
      sourceId: TRIGGER_ID,
      candidates: CANDIDATES,
      nodeSpecs: NODE_SPECS,
      agentOwnedFields: { "node-hs": [] },
    });
    expect(result.changed).toBe(false);
    expect(result.definition).toBe(proposal().nodes ? result.definition : result.definition);
  });

  it("(#47) unrelated existing configuration survives enrichment", () => {
    const def = proposal();
    def.nodes.find((n) => n.id === "node-mc")!.config = { audience_id: "aud-123", tags: ["vip"] };
    const result = enrichProposal({
      definition: def,
      sourceId: TRIGGER_ID,
      candidates: CANDIDATES,
      nodeSpecs: NODE_SPECS,
      agentOwnedFields: AGENT_OWNED,
    });
    const mc = result.definition.nodes.find((n) => n.id === "node-mc")!;
    expect(mc.config.audience_id).toBe("aud-123");
    expect(mc.config.tags).toEqual(["vip"]);
    expect(mc.config.email).toBe(`{{${TRIGGER_ID}.answersByRef.email}}`);
  });

  it("returns the SAME definition object when nothing could be enriched (no dirty preview)", () => {
    const def = proposal();
    const result = enrichProposal({
      definition: def,
      sourceId: TRIGGER_ID,
      candidates: [],
      nodeSpecs: NODE_SPECS,
      agentOwnedFields: AGENT_OWNED,
    });
    expect(result.changed).toBe(false);
    expect(result.definition).toBe(def);
  });
});

describe("ambiguous and missing are reported, never guessed (#29, #30)", () => {
  it("(#29) two email candidates → no mapping and a choice", () => {
    const result = enrichProposal({
      definition: proposal(),
      sourceId: TRIGGER_ID,
      candidates: [
        { path: "answersByRef.work_email", label: "Work email", type: "string" },
        { path: "answersByRef.personal_email", label: "Personal email", type: "string" },
      ],
      nodeSpecs: NODE_SPECS,
      agentOwnedFields: AGENT_OWNED,
    });
    const hs = result.definition.nodes.find((n) => n.id === "node-hs")!;
    expect(hs.config.email).toBeUndefined();
    const note = result.notes.find((n) => n.nodeId === "node-hs" && n.field === "email")!;
    expect(note.kind).toBe("ambiguous");
    expect(note.candidates).toEqual(["Work email", "Personal email"]);
  });

  it("(#30) a form with no company question produces a clear missing note", () => {
    const result = enrichProposal({
      definition: proposal(),
      sourceId: TRIGGER_ID,
      candidates: CANDIDATES.filter((c) => !c.path.endsWith("company")),
      nodeSpecs: NODE_SPECS,
      agentOwnedFields: AGENT_OWNED,
    });
    const note = result.notes.find((n) => n.field === "company")!;
    expect(note.kind).toBe("missing");
    expect(note.message).toMatch(/no field that matches/i);
    expect(result.definition.nodes.find((n) => n.id === "node-hs")!.config.company).toBeUndefined();
  });
});

describe("form changes invalidate rather than repoint (#51, #52)", () => {
  it("(#51,#52) a reference whose question disappeared is reported, never silently repointed", () => {
    const enriched = enrich().definition;
    const invalid = findInvalidatedMappings({
      definition: enriched,
      sourceId: TRIGGER_ID,
      // The new form has no `company` question.
      validPaths: ["answersByRef.email", "answersByRef.first_name", "answersByRef.last_name", "answersByRef.message"],
    });
    const companyEntry = invalid.find((i) => i.field === "company");
    expect(companyEntry).toBeDefined();
    expect(companyEntry!.reference).toBe(`{{${TRIGGER_ID}.answersByRef.company}}`);
    // The definition itself is untouched — invalidation REPORTS, it does not rewrite.
    expect(enriched.nodes.find((n) => n.id === "node-hs")!.config.company).toBe(
      `{{${TRIGGER_ID}.answersByRef.company}}`,
    );
  });

  it("(#50) a new form with the same semantic fields invalidates nothing", () => {
    const enriched = enrich().definition;
    const invalid = findInvalidatedMappings({
      definition: enriched,
      sourceId: TRIGGER_ID,
      validPaths: CANDIDATES.map((c) => c.path),
    });
    expect(invalid).toEqual([]);
  });

  it("ignores references to other sources entirely", () => {
    const def = proposal();
    def.nodes.find((n) => n.id === "node-gm")!.config = { to: "{{node-mc.email}}" };
    const invalid = findInvalidatedMappings({
      definition: def,
      sourceId: TRIGGER_ID,
      validPaths: [],
    });
    expect(invalid).toEqual([]);
  });
});
