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
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { renderHook, waitFor } from "@testing-library/react";
import { useUpstreamVariables } from "@/features/workflow-builder/hooks/useUpstreamVariables";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

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
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  useGraphSlice.getState().reset();
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
