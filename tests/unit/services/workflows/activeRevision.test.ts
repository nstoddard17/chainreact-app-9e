/**
 * @jest-environment node
 *
 * Tests for services/workflows/activeRevision.ts (V2-READY-41B).
 *
 * Mocks the workflows repository so neither the DB nor a real Supabase client is
 * touched. Proves:
 *   - getActiveDefinition falls back to the draft when active_revision_id is null
 *     (legacy / freshly-activated workflows) and never reads a revision.
 *   - getActiveDefinition returns the immutable REVISION definition when one is
 *     active — even when the draft has since changed (immutability of the read).
 *   - a dangling active_revision_id fails safe to the draft + warns WITHOUT
 *     leaking the graph / account id / definition content.
 *   - snapshotActiveRevision creates a revision from the current draft, then
 *     repoints active_revision_id.
 */

const mockGetRevisionByIdServiceRole = jest.fn();
const mockCreateRevision = jest.fn();
const mockSetActiveRevision = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getRevisionByIdServiceRole: (...a: unknown[]) => mockGetRevisionByIdServiceRole(...a),
  createRevision: (...a: unknown[]) => mockCreateRevision(...a),
  setActiveRevision: (...a: unknown[]) => mockSetActiveRevision(...a),
}));

import {
  createRevisionSnapshot,
  getActiveDefinition,
  getDefinitionForExecution,
} from "@/services/workflows/activeRevision";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowDefinition } from "@/contracts/workflow";

