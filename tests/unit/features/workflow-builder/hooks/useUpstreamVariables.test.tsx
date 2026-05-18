/**
 * Tests for features/workflow-builder/hooks/useUpstreamVariables — Slice 3.7.
 *
 * Verifies the composition of graphSlice + the three meta hooks into
 * the picker's source tree. Critical contract: the hook keeps a
 * stable hook profile regardless of how many upstream providers the
 * current node depends on (the multi-provider loader is responsible
 * for fanning out under one hook). This test asserts no React "rules
 * of hooks" violation by varying the upstream graph between renders.
 */

const mockListNativeActions = jest.fn();
const mockListNativeTriggers = jest.fn();
const mockListProviderActions = jest.fn();
const mockListProviderTriggers = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { act, renderHook, waitFor } from "@testing-library/react";
import { useUpstreamVariables } from "@/features/workflow-builder/hooks/useUpstreamVariables";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowRunDetail } from "@/contracts/workflow";

const manualTriggerMeta: TriggerMeta = {
  key: "native:manual.run",
  provider: "native",
  type: "manual.run",
  displayName: "Manual Trigger",
  description: "Runs when you click Run Now.",
  category: "logic",
  activation: "manual",
  requiresIntegration: false,
  fields: [],
  payloadShape: [
    { name: "inputs", type: "object", description: "Run-time inputs." },
  ],
  displayOrder: 10,
};

const httpRequestMeta: ActionMeta = {
  key: "native:http_request",
  provider: "native",
  type: "http_request",
  displayName: "HTTP Request",
  description: "HTTP.",
  category: "http",
  requiresIntegration: false,
  fields: [],
  outputs: [
    { name: "status", type: "number" },
    { name: "body", type: "string" },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
};

const githubMeta: ActionMeta = {
  key: "github:add_comment",
  provider: "github",
  type: "add_comment",
  displayName: "GitHub Add Comment",
  description: "Adds a comment.",
  category: "developer",
  requiresIntegration: true,
  fields: [],
  outputs: [{ name: "commentId", type: "number" }],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
};

const noOutputsMeta: ActionMeta = {
  ...httpRequestMeta,
  key: "native:delay",
  type: "delay",
  displayName: "Delay",
  outputs: [],
};

beforeEach(() => {
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([httpRequestMeta, noOutputsMeta]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useRunSlice.getState().reset();
});

function bootGraph(): { triggerId: string; actionId: string; targetId: string } {
  // Manual trigger → HTTP action → target action (current node).
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  const trig = useGraphSlice
    .getState()
    .addTriggerFromMeta(manualTriggerMeta);
  const act = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);
  const target = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);
  return { triggerId: trig.id, actionId: act.id, targetId: target.id };
}

describe("useUpstreamVariables — empty / idle", () => {
  it("returns empty sources when currentNodeId is null", async () => {
    bootGraph();
    const { result } = renderHook(() => useUpstreamVariables(null));
    expect(result.current.sources).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("returns empty sources for an unknown currentNodeId", async () => {
    bootGraph();
    const { result } = renderHook(() => useUpstreamVariables("ghost"));
    await waitFor(() => expect(result.current.sources).toEqual([]));
  });

  it("returns empty sources for the trigger node itself (no upstream)", async () => {
    const { triggerId } = bootGraph();
    const { result } = renderHook(() => useUpstreamVariables(triggerId));
    await waitFor(() => expect(result.current.sources).toEqual([]));
  });
});

describe("useUpstreamVariables — happy path", () => {
  it("surfaces the trigger ancestor under the `trigger` alias", async () => {
    const { targetId } = bootGraph();
    const { result } = renderHook(() => useUpstreamVariables(targetId));
    await waitFor(() => expect(result.current.sources.length).toBeGreaterThan(0));
    const trigSource = result.current.sources.find((s) => s.kind === "trigger");
    expect(trigSource?.sourceId).toBe("trigger");
    expect(trigSource?.displayName).toBe("Manual Trigger");
    expect(trigSource?.outputs).toEqual([
      { name: "inputs", type: "object", description: "Run-time inputs." },
    ]);
  });

  it("surfaces action ancestors under their node id with their outputs", async () => {
    const { actionId, targetId } = bootGraph();
    const { result } = renderHook(() => useUpstreamVariables(targetId));
    await waitFor(() => expect(result.current.sources.length).toBeGreaterThanOrEqual(2));
    const actSource = result.current.sources.find((s) => s.kind === "action");
    expect(actSource?.sourceId).toBe(actionId);
    expect(actSource?.outputs.map((o) => o.name)).toEqual(["status", "body"]);
  });

  it("omits action ancestors whose meta declares zero outputs (no useless picker rows)", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTriggerFromMeta(manualTriggerMeta);
    useGraphSlice.getState().addActionFromMeta(noOutputsMeta);
    const target = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);
    const { result } = renderHook(() => useUpstreamVariables(target.id));
    await waitFor(() => expect(result.current.sources.length).toBeGreaterThan(0));
    const delaySource = result.current.sources.find(
      (s) => s.displayName === "Delay",
    );
    expect(delaySource).toBeUndefined();
  });
});

