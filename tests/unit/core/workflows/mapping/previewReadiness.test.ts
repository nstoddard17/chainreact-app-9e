/**
 * @jest-environment node
 *
 * Preview readiness rows (REACT-AGENT-PREVIEW-PROVENANCE-CLOSEOUT-1).
 *
 * The six outcomes are NOT interchangeable, and that is the whole point of this layer: "I filled
 * this in", "you must choose", "two fields fit and I won't guess", "this resource has no such
 * field", "pick the resource first", and "what you had mapped is gone" each demand a different
 * response from the person reading the preview. These tests pin the distinctions — and pin that no
 * message ever carries a raw provider error or a config value.
 */

import {
  buildPreviewReadiness,
  type PreviewReadinessRow,
} from "@/core/workflows/mapping/previewReadiness";

const MC = {
  nodeId: "mc",
  nodeLabel: "mailchimp:add_subscriber",
  fieldLabels: { email: "Email", audienceId: "Audience", status: "Subscription status" },
  missingInputs: ["audienceId"],
};
const HS = {
  nodeId: "hs",
  nodeLabel: "hubspot:create_contact",
  fieldLabels: { email: "Email", firstName: "First name", company: "Company" },
  missingInputs: [],
};

const EMPTY = { mapped: {}, notes: [], invalidated: [], awaitingResource: false };

function rowFor(
  rows: readonly PreviewReadinessRow[],
  nodeId: string,
  field: string,
): PreviewReadinessRow | undefined {
  return rows.find((r) => r.nodeId === nodeId && r.field === field);
}

describe("automatically mapped (#23)", () => {
  it("names the upstream field it mapped from", () => {
    const rows = buildPreviewReadiness({
      ...EMPTY,
      nodes: [HS],
      mapped: { "hs.email": "{{trig.answers.email}}" },
      mappedLabels: { "hs.email": "Work email" },
    });
    expect(rowFor(rows, "hs", "email")).toMatchObject({
      kind: "mapped",
      fieldLabel: "Email",
      message: "Mapped from upstream: Work email",
    });
  });

  it("degrades honestly when no single upstream field can be named (a composed body)", () => {
    const rows = buildPreviewReadiness({
      ...EMPTY,
      nodes: [HS],
      mapped: { "hs.email": "{{trig.answers.email}}" },
    });
    expect(rowFor(rows, "hs", "email")?.message).toBe("Mapped from upstream");
  });
});

describe("genuine user decisions (#24, #29, #30)", () => {
  it("(#30) an unmapped required field is a user decision, not a mapping failure", () => {
    const rows = buildPreviewReadiness({ ...EMPTY, nodes: [MC] });
    expect(rowFor(rows, "mc", "audienceId")).toMatchObject({
      kind: "needs_user",
      message: "Select audience",
    });
  });

  it("(#29) a field enrichment DID map is no longer listed as a user decision", () => {
    const rows = buildPreviewReadiness({
      ...EMPTY,
      nodes: [{ ...MC, missingInputs: ["audienceId", "email"] }],
      mapped: { "mc.email": "{{trig.answers.email}}" },
      mappedLabels: { "mc.email": "Email address" },
    });
    expect(rowFor(rows, "mc", "email")?.kind).toBe("mapped");
    expect(rowFor(rows, "mc", "audienceId")?.kind).toBe("needs_user");
  });
});

describe("ambiguous (#25)", () => {
  it("renders the candidates instead of picking one", () => {
    const rows = buildPreviewReadiness({
      ...EMPTY,
      nodes: [HS],
      notes: [
        { nodeId: "hs", field: "email", kind: "ambiguous", candidates: ["Work email", "Personal email"] },
      ],
    });
    const row = rowFor(rows, "hs", "email");
    expect(row?.kind).toBe("ambiguous");
    expect(row?.message).toContain("Choose one:");
    expect(row?.candidates).toEqual([
      "Work email",
      "Personal email",
    ]);
  });
});

describe("missing (#26)", () => {
  it("says the resource has no such field, and invents no substitute", () => {
    const rows = buildPreviewReadiness({
      ...EMPTY,
      nodes: [HS],
      notes: [{ nodeId: "hs", field: "company", kind: "missing" }],
    });
    const row = rowFor(rows, "hs", "company");
    expect(row?.kind).toBe("missing");
    expect(row?.message).toBe("The selected resource does not contain a company field.");
  });
});

describe("waiting for schema", () => {
  it("distinguishes 'pick the source first' from 'this is your decision'", () => {
    const rows = buildPreviewReadiness({
      ...EMPTY,
      nodes: [{ ...HS, missingInputs: ["firstName"] }],
      awaitingResource: true,
    });
    expect(rowFor(rows, "hs", "firstName")).toMatchObject({
      kind: "waiting",
      message: "Select the upstream resource first so this field can be mapped.",
    });
  });
});

describe("invalid after a resource change (#27)", () => {
  it("outranks every other state for that field — it is the only 'used to be right' case", () => {
    const rows = buildPreviewReadiness({
      ...EMPTY,
      nodes: [HS],
      // Simultaneously mapped AND invalidated: the stale mapping must win.
      mapped: { "hs.company": "{{trig.answers.company}}" },
      mappedLabels: { "hs.company": "Company" },
      invalidated: [{ nodeId: "hs", field: "company" }],
    });
    const row = rowFor(rows, "hs", "company");
    expect(row?.kind).toBe("invalid");
    expect(row?.message).toContain("no longer contains the previously mapped field");
  });
});

describe("ordering and safety", () => {
  it("puts what blocks the user first and what is handled last", () => {
    const rows = buildPreviewReadiness({
      nodes: [{ ...HS, missingInputs: ["firstName"] }],
      mapped: { "hs.email": "{{trig.answers.email}}" },
      mappedLabels: {},
      notes: [{ nodeId: "hs", field: "lastName", kind: "missing" }],
      invalidated: [{ nodeId: "hs", field: "company" }],
      awaitingResource: false,
    });
    expect(rows.map((r) => r.kind)).toEqual(["invalid", "missing", "needs_user", "mapped"]);
  });

  it("never emits a raw value or a provider error", () => {
    const rows = buildPreviewReadiness({
      ...EMPTY,
      nodes: [HS],
      mapped: { "hs.email": "{{trig.answers.email}}" },
      notes: [{ nodeId: "hs", field: "company", kind: "missing" }],
    });
    for (const row of rows) {
      expect(row.message).not.toContain("{{");
      expect(row.message).not.toMatch(/\b(4\d\d|5\d\d)\b/);
    }
  });

  it("a node with nothing to report produces no rows", () => {
    expect(buildPreviewReadiness({ ...EMPTY, nodes: [HS] })).toEqual([]);
  });
});