const draftDef = {
  nodes: [
    {
      id: "n1",
      kind: "trigger",
      provider: "slack",
      type: "message_received",
      config: { channel: "C-DRAFT-SECRET" },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
} as unknown as WorkflowDefinition;

const revisionDef = {
  nodes: [
    {
      id: "n1",
      kind: "trigger",
      provider: "slack",
      type: "message_received",
      config: { channel: "C-REVISION" },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
} as unknown as WorkflowDefinition;

function makeWorkflow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: "wf-1",
    accountId: "acct-SECRET",
    createdByUserId: "user-SECRET",
    name: "WF",
    state: "active",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: draftDef,
    deletedAt: null,
    folderId: null,
    deletedByUserId: null,
    purgeAfter: null,
    deletedFromFolderId: null,
    deleteOperationId: null,
    createdAt: "2026-06-15T00:00:00Z",
    updatedAt: "2026-06-15T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockGetRevisionByIdServiceRole.mockReset();
  mockCreateRevision.mockReset();
  mockSetActiveRevision.mockReset();
});

describe("getActiveDefinition", () => {
  it("returns the DRAFT (source: draft) when active_revision_id is null — no revision read", async () => {
    const wf = makeWorkflow({ activeRevisionId: null });
    const result = await getActiveDefinition(wf);
    expect(result).toEqual({
      definition: draftDef,
      source: "draft",
      revisionId: null,
    });
    expect(mockGetRevisionByIdServiceRole).not.toHaveBeenCalled();
  });

  it("returns the immutable REVISION definition (source: active_revision) when one is active", async () => {
    const wf = makeWorkflow({ activeRevisionId: "rev-1" });
    mockGetRevisionByIdServiceRole.mockResolvedValueOnce({
      id: "rev-1",
      workflowId: "wf-1",
      definition: revisionDef,
      createdAt: "2026-06-15T00:00:00Z",
    });
    const result = await getActiveDefinition(wf);
    expect(mockGetRevisionByIdServiceRole).toHaveBeenCalledWith("rev-1");
    expect(result).toEqual({
      definition: revisionDef,
      source: "active_revision",
      revisionId: "rev-1",
    });
  });

  it("is immutable to later draft edits — returns the revision even when the draft changed", async () => {
    // The workflow's draft has drifted (C-DRAFT-SECRET) but the active revision
    // is frozen (C-REVISION). getActiveDefinition must return the revision.
    const wf = makeWorkflow({ activeRevisionId: "rev-1", draftDefinition: draftDef });
    mockGetRevisionByIdServiceRole.mockResolvedValueOnce({
      id: "rev-1",
      workflowId: "wf-1",
      definition: revisionDef,
      createdAt: "2026-06-15T00:00:00Z",
    });
    const result = await getActiveDefinition(wf);
    expect(result.source).toBe("active_revision");
    expect(result.definition).toBe(revisionDef);
    expect(result.definition).not.toBe(draftDef);
  });

  it("fails safe to the draft + warns (no leak) when active_revision_id points at a missing row", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const wf = makeWorkflow({ activeRevisionId: "rev-gone" });
    mockGetRevisionByIdServiceRole.mockResolvedValueOnce(null);

    const result = await getActiveDefinition(wf);

    expect(result).toEqual({ definition: draftDef, source: "draft", revisionId: null });
    const logged = warnSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("workflow.active_revision.missing");
    expect(logged).toContain("wf-1");
    // No leak: account id, creator id, and definition content never logged.
    expect(logged).not.toContain("acct-SECRET");
    expect(logged).not.toContain("user-SECRET");
    expect(logged).not.toContain("C-DRAFT-SECRET");
    expect(logged).not.toContain("C-REVISION");
    warnSpy.mockRestore();
  });
});

describe("getDefinitionForExecution (flag gate)", () => {
  const FLAG = "ENABLE_ACTIVE_REVISION_EXECUTION";
  afterEach(() => {
    delete process.env[FLAG];
  });

  it("flag OFF (default): returns the draft WITHOUT reading a revision, even if active_revision_id is set", async () => {
    delete process.env[FLAG];
    const wf = makeWorkflow({ activeRevisionId: "rev-1" });
    const result = await getDefinitionForExecution(wf);
    expect(result).toEqual({ definition: draftDef, source: "draft", revisionId: null });
    expect(mockGetRevisionByIdServiceRole).not.toHaveBeenCalled();
  });

  it("flag ON: delegates to getActiveDefinition and reads the active revision", async () => {
    process.env[FLAG] = "true";
    const wf = makeWorkflow({ activeRevisionId: "rev-1" });
    mockGetRevisionByIdServiceRole.mockResolvedValueOnce({
      id: "rev-1",
      workflowId: "wf-1",
      definition: revisionDef,
      createdAt: "2026-06-15T00:00:00Z",
    });
    const result = await getDefinitionForExecution(wf);
    expect(mockGetRevisionByIdServiceRole).toHaveBeenCalledWith("rev-1");
    expect(result).toEqual({
      definition: revisionDef,
      source: "active_revision",
      revisionId: "rev-1",
    });
  });

  it("draft mode ALWAYS returns the draft, even with the flag ON (V2-READY-41E test/preview)", async () => {
    process.env[FLAG] = "true";
    const wf = makeWorkflow({ activeRevisionId: "rev-1" });
    const result = await getDefinitionForExecution(wf, "draft");
    expect(result).toEqual({ definition: draftDef, source: "draft", revisionId: null });
    expect(mockGetRevisionByIdServiceRole).not.toHaveBeenCalled();
  });

  it("live mode + flag ON reads the active revision (V2-READY-41E)", async () => {
    process.env[FLAG] = "true";
    const wf = makeWorkflow({ activeRevisionId: "rev-1" });
    mockGetRevisionByIdServiceRole.mockResolvedValueOnce({
      id: "rev-1",
      workflowId: "wf-1",
      definition: revisionDef,
      createdAt: "2026-06-15T00:00:00Z",
    });
    const result = await getDefinitionForExecution(wf, "live");
    expect(result.source).toBe("active_revision");
    expect(result.definition).toBe(revisionDef);
  });

  it("flag ON + null active_revision_id: safe draft fallback", async () => {
    process.env[FLAG] = "true";
    const wf = makeWorkflow({ activeRevisionId: null });
    const result = await getDefinitionForExecution(wf);
    expect(result).toEqual({ definition: draftDef, source: "draft", revisionId: null });
    expect(mockGetRevisionByIdServiceRole).not.toHaveBeenCalled();
  });

  it("flag ON + dangling active_revision_id: safe draft fallback + warns without leaking (V2-READY-41D)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    process.env[FLAG] = "true";
    const wf = makeWorkflow({ activeRevisionId: "rev-gone" });
    mockGetRevisionByIdServiceRole.mockResolvedValueOnce(null);

    const result = await getDefinitionForExecution(wf);

    expect(result).toEqual({ definition: draftDef, source: "draft", revisionId: null });
    const logged = warnSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("workflow.active_revision.missing");
    expect(logged).not.toContain("acct-SECRET");
    expect(logged).not.toContain("user-SECRET");
    expect(logged).not.toContain("C-DRAFT-SECRET");
    expect(logged).not.toContain("C-REVISION");
    warnSpy.mockRestore();
  });

  it("parity: when the revision equals the draft, OFF and ON resolve to value-equal definitions (V2-READY-41D)", async () => {
    const wf = makeWorkflow({ activeRevisionId: "rev-1", draftDefinition: draftDef });

    delete process.env[FLAG];
    const off = await getDefinitionForExecution(wf);

    process.env[FLAG] = "true";
    // Revision row holds a definition equal BY VALUE to the draft (distinct object).
    mockGetRevisionByIdServiceRole.mockResolvedValueOnce({
      id: "rev-1",
      workflowId: "wf-1",
      definition: JSON.parse(JSON.stringify(draftDef)),
      createdAt: "2026-06-15T00:00:00Z",
    });
    const on = await getDefinitionForExecution(wf);

    expect(off.source).toBe("draft");
    expect(on.source).toBe("active_revision");
    expect(on.definition).toEqual(off.definition); // equivalent execution input
  });
});

describe("createRevisionSnapshot", () => {
  it("creates a revision from the SUPPLIED definition and returns its id (does NOT set the pointer)", async () => {
    const wf = makeWorkflow({ draftDefinition: draftDef });
    mockCreateRevision.mockResolvedValueOnce({
      id: "rev-new",
      workflowId: "wf-1",
      definition: revisionDef,
      createdAt: "2026-06-15T00:00:00Z",
    });

    // Pass a definition distinct from the draft to prove it uses the SUPPLIED one.
    const id = await createRevisionSnapshot(wf, revisionDef);

    expect(mockCreateRevision).toHaveBeenCalledWith({
      workflowId: "wf-1",
      definition: revisionDef,
    });
    // 41C: the orchestrator sets active_revision_id atomically via applyTransition,
    // so this helper must NOT call setActiveRevision.
    expect(mockSetActiveRevision).not.toHaveBeenCalled();
    expect(id).toBe("rev-new");
  });

  it("propagates a revision-creation error (the orchestrator treats it best-effort)", async () => {
    const wf = makeWorkflow();
    mockCreateRevision.mockRejectedValueOnce(new Error("insert denied"));
    await expect(createRevisionSnapshot(wf, draftDef)).rejects.toThrow(/insert denied/);
    expect(mockSetActiveRevision).not.toHaveBeenCalled();
  });
});
