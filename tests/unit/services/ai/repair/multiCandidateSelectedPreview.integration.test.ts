/**
 * @jest-environment node
 *
 * AI-REPAIR-3L — explicit user-SELECTED replacement preview (multiple-candidate case),
 * integration-style. Drives `runSelectedVariableRepairPreview` end-to-end against the
 * REAL discovery registry, REAL candidate matching (`getAvailableVariablesForAI`), and
 * the REAL preview/validate/apply-safety engine. Only the data layer is mocked
 * (`getById` / `isMember` / `ensurePersonalAccount`).
 *
 * Fixture (two upstream `subject` producers → genuinely ambiguous):
 *   1. Manual trigger     (native:manual.run)
 *   2. Gmail "Send Email" #1 (gmail:send_email — exposes `subject`)
 *   3. Gmail "Send Email" #2 (gmail:send_email — exposes `subject`)
 *   4. Slack "Send Channel Message" — Message (`text`) holds {{deleted-step.subject}}
 *
 * Two safe candidates: {{gmail-1.subject}} and {{gmail-2.subject}}. The user must pick
 * one — the app never auto-picks. The service re-validates the chosen reference against
 * the server-computed candidate set (anti-injection) before previewing.
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

import {
  parseSelectedRepairSelection,
  runSelectedVariableRepairPreview,
} from "@/services/ai/repair/deterministicRepairPreview";

const USER = "user-1";
const ACCOUNT = `acct-${USER}`;
const WF = "wf-multi";
const SLACK = "slack-1";
const GMAIL1 = "gmail-1";
const GMAIL2 = "gmail-2";

const REF1 = `{{${GMAIL1}.subject}}`;
const REF2 = `{{${GMAIL2}.subject}}`;

function node(id: string, kind: "trigger" | "action", provider: string, type: string, config: Record<string, unknown> = {}, y = 0) {
  return { id, kind, provider, type, config, position: { x: 0, y } };
}

function workflowRecord(slackText: string): WorkflowRecord {
  const def: WorkflowDefinition = {
    nodes: [
      node("trigger-1", "trigger", "native", "manual.run", {}, 0),
      node(GMAIL1, "action", "gmail", "send_email", { to: ["a@example.com"], subject: "First" }, 1),
      node(GMAIL2, "action", "gmail", "send_email", { to: ["b@example.com"], subject: "Second" }, 2),
      node(SLACK, "action", "slack", "send_channel_message", { channel: "C0123456789", text: slackText }, 3),
    ],
    edges: [
      { id: "e1", from: "trigger-1", to: GMAIL1 },
      { id: "e2", from: GMAIL1, to: GMAIL2 },
      { id: "e3", from: GMAIL2, to: SLACK },
    ],
  };
  return {
    id: WF,
    accountId: ACCOUNT,
    createdByUserId: USER,
    name: "Multi-candidate repair",
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
    updatedAt: "rev-multi-1",
  };
}

const BROKEN = "{{deleted-step.subject}}";

beforeEach(() => {
  jest.clearAllMocks();
  mockIsMember.mockResolvedValue(true);
  mockGetById.mockResolvedValue(workflowRecord(BROKEN));
});

describe("runSelectedVariableRepairPreview (AI-REPAIR-3L)", () => {
  it("a VALID user-selected candidate → applyable preview with THAT exact newReference", async () => {
    const res = await runSelectedVariableRepairPreview({
      userId: USER,
      workflowId: WF,
      selection: { nodeId: SLACK, fieldKey: "text", newReference: REF2 },
    });
    expect(res).not.toBeNull();
    expect(res!.preview.ok).toBe(true);
    expect(res!.preview.apply.applyable).toBe(true);
    if (!res!.preview.apply.applyable) throw new Error("expected applyable");
    expect(res!.preview.apply.operations).toEqual([
      { op: "repairVariableReference", nodeId: SLACK, fieldPath: "text", newReference: REF2 },
    ]);
    // The OTHER candidate was equally choosable (the app didn't auto-pick).
    const resOther = await runSelectedVariableRepairPreview({
      userId: USER, workflowId: WF, selection: { nodeId: SLACK, fieldKey: "text", newReference: REF1 },
    });
    const applyOther = resOther!.preview.apply;
    expect(applyOther.applyable).toBe(true);
    if (!applyOther.applyable) throw new Error("expected applyable");
    expect(applyOther.operations).toEqual([
      { op: "repairVariableReference", nodeId: SLACK, fieldPath: "text", newReference: REF1 },
    ]);
  });

  it("ANTI-INJECTION: a reference that is NOT a server-computed candidate → null", async () => {
    // Wrong path (`to`, not the broken ref's `subject`) — a real upstream var, but not a candidate here.
    expect(
      await runSelectedVariableRepairPreview({
        userId: USER, workflowId: WF, selection: { nodeId: SLACK, fieldKey: "text", newReference: `{{${GMAIL1}.to}}` },
      }),
    ).toBeNull();
    // Fabricated node id — not an available upstream variable at all.
    expect(
      await runSelectedVariableRepairPreview({
        userId: USER, workflowId: WF, selection: { nodeId: SLACK, fieldKey: "text", newReference: "{{ghost-node.subject}}" },
      }),
    ).toBeNull();
  });

  it("a selection whose field has no broken reference → null (nothing to repair)", async () => {
    expect(
      await runSelectedVariableRepairPreview({
        userId: USER, workflowId: WF, selection: { nodeId: SLACK, fieldKey: "channel", newReference: REF2 },
      }),
    ).toBeNull();
  });

  it("graph unavailable → null", async () => {
    mockIsMember.mockResolvedValue(false); // collapses to NOT_FOUND
    expect(
      await runSelectedVariableRepairPreview({
        userId: USER, workflowId: WF, selection: { nodeId: SLACK, fieldKey: "text", newReference: REF2 },
      }),
    ).toBeNull();
  });
});

describe("parseSelectedRepairSelection (AI-REPAIR-3L)", () => {
  it("undefined when the key is absent (no explicit selection)", () => {
    expect(parseSelectedRepairSelection({})).toBeUndefined();
    expect(parseSelectedRepairSelection({ draftDefinition: {} })).toBeUndefined();
  });

  it("null when present but malformed (so the route never falls through to the model)", () => {
    expect(parseSelectedRepairSelection({ selectedRepair: {} })).toBeNull();
    expect(parseSelectedRepairSelection({ selectedRepair: { nodeId: "n", fieldKey: "text", newReference: "not-a-token" } })).toBeNull();
    expect(parseSelectedRepairSelection({ selectedRepair: { nodeId: "", fieldKey: "text", newReference: REF1 } })).toBeNull();
  });

  it("a structurally valid selection parses through", () => {
    expect(
      parseSelectedRepairSelection({ selectedRepair: { nodeId: SLACK, fieldKey: "text", newReference: REF2 } }),
    ).toEqual({ nodeId: SLACK, fieldKey: "text", newReference: REF2 });
  });
});