describe("useUpstreamVariables — provider catalogs", () => {
  it("loads provider-action metas through the single multi-provider hook (no dynamic loop)", async () => {
    mockListProviderActions.mockImplementation(async (p: string) =>
      p === "github" ? [githubMeta] : [],
    );
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTriggerFromMeta(manualTriggerMeta);
    useGraphSlice.getState().addAction({
      provider: "github",
      type: "add_comment",
    });
    const target = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);

    const { result } = renderHook(() => useUpstreamVariables(target.id));
    await waitFor(() => {
      const provSource = result.current.sources.find(
        (s) => s.provider === "github",
      );
      expect(provSource).toBeDefined();
    });
    const provSource = result.current.sources.find(
      (s) => s.provider === "github",
    )!;
    expect(provSource.outputs).toEqual([
      { name: "commentId", type: "number" },
    ]);
    // The multi-provider hook calls listProviderActions exactly once
    // for github.
    expect(mockListProviderActions).toHaveBeenCalledTimes(1);
    expect(mockListProviderActions).toHaveBeenCalledWith("github");
  });

  // Slice 3.9 — see describe("latestValuesBySource") below for runSlice
  // wiring assertions.

  it("varying the set of upstream providers between renders does NOT throw a hook order error", async () => {
    // This is the regression guard for the dynamic-hook-loop pitfall.
    // We render with one upstream provider, then re-render after adding
    // another upstream provider. A naive `useProviderActions(p)` loop
    // would error here.
    mockListProviderActions.mockImplementation(async () => []);
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTriggerFromMeta(manualTriggerMeta);
    useGraphSlice.getState().addAction({
      provider: "github",
      type: "add_comment",
    });
    const target = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);

    const { result, rerender } = renderHook(() =>
      useUpstreamVariables(target.id),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Mutate the graph to add a SECOND upstream provider between the
    // trigger and the target node. (Re-adding actions: add provider
    // gmail action upstream of target.)
    useGraphSlice.getState().addAction({
      provider: "gmail",
      type: "send_email",
    });
    rerender();
    // No hook count change errors thrown. The set of provider ids
    // changed from {github} to {github, gmail}; the multi-provider
    // hook handles this internally.
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});

describe("useUpstreamVariables — latestValuesBySource (Slice 3.9)", () => {
  function detailFor(triggerNodeId: string, actionNodeId: string): WorkflowRunDetail {
    return {
      id: "44444444-4444-4444-4444-444444444444",
      workflowId: "wf-1",
      status: "succeeded",
      triggerNodeId,
      startedAt: "2026-05-17T00:00:00Z",
      finishedAt: "2026-05-17T00:00:01Z",
      errorClassification: null,
      triggerEvent: {
        provider: "native",
        eventType: "manual.run",
        eventId: "ev1",
        occurredAt: "2026-05-17T00:00:00Z",
        accountId: "system",
        payload: { inputs: { foo: "bar" } },
      },
      steps: [
        {
          nodeId: triggerNodeId,
          status: "succeeded",
          output: { payload: { inputs: { foo: "bar" } } },
        },
        {
          nodeId: actionNodeId,
          status: "succeeded",
          output: { status: 200, body: "OK" },
        },
      ],
      fatalError: null,
    };
  }

  it("returns an empty record when runSlice has no detail (idle)", async () => {
    const { targetId } = bootGraph();
    const { result } = renderHook(() => useUpstreamVariables(targetId));
    await waitFor(() =>
      expect(result.current.sources.length).toBeGreaterThan(0),
    );
    expect(result.current.latestValuesBySource).toEqual({});
  });

  it("exposes per-source latest values when runSlice.detail is set", async () => {
    const { triggerId, actionId, targetId } = bootGraph();
    act(() => {
      useRunSlice.setState({
        workflowId: "wf-1",
        runId: "run-1",
        status: "succeeded",
        detail: detailFor(triggerId, actionId),
        fetchError: null,
        pollCount: 1,
      });
    });
    const { result } = renderHook(() => useUpstreamVariables(targetId));
    await waitFor(() =>
      expect(result.current.sources.length).toBeGreaterThan(0),
    );
    // Trigger value is keyed under the canonical "trigger" alias.
    expect(result.current.latestValuesBySource["trigger"]).toEqual({
      payload: { inputs: { foo: "bar" } },
    });
    // Action value is keyed under its node id.
    expect(result.current.latestValuesBySource[actionId]).toEqual({
      status: 200,
      body: "OK",
    });
  });

  it("updates when runSlice.detail changes", async () => {
    const { triggerId, actionId, targetId } = bootGraph();
    const { result } = renderHook(() => useUpstreamVariables(targetId));
    await waitFor(() =>
      expect(result.current.sources.length).toBeGreaterThan(0),
    );
    expect(result.current.latestValuesBySource).toEqual({});
    act(() => {
      useRunSlice.setState({
        workflowId: "wf-1",
        runId: "run-1",
        status: "succeeded",
        detail: detailFor(triggerId, actionId),
        fetchError: null,
        pollCount: 1,
      });
    });
    await waitFor(() =>
      expect(result.current.latestValuesBySource["trigger"]).toBeDefined(),
    );
  });

  it("omits the trigger alias when the graph's trigger node id no longer matches the run", async () => {
    const { actionId, targetId } = bootGraph();
    act(() => {
      useRunSlice.setState({
        workflowId: "wf-1",
        runId: "run-1",
        status: "succeeded",
        // Run was recorded against a now-deleted trigger node.
        detail: detailFor("t-stale", actionId),
        fetchError: null,
        pollCount: 1,
      });
    });
    const { result } = renderHook(() => useUpstreamVariables(targetId));
    await waitFor(() =>
      expect(result.current.sources.length).toBeGreaterThan(0),
    );
    expect(result.current.latestValuesBySource).not.toHaveProperty("trigger");
    // Action values are unaffected by the stale trigger.
    expect(result.current.latestValuesBySource[actionId]).toEqual({
      status: 200,
      body: "OK",
    });
  });

  it("does not call the typed client (no getWorkflowRun / no fetch / no updateWorkflow)", async () => {
    // Install a fetch spy. jsdom doesn't ship a global fetch, so define
    // one before spying so jest.spyOn finds a property to wrap.
    const originalFetch = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => {
      throw new Error("Unexpected fetch from useUpstreamVariables");
    });
    const fetchSpy = jest.spyOn(
      globalThis as unknown as { fetch: jest.Mock },
      "fetch",
    );

    const { triggerId, actionId, targetId } = bootGraph();
    act(() => {
      useRunSlice.setState({
        workflowId: "wf-1",
        runId: "run-1",
        status: "succeeded",
        detail: detailFor(triggerId, actionId),
        fetchError: null,
        pollCount: 1,
      });
    });
    const { result } = renderHook(() => useUpstreamVariables(targetId));
    await waitFor(() =>
      expect(result.current.latestValuesBySource["trigger"]).toBeDefined(),
    );

    // None of the typed-client routes (run detail, workflow update,
    // workflow get) should have been hit by useUpstreamVariables.
    const calls = fetchSpy.mock.calls;
    expect(
      calls.filter(([url]) => typeof url === "string" && url.includes("/runs/")),
    ).toHaveLength(0);
    expect(
      calls.filter(
        ([url, init]) =>
          typeof url === "string" &&
          url.startsWith("/api/workflows/") &&
          typeof init === "object" &&
          init !== null &&
          (init as { method?: string }).method === "PATCH",
      ),
    ).toHaveLength(0);

    // Restore so later tests / global state aren't polluted.
    if (originalFetch === undefined) {
      delete (globalThis as { fetch?: unknown }).fetch;
    } else {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
    }
  });
});

