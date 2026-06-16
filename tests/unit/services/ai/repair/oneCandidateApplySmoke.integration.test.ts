/**
 * @jest-environment node
 *
 * AI-REPAIR-3J — exact one-candidate Apply smoke fixture (integration-style).
 *
 * Unlike `previewWorkflowRepair.test.ts` (which mocks the grounding tools + the
 * preview engine), this proves the WHOLE deterministic one-candidate path
 * end-to-end against the REAL discovery registry, the REAL candidate matching
 * (`buildVariableRepairOutcome` → real `getAvailableVariablesForAI`), and the
 * REAL preview/validate/apply-safety engine (`previewWorkflowPatchForAI`). Only
 * the data layer is mocked — `getById` (workflow load), `isMember` (account
 * membership guard), and `ensurePersonalAccount` (account resolution). Everything
 * that decides whether the Apply button appears runs for real.
 *
 * Fixture (the simplest UI-reproducible shape):
 *   1. Manual trigger          (native:manual.run    — exposes only `inputs`)
 *   2. Gmail "Send Email"      (gmail:send_email      — exposes id/threadId/to/subject/labelIds)
 *   3. Slack "Send Channel Message" — Message (`text`) field holds a DELETED-node ref
 *
 * Broken token:      {{deleted-step.subject}}
 * Sole candidate:    {{gmail-1.subject}}   (Gmail's `subject` output — unique upstream)
 *
 * The Slack Message field key is `text` (not a recipient/secret/credential key),
 * so the deterministic `repairVariableReference` preview is APPLYABLE — that's the
 * exact state in which the Apply button appears. The model/OpenAI/credit-gate/
 * model-telemetry path is NEVER touched (no AI mocks present; a static boundary
 * scan backs that up).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowDefinition } from "@/contracts/workflow";

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...a: unknown[]) => mockGetById(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...a: unknown[]) => mockIsMember(...a),
}));

jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (userId: string) => Promise.resolve({ id: `acct-${userId}` }),
}));

import { runDeterministicRepairPreview } from "@/services/ai/repair/deterministicRepairPreview";
import { getAvailableVariablesForAI } from "@/services/ai/tools/variables";
import { findInvalidVariableReferences } from "@/core/workflows/invalidVariableReferences";

const USER = "user-1";
const ACCOUNT = `acct-${USER}`;
const WF = "wf-smoke";

const TRIGGER = "trigger-1";
const GMAIL = "gmail-1";
const SLACK = "slack-1";

const BROKEN_TOKEN = "{{deleted-step.subject}}";
const EXPECTED_REPLACEMENT = `{{${GMAIL}.subject}}`;

/** A WorkflowNode (structurally complete). */
function node(
  id: string,
  kind: "trigger" | "action",
  provider: string,
  type: string,
  config: Record<string, unknown> = {},
  y = 0,
) {
  return { id, kind, provider, type, config, position: { x: 0, y } };
}

/**
 * Build the saved workflow record. `slackText` is the Slack Message field value;
 * `extraNodes`/`extraEdges` let a variant inject a second `subject`-exposing
 * upstream node (multiple-candidate case).
 */
function workflowRecord(
  slackText: string,
  extra: { nodes?: ReturnType<typeof node>[]; edges?: { id: string; from: string; to: string }[] } = {},
): WorkflowRecord {
  const def: WorkflowDefinition = {
    nodes: [
      node(TRIGGER, "trigger", "native", "manual.run", {}, 0),
      node(GMAIL, "action", "gmail", "send_email", { to: ["alice@example.com"], subject: "Daily digest" }, 1),
      ...(extra.nodes ?? []),
      node(SLACK, "action", "slack", "send_channel_message", { channel: "C0123456789", text: slackText }, 3),
    ],
    edges: [
      { id: "e1", from: TRIGGER, to: GMAIL },
      ...(extra.edges ?? [{ id: "e2", from: GMAIL, to: SLACK }]),
    ],
  };
  return {
    id: WF,
    accountId: ACCOUNT,
    createdByUserId: USER,
    name: "One-candidate repair smoke",
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
    updatedAt: "rev-smoke-1",
  };
}

/** Minimal re-derived diagnosis DTO carrying the one broken-ref finding (target = Slack). */
const brokenRefDto = {
  workflowId: WF,
  access: "OK",
  overallReady: false,
  summaryText: "A step references a deleted or missing step.",
  findings: [
    {
      source: "graph",
      code: "INVALID_VARIABLE_REFERENCE",
      severity: "error",
      title: "A step references a deleted or missing step.",
      nodeIds: [SLACK],
      invalidReferences: [{ fieldLabel: "Message", token: BROKEN_TOKEN }],
    },
  ],
} as never;

