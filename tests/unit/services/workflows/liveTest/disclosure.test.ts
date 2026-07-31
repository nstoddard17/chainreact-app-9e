/**
 * @jest-environment node
 *
 * WORKFLOW-LIVE-TEST-3 §4 — the side-effect disclosure generator.
 *
 * The disclosure is what the user consents TO, so its honesty properties are pinned hard:
 * derived from real metadata (the Google Review Test resolves to its six effects because its
 * nodes say so), fail-closed on unknowns, destructive escalation, internal steps never
 * mislabeled as external, `native:http_request` never hidden as internal, and no secrets.
 */
import {
  generateLiveTestDisclosure,
  LIVE_TEST_DISCLOSURE_STATEMENTS,
} from "@/services/workflows/liveTest/disclosure";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

/** The Google Review Test graph (the seeded template's nodes, configs abbreviated). */
const GOOGLE_REVIEW_DEF: WorkflowDefinition = {
  nodes: [
    { id: "trigger", kind: "trigger", provider: "gmail", type: "new_email", displayName: "1. Gmail — Read a new email", position: { x: 0, y: 0 }, config: {} },
    { id: "a1", kind: "action", provider: "google-drive", type: "upload_file", displayName: "2. Google Drive — Save the email information", position: { x: 0, y: 1 }, config: {} },
    { id: "a2", kind: "action", provider: "google-sheets", type: "append_row", displayName: "3. Google Sheets — Log the workflow activity", position: { x: 0, y: 2 }, config: {} },
    { id: "a3", kind: "action", provider: "google-calendar", type: "create_event", displayName: "4. Google Calendar — Create a follow-up event", position: { x: 0, y: 3 }, config: {} },
    { id: "a4", kind: "action", provider: "gmail", type: "add_label", displayName: "5. Gmail — Apply a review label", position: { x: 0, y: 4 }, config: {} },
    { id: "a5", kind: "action", provider: "gmail", type: "create_draft_reply", displayName: "6. Gmail — Prepare a reply draft", position: { x: 0, y: 5 }, config: {} },
    { id: "a6", kind: "action", provider: "gmail", type: "send_email", displayName: "7. Gmail — Send a confirmation", position: { x: 0, y: 6 }, config: {} },
  ],
  edges: [],
} as unknown as WorkflowDefinition;

