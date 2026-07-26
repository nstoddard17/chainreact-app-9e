/**
 * The preview-enrichment wire, end to end through the real preview owner
 * (REACT-AGENT-PREVIEW-PROVENANCE-CLOSEOUT-1).
 *
 * `usePreviewEnrichment` was written complete but never called, so every earlier test proved the
 * PARTS worked while the journey did not. These tests drive the REAL `useBuilderPreview` — real
 * provenance, real bridge, real lifecycle gate, real enricher, real graphSlice — and mock only the
 * two external boundaries: the capability-catalog fetch and the option-resolver fetch.
 *
 * The trigger here is deliberately NOT Typeform. It is a fictional spreadsheet-columns trigger that
 * declares its dynamic outputs the same generic way, which is what proves the platform layer has no
 * provider branch: if it did, this fixture would map nothing.
 */

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

const mockListProviderActions = jest.fn();
const mockListProviderTriggers = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => Promise.resolve([]),
  listAiActions: () => Promise.resolve([]),
  listNativeTriggers: () => Promise.resolve([]),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

// The preview hook creates checkpoints + emits history on apply; both are server calls this test
// does not exercise. Stubbed to inert so Apply exercises the GRAPH path, which is what is under test.
jest.mock("@/features/workflow-builder/hooks/useWorkflowCheckpoints", () => ({
  __esModule: true,
  useWorkflowCheckpoints: () => ({
    checkpoints: [],
    loading: false,
    error: null,
    restoringId: null,
    restoreError: null,
    createReactAgentCheckpoint: () => Promise.resolve({ id: "cp-1" }),
    restore: () => Promise.resolve(undefined),
  }),
}));
jest.mock("@/features/workflow-builder/hooks/useAgentChangeEmission", () => ({
  __esModule: true,
  mintAgentChangeId: () => "change-1",
  useAgentChangeEmission: () => ({
    items: [],
    loading: false,
    error: null,
    refresh: () => {},
    emitPreviewCreated: () => {},
    emitApplied: () => {},
    emitApplyFailed: () => {},
    emitDiscarded: () => {},
    emitKeptAsPreview: () => {},
    emitRestored: () => {},
  }),
}));

import { act, renderHook, waitFor } from "@testing-library/react";
import { useBuilderPreview } from "@/features/workflow-builder/hooks/useBuilderPreview";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { WorkflowPlan } from "@/contracts/guidanceSession";

// ───────────────────────────── fixtures (no Typeform anywhere) ─────────────────────────────

const SHEETS_TRIGGER: TriggerMeta = {
  key: "acme_sheets:new_row",
  provider: "acme_sheets",
  type: "new_row",
  displayName: "New spreadsheet row",
  description: "Runs when a row is added.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [{ name: "sheetId", label: "Spreadsheet", type: "text", required: true }],
  payloadShape: [
    { name: "rowNumber", type: "number" },
    { name: "columns", type: "object" },
  ],
  dynamicOutputSource: {
    configField: "sheetId",
    source: "acme_sheets:columns",
    attachUnder: "columns",
  },
  displayOrder: 10,
};

const CRM_ACTION: ActionMeta = {
  key: "some_crm:create_person",
  provider: "some_crm",
  type: "create_person",
  displayName: "Create person",
  description: "Creates a CRM person.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    { name: "email", label: "Email", type: "text", required: true },
    { name: "firstName", label: "First name", type: "text", required: false },
    { name: "company", label: "Company", type: "text", required: false },
    { name: "ownerId", label: "Owner", type: "text", required: false },
  ],
  outputs: [{ name: "personId", type: "string" }],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  displayOrder: 10,
};

/** The resolved column schema. `company` is deliberately ABSENT so a "missing" note is produced. */
const COLUMNS = [
  { value: "contact_email", label: "Contact email" },
  { value: "given_name", label: "Given name" },
];

function proposal(config: Record<string, unknown> = {}): WorkflowDefinition {
  return {
    nodes: [
      { id: "trig", kind: "trigger", provider: "acme_sheets", type: "new_row", config: { sheetId: "sheet-1" }, position: { x: 0, y: 0 } },
      { id: "crm", kind: "action", provider: "some_crm", type: "create_person", config, position: { x: 0, y: 120 } },
    ],
    edges: [{ id: "edge-1", from: "trig", to: "crm" }],
  } as WorkflowDefinition;
}

function preview(
  missingInputs: readonly string[] = ["email", "firstName", "company", "ownerId"],
): DraftPreview {
  return {
    version: 1,
    title: "Add new rows to the CRM",
    summary: "",
    nodes: [
      { previewId: "trig", role: "trigger", provider: "acme_sheets", type: "new_row", label: "New row", purpose: "", notApplied: true },
      {
        previewId: "crm",
        role: "action",
        provider: "some_crm",
        type: "create_person",
        label: "Create person",
        purpose: "",
        missingInputs,
        notApplied: true,
      },
    ],
    edges: [{ previewId: "edge-1", fromPreviewId: "trig", toPreviewId: "crm", notApplied: true }],
    notice: "Preview only — your workflow has not changed.",
    notApplied: true,
  } as DraftPreview;
}

