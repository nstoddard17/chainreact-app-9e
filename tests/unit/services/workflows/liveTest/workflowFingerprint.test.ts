/**
 * @jest-environment node
 *
 * WORKFLOW-LIVE-TEST-3 §2 — the canonical workflow fingerprint.
 *
 * The fingerprint is what makes a live-test consent STALE-PROOF: it must change for every saved
 * edit that changes what would execute or which connections it executes under, and must NOT
 * change for anything purely visual — a moved card must never void a consent, and a re-ordered
 * JSON object must never fake a change.
 */
import {
  canonicalFingerprintDocument,
  computeWorkflowFingerprint,
  type WorkflowFingerprintInput,
} from "@/services/workflows/liveTest/workflowFingerprint";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

const BASE_DEF: WorkflowDefinition = {
  nodes: [
    {
      id: "trigger",
      kind: "trigger",
      provider: "gmail",
      type: "new_email",
      position: { x: 400, y: 100 },
      config: { subject: "ChainReact Google Review", subjectExactMatch: false },
    },
    {
      id: "a1",
      kind: "action",
      provider: "google-drive",
      type: "upload_file",
      position: { x: 400, y: 260 },
      config: { filename: "Google Review - {{trigger.subject}}.txt", mimeType: "text/plain", content: "c" },
    },
    {
      id: "a2",
      kind: "action",
      provider: "gmail",
      type: "send_email",
      position: { x: 400, y: 420 },
      config: { to: ["x"], subject: "s", textBody: "b" },
    },
  ],
  edges: [
    { id: "e1", from: "trigger", to: "a1" },
    { id: "e2", from: "a1", to: "a2" },
  ],
} as WorkflowDefinition;

const BASE: WorkflowFingerprintInput = {
  workflowId: "wf-1",
  accountId: "acct-1",
  definition: BASE_DEF,
  connectionIds: ["int-b", "int-a"],
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("workflow fingerprint — stability", () => {
  it("identical executable definitions produce the same hash", () => {
    expect(computeWorkflowFingerprint(BASE)).toBe(computeWorkflowFingerprint(clone(BASE)));
  });

  it("object-key ordering does not change the hash", () => {
    const reordered = clone(BASE);
    // Rebuild a node config with reversed key insertion order.
    const cfg = reordered.definition.nodes[0]!.config as Record<string, unknown>;
    const reversed: Record<string, unknown> = {};
    for (const k of Object.keys(cfg).reverse()) reversed[k] = cfg[k];
    (reordered.definition.nodes[0] as { config: unknown }).config = reversed;
    expect(computeWorkflowFingerprint(reordered)).toBe(computeWorkflowFingerprint(BASE));
  });

  it("node/edge ARRAY order does not change the hash (position in the array is not executable)", () => {
    const shuffled = clone(BASE) as { definition: WorkflowDefinition };
    shuffled.definition = {
      ...shuffled.definition,
      nodes: [...shuffled.definition.nodes].reverse(),
      edges: [...shuffled.definition.edges].reverse(),
    } as WorkflowDefinition;
    expect(computeWorkflowFingerprint(shuffled as WorkflowFingerprintInput)).toBe(computeWorkflowFingerprint(BASE));
  });

  it("connection-id ORDER does not matter (a set, not a list)", () => {
    expect(
      computeWorkflowFingerprint({ ...BASE, connectionIds: ["int-a", "int-b"] }),
    ).toBe(computeWorkflowFingerprint(BASE));
  });

  it("purely visual canvas movement does not change the hash", () => {
    const moved = clone(BASE);
    (moved.definition.nodes[1] as { position: { x: number; y: number } }).position = {
      x: 999,
      y: 999,
    };
    expect(computeWorkflowFingerprint(moved)).toBe(computeWorkflowFingerprint(BASE));
    // …and the canonical document never even contains the coordinates.
    expect(canonicalFingerprintDocument(moved)).not.toContain("999");
  });
});

describe("workflow fingerprint — sensitivity (every consent-relevant edit changes it)", () => {
  const variants: ReadonlyArray<[string, (input: WorkflowFingerprintInput) => void]> = [
    ["node CONFIG edit (a variable re-mapping)", (v) => {
      (v.definition.nodes[1]!.config as Record<string, unknown>).filename = "Other - {{trigger.id}}.txt";
    }],
    ["node TYPE change", (v) => {
      (v.definition.nodes[2] as { type: string }).type = "create_draft";
    }],
    ["node added", (v) => {
      (v.definition.nodes as unknown[]).push({
        id: "a3", kind: "action", provider: "gmail", type: "add_label",
        position: { x: 0, y: 0 }, config: { messageId: "{{trigger.id}}" },
      });
    }],
    ["edge/routing change", (v) => {
      (v.definition.edges[1] as { to: string }).to = "trigger2"; // structural rewire
    }],
    ["edge label change (branch routing)", (v) => {
      (v.definition.edges[1] as { label?: string }).label = "true";
    }],
    ["step display-name change (shown in disclosure — conservatively binding)", (v) => {
      (v.definition.nodes[1] as { displayName?: string }).displayName = "Renamed step";
    }],
    ["connection swapped", (v) => {
      (v as unknown as { connectionIds: string[] }).connectionIds = ["int-b", "int-c"];
    }],
    ["different workflow id", (v) => {
      (v as { workflowId: string }).workflowId = "wf-2";
    }],
    ["different account", (v) => {
      (v as { accountId: string }).accountId = "acct-2";
    }],
  ];

  it.each(variants.map(([name]) => [name]))("%s changes the hash", (name) => {
    const mutate = variants.find(([n]) => n === name)![1];
    const variant = clone(BASE);
    mutate(variant);
    expect(computeWorkflowFingerprint(variant)).not.toBe(computeWorkflowFingerprint(BASE));
  });
});

describe("workflow fingerprint — shape", () => {
  it("is a 64-char lowercase hex SHA-256", () => {
    expect(computeWorkflowFingerprint(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the canonical document is valid JSON with sorted node/edge ids", () => {
    const doc = JSON.parse(canonicalFingerprintDocument(BASE)) as {
      nodes: { id: string }[];
      edges: { id: string }[];
      connectionIds: string[];
    };
    expect(doc.nodes.map((n) => n.id)).toEqual(["a1", "a2", "trigger"]);
    expect(doc.edges.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(doc.connectionIds).toEqual(["int-a", "int-b"]);
  });
});