describe("disclosure — Google Review Test resolves to its real effects", () => {
  const disclosure = generateLiveTestDisclosure(GOOGLE_REVIEW_DEF);

  it("produces one entry per node, with the expected kinds in order", () => {
    expect(
      disclosure.effects.map((e) => [e.provider, e.operation, e.kind]),
    ).toEqual([
      ["gmail", "New Email", "reads"],
      ["google-drive", "Upload File", "creates"],
      ["google-sheets", "Append Row", "creates"],
      ["google-calendar", "Create Event", "creates"],
      // add_label buckets as "creates" (the deterministic verb table matches add_ first);
      // the operation name carries the precise meaning either way.
      ["gmail", "Add Label", "creates"],
      ["gmail", "Create Draft Reply", "creates"],
      ["gmail", "Send Email", "sends"],
    ]);
  });

  it("marks the send irreversible (delivery cannot be recalled) and nothing destructive", () => {
    const send = disclosure.effects.find((e) => e.operation === "Send Email")!;
    expect(send.mayBeIrreversible).toBe(true);
    expect(disclosure.effects.every((e) => e.destructive === false)).toBe(true);
  });

  it("carries the reviewer-facing step names and friendly provider labels", () => {
    expect(disclosure.effects[1]!.stepName).toBe("2. Google Drive — Save the email information");
    expect(disclosure.effects[1]!.providerLabel).toBe("Google Drive");
  });

  it("includes the four fixed consent statements (usage, inactive, irreversibility)", () => {
    expect(disclosure.statements).toEqual(LIVE_TEST_DISCLOSURE_STATEMENTS);
    expect(disclosure.statements.join(" ")).toMatch(/tasks and AI credits/i);
    expect(disclosure.statements.join(" ")).toMatch(/stays inactive/i);
    expect(disclosure.statements.join(" ")).toMatch(/not be reversible/i);
  });

  it("contains no secret-shaped material anywhere", () => {
    const blob = JSON.stringify(disclosure);
    expect(blob).not.toMatch(/xox[baprs]-|\bsk_[a-z0-9]{8,}|whsec_|access_token|refresh_token/i);
    expect(blob).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it("is deterministic — same definition, same digest", () => {
    expect(generateLiveTestDisclosure(GOOGLE_REVIEW_DEF).disclosureDigest).toBe(
      disclosure.disclosureDigest,
    );
    expect(disclosure.disclosureDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a definition edit that changes an effect changes the digest", () => {
    const edited = JSON.parse(JSON.stringify(GOOGLE_REVIEW_DEF)) as WorkflowDefinition;
    (edited.nodes[6] as { type: string }).type = "create_draft";
    expect(generateLiveTestDisclosure(edited).disclosureDigest).not.toBe(
      disclosure.disclosureDigest,
    );
  });
});

describe("disclosure — classification edges", () => {
  const def = (nodes: unknown[]): WorkflowDefinition =>
    ({ nodes, edges: [] }) as unknown as WorkflowDefinition;

  it("internal logic nodes are internal steps, never external effects", () => {
    const d = generateLiveTestDisclosure(
      def([
        { id: "t", kind: "trigger", provider: "native", type: "manual.run", position: { x: 0, y: 0 }, config: {} },
        { id: "l1", kind: "action", provider: "native", type: "if_then_condition", position: { x: 0, y: 1 }, config: {} },
      ]),
    );
    expect(d.effects).toEqual([]);
    expect(d.internalSteps.map((s) => s.nodeId)).toEqual(["t", "l1"]);
  });

  it("native:http_request is NEVER hidden as internal — it is external egress", () => {
    const d = generateLiveTestDisclosure(
      def([
        { id: "t", kind: "trigger", provider: "native", type: "manual.run", position: { x: 0, y: 0 }, config: {} },
        { id: "h1", kind: "action", provider: "native", type: "http_request", position: { x: 0, y: 1 }, config: {} },
      ]),
    );
    expect(d.internalSteps.map((s) => s.nodeId)).toEqual(["t"]);
    const http = d.effects.find((e) => e.nodeId === "h1")!;
    expect(http).toBeDefined();
    expect(http.destructive).toBe(true); // riskLevel high escalates
    expect(http.requiresAttention).toBe(true);
  });

  it("an UNKNOWN external action fails closed as an unrecognized real operation", () => {
    const d = generateLiveTestDisclosure(
      def([
        { id: "t", kind: "trigger", provider: "gmail", type: "new_email", position: { x: 0, y: 0 }, config: {} },
        { id: "x", kind: "action", provider: "acme", type: "do_mystery_thing", position: { x: 0, y: 1 }, config: {} },
      ]),
    );
    const unknown = d.effects.find((e) => e.nodeId === "x")!;
    expect(unknown.operation).toContain("Unrecognized");
    expect(unknown.kind).toBe("changes");
    expect(unknown.mayBeIrreversible).toBe(true);
    expect(unknown.requiresAttention).toBe(true);
  });

  it("a destructive action escalates to deletes + attention", () => {
    const d = generateLiveTestDisclosure(
      def([
        { id: "t", kind: "trigger", provider: "gmail", type: "new_email", position: { x: 0, y: 0 }, config: {} },
        { id: "del", kind: "action", provider: "gmail", type: "delete_email", position: { x: 0, y: 1 }, config: {} },
      ]),
    );
    const del = d.effects.find((e) => e.nodeId === "del")!;
    expect(del.destructive).toBe(true);
    expect(del.kind).toBe("deletes");
    expect(del.mayBeIrreversible).toBe(true);
    expect(del.requiresAttention).toBe(true);
  });
});
