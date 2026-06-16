/**
 * @jest-environment node
 *
 * AI-REPAIR-4A — deterministic dangling/broken-edge cleanup preview, integration-style.
 * Drives `runDanglingEdgeRepairPreview` end-to-end against the REAL discovery registry,
 * the REAL edge-repair strategy (`buildEdgeRepairOutcome`), and the REAL
 * validate/apply-safety engine. Only the data layer is mocked (`getById` / `isMember` /
 * `ensurePersonalAccount`).
 *
 * Fixture: a valid trigger → Gmail → Slack chain PLUS one DANGLING edge (Gmail → a node
 * that doesn't exist). The safe deterministic repair is `removeEdge` of ONLY the broken
 * edge — the valid edges and all nodes are preserved.
 */
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowDefinition } from "@/contracts/workflow";

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({ getById: (...a: unknown[]) => mockGetById(...a) }));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({ isMember: (...a: unknown[]) => mockIsMember(...a) }));

jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (userId: string) => Promise.resolve({ id: `acct-${userId}` }),
}));

import { runDanglingEdgeRepairPreview } from "@/services/ai/repair/deterministicRepairPreview";

const USER = "user-1";
const ACCOUNT = `acct-${USER}`;
const WF = "wf-edge";
const TRIGGER = "trigger-1";
const GMAIL = "gmail-1";
const SLACK = "slack-1";
const DANGLING_EDGE = "e-dangling";

function node(id: string, kind: "trigger" | "action", provider: string, type: string, config: Record<string, unknown> = {}, y = 0) {
  return { id, kind, provider, type, config, position: { x: 0, y } };
}

/** `extraEdges` lets a variant add/remove the dangling edge. */
function workflowRecord(extraEdges: { id: string; from: string; to: string }[]): WorkflowRecord {
  const def: WorkflowDefinition = {
    nodes: [
      node(TRIGGER, "trigger", "native", "manual.run", {}, 0),
      node(GMAIL, "action", "gmail", "send_email", { to: ["a@example.com"], subject: "Hi" }, 1),
      node(SLACK, "action", "slack", "send_channel_message", { channel: "C0123456789", text: "Notify" }, 2),
    ],
    edges: [
      { id: "e1", from: TRIGGER, to: GMAIL },
      { id: "e2", from: GMAIL, to: SLACK },
      ...extraEdges,
    ],
  };
  return {
    id: WF,
    accountId: ACCOUNT,
    createdByUserId: USER,
    name: "Dangling edge repair",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: def,
    deletedAt: null,
    folderId: null,
    deletedByUserId: null,
    purgeAfter: null,
    deletedFromFolderId: null,
    deleteOperationId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "rev-edge-1",
  };
}

/** DTO carrying the STALE_EDGE finding the route would re-derive. */
const staleEdgeDto = {
  workflowId: WF,
  access: "OK",
  overallReady: false,
  summaryText: "This workflow has a connection to a step that no longer exists.",
  findings: [
    {
      source: "graph",
      code: "STALE_EDGE",
      severity: "error",
      title: "This workflow has a connection to a step that no longer exists.",
      danglingEdges: [{ fromLabel: "Gmail — Send Email", toLabel: "a step that no longer exists" }],
    },
  ],
} as never;

const base = { userId: USER, workflowId: WF } as const;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsMember.mockResolvedValue(true);
  // Default: one dangling edge from Gmail to a node that doesn't exist.
  mockGetById.mockResolvedValue(workflowRecord([{ id: DANGLING_EDGE, from: GMAIL, to: "ghost-node" }]));
});

describe("runDanglingEdgeRepairPreview (AI-REPAIR-4A)", () => {
  it("a dangling edge → applyable preview that removes ONLY the broken edge", async () => {
    const res = await runDanglingEdgeRepairPreview({ dto: staleEdgeDto, ...base });
    expect(res).not.toBeNull();
    expect(res!.preview.ok).toBe(true);
    expect(res!.preview.apply.applyable).toBe(true);
    if (!res!.preview.apply.applyable) throw new Error("expected applyable");
    // Only the dangling edge is removed — the valid edges (e1/e2) are untouched.
    expect(res!.preview.apply.operations).toEqual([{ op: "removeEdge", edgeId: DANGLING_EDGE }]);
    expect(res!.preview.apply.baseRevision).toBe("rev-edge-1");
    // The RENDERED copy (change descriptions + the user-facing summary) uses safe labels,
    // never the raw edge / node id. (`beforeSummary.dataFlow` carries node ids by design —
    // it's a structural snapshot the UI never renders as copy; `changes[].edgeId` is an
    // internal targeting field, not rendered.)
    const renderedCopy = [
      ...res!.preview.changes.map((c) => c.description),
      res!.preview.userFacingSummaryText,
    ].join(" | ");
    expect(renderedCopy).not.toContain("ghost-node");
    expect(renderedCopy).not.toContain(DANGLING_EDGE);
    const change = res!.preview.changes.find((c) => c.op === "removeEdge");
    expect(change?.description).toContain("Send Email");
    expect(change?.description).toContain("a node that's no longer in this workflow");
  });

  it("removes ALL dangling edges in one preview (so the candidate validates clean)", async () => {
    mockGetById.mockResolvedValue(
      workflowRecord([
        { id: "e-d1", from: GMAIL, to: "ghost-a" },
        { id: "e-d2", from: "ghost-b", to: SLACK },
      ]),
    );
    const res = await runDanglingEdgeRepairPreview({ dto: staleEdgeDto, ...base });
    expect(res).not.toBeNull();
    if (!res!.preview.apply.applyable) throw new Error("expected applyable");
    const ops = res!.preview.apply.operations as { op: string; edgeId: string }[];
    expect(ops.every((o) => o.op === "removeEdge")).toBe(true);
    expect(new Set(ops.map((o) => o.edgeId))).toEqual(new Set(["e-d1", "e-d2"]));
  });

  it("no STALE_EDGE finding → null WITHOUT reading the graph", async () => {
    const cleanDto = { workflowId: WF, access: "OK", findings: [] } as never;
    const res = await runDanglingEdgeRepairPreview({ dto: cleanDto, ...base });
    expect(res).toBeNull();
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("finding present but the graph has no dangling edge → null (nothing to remove)", async () => {
    mockGetById.mockResolvedValue(workflowRecord([])); // no dangling edge in the actual graph
    const res = await runDanglingEdgeRepairPreview({ dto: staleEdgeDto, ...base });
    expect(res).toBeNull();
  });

  it("graph unavailable → null", async () => {
    mockIsMember.mockResolvedValue(false); // collapses to NOT_FOUND
    expect(await runDanglingEdgeRepairPreview({ dto: staleEdgeDto, ...base })).toBeNull();
  });
});