const PLAN: WorkflowPlan = {
  schemaVersion: 1,
  title: "Add new rows to the CRM",
  summary: "",
  steps: [
    { ref: "trig", role: "trigger", provider: "acme_sheets", type: "new_row", purpose: "" },
    { ref: "crm", role: "action", provider: "some_crm", type: "create_person", purpose: "" },
  ],
  notApplied: true,
} as WorkflowPlan;

function optionsSuccess(items: { value: string; label: string }[]) {
  return { ok: true as const, source: "acme_sheets:columns", items, hasMore: false };
}

/** Boot a live draft that ALREADY contains both nodes, so the proposal is an EDIT of it. */
function bootDraft(crmConfig: Record<string, unknown> = {}) {
  useGraphSlice.getState().hydrate("wf-1", {
    nodes: [
      { id: "trig", kind: "trigger", provider: "acme_sheets", type: "new_row", config: {}, position: { x: 0, y: 0 } },
      { id: "crm", kind: "action", provider: "some_crm", type: "create_person", config: crmConfig, position: { x: 0, y: 120 } },
    ],
    edges: [{ id: "edge-1", from: "trig", to: "crm" }],
  } as never);
}

function renderPreview() {
  return renderHook(() =>
    useBuilderPreview({
      workflowId: "wf-1",
      localOnly: true,
      pendingNodes: useGraphSlice.getState().pendingNodes,
      pendingEdges: useGraphSlice.getState().pendingEdges,
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListProviderTriggers.mockResolvedValue([SHEETS_TRIGGER]);
  mockListProviderActions.mockResolvedValue([CRM_ACTION]);
  mockFetchOptionsSource.mockResolvedValue(optionsSuccess(COLUMNS));
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  bootDraft();
});

// ───────────────────────────────── enrichment lifecycle ─────────────────────────────────

describe("enrichment runs when a declared dynamic schema resolves (#10, #36)", () => {
  it("fills agent-owned unresolved fields on the SAME preview, with no Typeform involved", async () => {
    const { result } = renderPreview();
    act(() => {
      result.current.handleShowPreview({ plan: PLAN, preview: preview(), proposedDefinition: proposal() });
    });

    await waitFor(() => {
      expect(result.current.previewEnrichment.mapped["crm.email"]).toBe("{{trig.columns.contact_email}}");
    });

    const enriched = result.current.previewOverlay!.proposedDefinition!;
    expect(enriched.nodes[1]!.config.email).toBe("{{trig.columns.contact_email}}");
    expect(enriched.nodes[1]!.config.firstName).toBe("{{trig.columns.given_name}}");

    // (#19, #20, #21) same preview, same ids, nothing duplicated.
    expect(result.current.previewOverlay!.agentChangeId).toBe("change-1");
    expect(enriched.nodes.map((n) => n.id)).toEqual(["trig", "crm"]);
    expect(enriched.edges.map((e) => e.id)).toEqual(["edge-1"]);
    expect(enriched.nodes).toHaveLength(2);
  });

  it("(#26) reports a field the resource does not contain instead of inventing one", async () => {
    const { result } = renderPreview();
    act(() => {
      result.current.handleShowPreview({ plan: PLAN, preview: preview(), proposedDefinition: proposal() });
    });

    await waitFor(() => expect(result.current.previewEnrichment.notes.length).toBeGreaterThan(0));
    expect(result.current.previewEnrichment.notes).toContainEqual(
      expect.objectContaining({ nodeId: "crm", field: "company", kind: "missing" }),
    );
    expect(result.current.previewOverlay!.proposedDefinition!.nodes[1]!.config.company).toBeUndefined();
  });

  it("(#14, #15) an identical schema does not enrich again, and enriching does not loop", async () => {
    const { result } = renderPreview();
    act(() => {
      result.current.handleShowPreview({ plan: PLAN, preview: preview(), proposedDefinition: proposal() });
    });
    await waitFor(() => expect(result.current.previewEnrichment.mapped["crm.email"]).toBeDefined());

    const settled = result.current.previewOverlay!.proposedDefinition;
    const resolveCalls = mockFetchOptionsSource.mock.calls.length;

    // Let any follow-up effect pass settle.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    // Enrichment changed the proposal's CONTENT but not its identity → no second pass, no new object.
    expect(result.current.previewOverlay!.proposedDefinition).toBe(settled);
    expect(mockFetchOptionsSource.mock.calls.length).toBe(resolveCalls);
  });
});

describe("enrichment does NOT run when there is no schema (#11, #12)", () => {
  it("(#11) a resolver error maps nothing and leaves the proposal untouched", async () => {
    mockFetchOptionsSource.mockResolvedValue({
      ok: false,
      source: "acme_sheets:columns",
      code: "PROVIDER_ERROR",
      message: "Couldn't load columns right now.",
    });

    const { result } = renderPreview();
    const before = proposal();
    act(() => {
      result.current.handleShowPreview({ plan: PLAN, preview: preview(), proposedDefinition: before });
    });

    await waitFor(() => expect(result.current.previewEnrichment.status).toBe("retryable_error"));
    expect(result.current.previewEnrichment.mapped).toEqual({});
    expect(result.current.previewOverlay!.proposedDefinition).toBe(before);
    // The user sees safe copy, never the provider's own words verbatim as an error surface.
    expect(result.current.previewEnrichment.message).toBeTruthy();
  });

  it("(#12) no chosen resource yet → waiting, not a mapping attempt", async () => {
    const { result } = renderPreview();
    const noResource = {
      ...proposal(),
      nodes: [
        { id: "trig", kind: "trigger", provider: "acme_sheets", type: "new_row", config: {}, position: { x: 0, y: 0 } },
        { id: "crm", kind: "action", provider: "some_crm", type: "create_person", config: {}, position: { x: 0, y: 120 } },
      ],
    } as WorkflowDefinition;

    act(() => {
      result.current.handleShowPreview({ plan: PLAN, preview: preview(), proposedDefinition: noResource });
    });

    await waitFor(() => expect(result.current.previewEnrichment.status).toBe("waiting_for_config"));
    expect(result.current.previewEnrichment.awaitingResource).toBe(true);
    expect(result.current.previewEnrichment.mapped).toEqual({});
    expect(mockFetchOptionsSource).not.toHaveBeenCalled();
  });
});

describe("a real resource change re-enriches (#13)", () => {
  it("maps against the NEW schema and reports what the new resource lost", async () => {
    const { result } = renderPreview();
    act(() => {
      result.current.handleShowPreview({ plan: PLAN, preview: preview(), proposedDefinition: proposal() });
    });
    await waitFor(() => expect(result.current.previewEnrichment.mapped["crm.email"]).toBeDefined());

    // The user picks a different spreadsheet whose columns no longer include an email.
    mockFetchOptionsSource.mockResolvedValue(
      optionsSuccess([{ value: "employer", label: "Employer" }]),
    );
    const current = result.current.previewOverlay!.proposedDefinition!;
    act(() => {
      result.current.handleShowPreview({
        plan: PLAN,
        preview: preview(),
        proposedDefinition: {
          ...current,
          nodes: current.nodes.map((n) => (n.id === "trig" ? { ...n, config: { sheetId: "sheet-2" } } : n)),
        },
        agentChangeId: "change-1",
      });
    });

    // (#27) the previously-mapped email path is gone from the new schema and is REPORTED, not repointed.
    await waitFor(() => {
      expect(result.current.previewEnrichment.invalidated).toContainEqual(
        expect.objectContaining({ nodeId: "crm", field: "email" }),
      );
    });
    expect(result.current.previewOverlay!.proposedDefinition!.nodes[1]!.config.email).toBe(
      "{{trig.columns.contact_email}}",
    );
  });
});

// ───────────────────────────────── ownership protection ─────────────────────────────────

describe("user-owned values are never overwritten (#3, #4, #6, #7, #16)", () => {
  it("a field the user edited BEFORE the schema resolves survives enrichment", async () => {
    const { result } = renderPreview();
    act(() => {
      result.current.handleShowPreview({ plan: PLAN, preview: preview(), proposedDefinition: proposal() });
    });

    // The user types their own address while the columns are still loading.
    act(() => {
      result.current.handlePreviewConfigChange("crm", "email", "ops@myco.com");
    });
    expect(result.current.previewProvenance["crm.email"]).toBe("user");

    await waitFor(() => {
      expect(result.current.previewEnrichment.mapped["crm.firstName"]).toBeDefined();
    });

    // firstName was the agent's and got mapped; email was the user's and was left completely alone.
    expect(result.current.previewEnrichment.mapped["crm.email"]).toBeUndefined();
    expect(result.current.previewOverlay!.proposedDefinition!.nodes[1]!.config.email).toBeUndefined();
    expect(result.current.agentOwnedFields.crm).not.toContain("email");
  });

  it("(#6, #7) an explicit CLEAR is a user decision — '' is not 'unset'", async () => {
    const { result } = renderPreview();
    act(() => {
      result.current.handleShowPreview({ plan: PLAN, preview: preview(), proposedDefinition: proposal() });
    });
    act(() => {
      result.current.handlePreviewConfigChange("crm", "email", "");
    });

    await waitFor(() => expect(result.current.previewEnrichment.mapped["crm.firstName"]).toBeDefined());
    expect(result.current.previewProvenance["crm.email"]).toBe("user");
    expect(result.current.previewEnrichment.mapped["crm.email"]).toBeUndefined();
  });

  it("(#2) a field the proposal did NOT touch stays out of the agent's reach", async () => {
    // `ownerId` is already set on the live draft and the proposal leaves it alone.
    useGraphSlice.getState().reset();
    bootDraft({ ownerId: "user-7" });
    const { result } = renderPreview();
    act(() => {
      result.current.handleShowPreview({
        plan: PLAN,
        // The agent did NOT list ownerId as still-needed: it is the user's existing value.
        preview: preview(["email", "firstName", "company"]),
        proposedDefinition: proposal({ ownerId: "user-7" }),
      });
    });

    await waitFor(() => expect(result.current.previewEnrichment.mapped["crm.email"]).toBeDefined());
    expect(result.current.agentOwnedFields.crm ?? []).not.toContain("ownerId");
    expect(result.current.previewOverlay!.proposedDefinition!.nodes[1]!.config.ownerId).toBe("user-7");
  });
});

// ───────────────────────────────── preview safety + apply ─────────────────────────────────

describe("nothing persists before Apply (#31)", () => {
  it("enrichment leaves the live draft completely untouched", async () => {
    const { result } = renderPreview();
    act(() => {
      result.current.handleShowPreview({ plan: PLAN, preview: preview(), proposedDefinition: proposal() });
    });
    await waitFor(() => expect(result.current.previewEnrichment.mapped["crm.email"]).toBeDefined());

    const live = useGraphSlice.getState();
    expect(live.pendingNodes.find((n) => n.id === "crm")!.config).toEqual({});
    expect(live.isDirty).toBe(false);
  });
});

describe("Apply updates the CURRENT workflow (#32, #33, #34)", () => {
  it("writes the enriched mappings and the user's own choices into the same draft", async () => {
    const { result } = renderPreview();
    act(() => {
      result.current.handleShowPreview({ plan: PLAN, preview: preview(), proposedDefinition: proposal() });
    });
    await waitFor(() => expect(result.current.previewEnrichment.mapped["crm.email"]).toBeDefined());

    act(() => {
      result.current.handlePreviewConfigChange("crm", "ownerId", "user-9");
    });
    act(() => {
      result.current.handleApplyPreview();
    });

    const applied = useGraphSlice.getState().pendingNodes.find((n) => n.id === "crm")!;
    // The agent's mapping survived...
    expect(applied.config.email).toBe("{{trig.columns.contact_email}}");
    // ...and so did the user's own value, which the edit path used to drop entirely.
    expect(applied.config.ownerId).toBe("user-9");

    // (#33, #20, #21) the same workflow, the same ids, no second graph.
    expect(useGraphSlice.getState().workflowId).toBe("wf-1");
    expect(useGraphSlice.getState().pendingNodes.map((n) => n.id).sort()).toEqual(["crm", "trig"]);
    expect(useGraphSlice.getState().pendingEdges.map((e) => e.id)).toEqual(["edge-1"]);

    // (#34) no fabricated identity values anywhere in the applied config.
    expect(JSON.stringify(applied.config)).not.toMatch(/@example\.com|example\.org/);
  });

  it("clears provenance after Apply so nothing leaks into runtime config", async () => {
    const { result } = renderPreview();
    act(() => {
      result.current.handleShowPreview({ plan: PLAN, preview: preview(), proposedDefinition: proposal() });
    });
    await waitFor(() => expect(result.current.previewEnrichment.mapped["crm.email"]).toBeDefined());
    act(() => {
      result.current.handleApplyPreview();
    });

    expect(result.current.previewProvenance).toEqual({});
    expect(result.current.previewOverlay).toBeNull();
    const applied = useGraphSlice.getState().pendingNodes.find((n) => n.id === "crm")!;
    expect(Object.keys(applied.config)).not.toContain("__provenance");
  });

  it("a dismissed preview clears provenance and stops enriching", async () => {
    const { result } = renderPreview();
    act(() => {
      result.current.handleShowPreview({ plan: PLAN, preview: preview(), proposedDefinition: proposal() });
    });
    await waitFor(() => expect(result.current.previewEnrichment.mapped["crm.email"]).toBeDefined());

    act(() => {
      result.current.handleDiscardPreview();
    });
    expect(result.current.previewProvenance).toEqual({});
    expect(result.current.previewOverlay).toBeNull();
    // The live draft never received anything.
    expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "crm")!.config).toEqual({});
  });
});