// ─── Slice 3.10 — provider-trigger ancestor payloadShape ────────────────────

describe("useUpstreamVariables — provider-trigger ancestor (Slice 3.10)", () => {
  const newCommitTriggerMeta: TriggerMeta = {
    key: "github:new_commit",
    provider: "github",
    type: "new_commit",
    displayName: "New Commit",
    description: "Push.",
    category: "developer",
    activation: "webhook",
    requiresIntegration: true,
    fields: [],
    payloadShape: [
      { name: "repository", type: "string", description: "owner/repo." },
      { name: "branch", type: "string", description: "Branch name." },
    ],
    displayOrder: 10,
  };

  it("surfaces a provider-trigger's payloadShape under the 'trigger' alias", async () => {
    mockListProviderTriggers.mockImplementation(async (p: string) =>
      p === "github" ? [newCommitTriggerMeta] : [],
    );
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTriggerFromMeta(newCommitTriggerMeta);
    const target = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);

    const { result } = renderHook(() => useUpstreamVariables(target.id));
    await waitFor(() => {
      const trigSource = result.current.sources.find((s) => s.kind === "trigger");
      expect(trigSource?.sourceId).toBe("trigger");
    });
    const trigSource = result.current.sources.find((s) => s.kind === "trigger");
    expect(trigSource?.displayName).toBe("New Commit");
    expect(trigSource?.outputs.map((o) => o.name)).toEqual([
      "repository",
      "branch",
    ]);
    expect(mockListProviderTriggers).toHaveBeenCalledWith("github");
  });

  it("returns no trigger source when the provider-trigger meta hasn't loaded yet (idle empty array)", async () => {
    // The provider returns an empty triggers list — no meta to resolve.
    mockListProviderTriggers.mockResolvedValue([]);
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTrigger({ provider: "slack", type: "message_received" });
    const target = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);

    const { result } = renderHook(() => useUpstreamVariables(target.id));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sources.find((s) => s.kind === "trigger")).toBeUndefined();
  });

  it("swapping a provider-trigger ancestor between renders stays hook-stable (no Rules-of-Hooks errors)", async () => {
    const githubTrig = newCommitTriggerMeta;
    const slackTrig: TriggerMeta = {
      key: "slack:slack.message.channel",
      provider: "slack",
      type: "slack.message.channel",
      displayName: "Slack Message",
      description: "msg.",
      category: "messaging",
      activation: "webhook",
      requiresIntegration: true,
      fields: [],
      payloadShape: [{ name: "text", type: "string" }],
      displayOrder: 10,
    };
    mockListProviderTriggers.mockImplementation(async (p: string) => {
      if (p === "github") return [githubTrig];
      if (p === "slack") return [slackTrig];
      return [];
    });
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTriggerFromMeta(githubTrig);
    const target = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);

    const { result, rerender } = renderHook(() =>
      useUpstreamVariables(target.id),
    );
    await waitFor(() => {
      expect(
        result.current.sources.find((s) => s.kind === "trigger")?.displayName,
      ).toBe("New Commit");
    });

    // Swap the trigger — remove the GitHub one, add a Slack one, and
    // reconnect to `target` (removeNode also drops the edges from the
    // removed node so the new trigger needs an explicit connection to
    // restore the upstream relationship).
    const triggerNodeId = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.kind === "trigger")!.id;
    useGraphSlice.getState().removeNode(triggerNodeId);
    const newTrigger = useGraphSlice.getState().addTriggerFromMeta(slackTrig);
    useGraphSlice.getState().connectNodes({ from: newTrigger.id, to: target.id });
    rerender();
    await waitFor(() => {
      expect(
        result.current.sources.find((s) => s.kind === "trigger")?.displayName,
      ).toBe("Slack Message");
    });
  });

  it("native triggers still resolve through the native catalog (no provider-trigger fetch)", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTriggerFromMeta(manualTriggerMeta);
    const target = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);

    const { result } = renderHook(() => useUpstreamVariables(target.id));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockListProviderTriggers).not.toHaveBeenCalled();
  });
});