const base = { dto: brokenRefDto, userId: USER, workflowId: WF } as const;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsMember.mockResolvedValue(true);
  mockGetById.mockResolvedValue(workflowRecord(BROKEN_TOKEN));
});

describe("AI-REPAIR-3J — exact one-candidate fixture (real registry + real preview)", () => {
  it("the real detector flags exactly one broken reference, on the Slack Message field", () => {
    const def = workflowRecord(BROKEN_TOKEN).draftDefinition;
    const broken = findInvalidVariableReferences(def.nodes);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ nodeId: SLACK, fieldKey: "text", refPath: "subject", token: BROKEN_TOKEN });
  });

  it("real getAvailableVariablesForAI exposes exactly ONE upstream candidate at path `subject` (reason = 'one')", async () => {
    const vars = await getAvailableVariablesForAI(USER, WF, SLACK);
    expect(vars.ok).toBe(true);
    if (!vars.ok) return;
    const candidates = vars.data.variables.filter((v) => v.path === "subject");
    // n === 1 is exactly the diagnostics `reasonFor` → "one" branch.
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ nodeId: GMAIL, reference: EXPECTED_REPLACEMENT });
  });

  it("deterministic Preview returns an APPLYABLE preview with a typed repairVariableReference op", async () => {
    const res = await runDeterministicRepairPreview({ ...base });
    expect(res).not.toBeNull();
    expect(res!.ok).toBe(true);

    const preview = res!.preview;
    // Validation passed → applyable preview (this is the state the Apply button keys on).
    expect(preview.ok).toBe(true);
    expect(preview.apply.applyable).toBe(true);

    // The applyable artifact carries the TYPED op + base revision (forwarded to the apply route, never rendered).
    if (!preview.apply.applyable) throw new Error("expected applyable");
    expect(preview.apply.operations).toEqual([
      { op: "repairVariableReference", nodeId: SLACK, fieldPath: "text", newReference: EXPECTED_REPLACEMENT },
    ]);
    expect(preview.apply.baseRevision).toBe("rev-smoke-1");

    // The user-facing change summary names the field, never the deleted node id or raw op JSON.
    const repairChange = preview.changes.find((c) => c.op === "repairVariableReference");
    expect(repairChange).toBeDefined();
    expect(JSON.stringify(preview)).not.toContain("deleted-step");
  });

  it("ZERO candidates (unknown path) → null, no Apply", async () => {
    mockGetById.mockResolvedValue(workflowRecord("{{deleted-step.no_such_output}}"));
    const res = await runDeterministicRepairPreview({ ...base });
    expect(res).toBeNull();
  });

  it("MULTIPLE candidates (two upstream `subject` producers) → null, no Apply", async () => {
    const GMAIL2 = "gmail-2";
    mockGetById.mockResolvedValue(
      workflowRecord(BROKEN_TOKEN, {
        nodes: [node(GMAIL2, "action", "gmail", "send_email", { to: ["bob@example.com"], subject: "Second" }, 2)],
        edges: [
          { id: "e2", from: GMAIL, to: GMAIL2 },
          { id: "e3", from: GMAIL2, to: SLACK },
        ],
      }),
    );
    const res = await runDeterministicRepairPreview({ ...base });
    expect(res).toBeNull();
  });

  it("no invalid-reference finding → null WITHOUT loading the graph (zero overhead)", async () => {
    const missingFieldDto = {
      workflowId: WF,
      access: "OK",
      overallReady: false,
      findings: [{ source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "x", nodeIds: [SLACK] }],
    } as never;
    const res = await runDeterministicRepairPreview({ dto: missingFieldDto, userId: USER, workflowId: WF });
    expect(res).toBeNull();
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("boundary: the deterministic preview + strategy modules import NO model / OpenAI / credit-gate / model-telemetry path", () => {
    // Scan CODE only — strip block + line comments so the doc prose (which describes
    // what the module deliberately does NOT do: "no OpenAI", "no credit gate", "no
    // ai_model_call_* telemetry") can't false-positive.
    const stripComments = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    for (const rel of [
      "services/ai/repair/deterministicRepairPreview.ts",
      "services/ai/repair/repairStrategies.ts",
    ]) {
      const code = stripComments(readFileSync(resolve(process.cwd(), rel), "utf8"));
      expect(code).not.toMatch(/from\s+["'][^"']*openai/i);
      expect(code).not.toMatch(/aiCreditGate|aiCostEvents|recordAiModelCall/);
      expect(code).not.toMatch(/createModelClient|generateStructuredJson|getOpenAIClient/);
    }
  });
});
