/**
 * Tests for CS-8 dynamic-output synthesis inside useUpstreamVariables
 * (AI-PROVIDER-8).
 *
 * Uses the REAL shipped AI metas served through the mocked catalog fetch
 * (the same boundary every hook test mocks) and the REAL graphSlice, so
 * the assertion is the true author path: commit a schema in an upstream
 * AI node's config → the variable picker's source tree exposes the
 * author's own field names, immediately and without any refetch.
 */

const mockListNativeActions = jest.fn();
const mockListNativeTriggers = jest.fn();
const mockListAiActions = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listAiActions: () => mockListAiActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: () => Promise.resolve([]),
  listProviderTriggers: () => Promise.resolve([]),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { useUpstreamVariables } from "@/features/workflow-builder/hooks/useUpstreamVariables";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { __resetAiActionsCacheForTests } from "@/features/workflow-builder/hooks/useAiActions";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import { analyzeDocumentMeta } from "@/integrations/ai/actions/analyzeDocument.meta";
import { transformDataMeta } from "@/integrations/ai/actions/transformData.meta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { VariableSource } from "@/features/workflow-builder/hooks/useUpstreamVariables";

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
  payloadShape: [{ name: "inputs", type: "object" }],
  displayOrder: 10,
};

const EXTRACT_FIELDS_CONFIG = {
  mode: "extract_fields",
  expectedFields: {
    fields: [
      { name: "employee_name", type: "string" },
      { name: "gross_pay", type: "currency" },
      { name: "department", type: "string" },
    ],
  },
};

beforeEach(() => {
  mockListNativeActions.mockReset().mockResolvedValue([]);
  mockListNativeTriggers.mockReset().mockResolvedValue([manualTriggerMeta]);
  mockListAiActions
    .mockReset()
    .mockResolvedValue([analyzeDocumentMeta, transformDataMeta]);
  __resetAiActionsCacheForTests();
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useRunSlice.getState().reset();
});

/** Manual trigger → AI node (meta) → target; returns both ids. */
function bootAiGraph(meta = analyzeDocumentMeta): {
  aiNodeId: string;
  targetId: string;
} {
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  useGraphSlice.getState().addTriggerFromMeta(manualTriggerMeta);
  const aiNode = useGraphSlice.getState().addActionFromMeta(meta);
  const target = useGraphSlice.getState().addAction({
    provider: "native",
    type: "http_request",
  });
  return { aiNodeId: aiNode.id, targetId: target.id };
}

function aiSource(
  sources: readonly VariableSource[],
  aiNodeId: string,
): VariableSource | undefined {
  return sources.find((s) => s.sourceId === aiNodeId);
}

function childNames(
  source: VariableSource | undefined,
  outputName: string,
): readonly string[] | undefined {
  return source?.outputs
    .find((o) => o.name === outputName)
    ?.fields?.map((f) => f.name);
}

describe("useUpstreamVariables — CS-8 dynamic outputs", () => {
  it("exposes the author's schema fields under `fields` for an extract_fields AI ancestor", async () => {
    const { aiNodeId, targetId } = bootAiGraph();
    act(() => {
      useGraphSlice.getState().updateNodeConfig(aiNodeId, EXTRACT_FIELDS_CONFIG);
    });
    const { result } = renderHook(() => useUpstreamVariables(targetId));
    await waitFor(() =>
      expect(aiSource(result.current.sources, aiNodeId)).toBeDefined(),
    );
    expect(childNames(aiSource(result.current.sources, aiNodeId), "fields")).toEqual([
      "employee_name",
      "gross_pay",
      "department",
    ]);
    // Fully typed: currency → number.
    const fields = aiSource(result.current.sources, aiNodeId)!.outputs.find(
      (o) => o.name === "fields",
    )!;
    expect(fields.fields!.find((f) => f.name === "gross_pay")!.type).toBe("number");
  });

  it("updates immediately when the schema changes — no refetch, no stale children", async () => {
    const { aiNodeId, targetId } = bootAiGraph();
    act(() => {
      useGraphSlice.getState().updateNodeConfig(aiNodeId, EXTRACT_FIELDS_CONFIG);
    });
    const { result } = renderHook(() => useUpstreamVariables(targetId));
    await waitFor(() =>
      expect(childNames(aiSource(result.current.sources, aiNodeId), "fields")).toBeDefined(),
    );
    const fetchesAfterLoad = mockListAiActions.mock.calls.length;

    // Rename gross_pay → net_pay, drop department, keep employee_name.
    act(() => {
      useGraphSlice.getState().updateNodeConfig(aiNodeId, {
        mode: "extract_fields",
        expectedFields: {
          fields: [
            { name: "employee_name", type: "string" },
            { name: "net_pay", type: "currency" },
          ],
        },
      });
    });

    expect(childNames(aiSource(result.current.sources, aiNodeId), "fields")).toEqual([
      "employee_name",
      "net_pay",
    ]);
    expect(mockListAiActions.mock.calls.length).toBe(fetchesAfterLoad);
  });

  it("children disappear when the author switches away from the extract mode", async () => {
    const { aiNodeId, targetId } = bootAiGraph();
    act(() => {
      useGraphSlice.getState().updateNodeConfig(aiNodeId, EXTRACT_FIELDS_CONFIG);
    });
    const { result } = renderHook(() => useUpstreamVariables(targetId));
    await waitFor(() =>
      expect(childNames(aiSource(result.current.sources, aiNodeId), "fields")).toBeDefined(),
    );

    act(() => {
      useGraphSlice.getState().updateNodeConfig(aiNodeId, {
        ...EXTRACT_FIELDS_CONFIG,
        mode: "summarize",
      });
    });
    expect(
      childNames(aiSource(result.current.sources, aiNodeId), "fields"),
    ).toBeUndefined();
  });

  it("an empty / absent schema exposes no children (default summarize node)", async () => {
    const { aiNodeId, targetId } = bootAiGraph();
    const { result } = renderHook(() => useUpstreamVariables(targetId));
    await waitFor(() =>
      expect(aiSource(result.current.sources, aiNodeId)).toBeDefined(),
    );
    const source = aiSource(result.current.sources, aiNodeId)!;
    expect(childNames(source, "fields")).toBeUndefined();
    expect(childNames(source, "rows")).toBeUndefined();
    // Static outputs are still the full CS-5 key set.
    expect(source.outputs.map((o) => o.name)).toEqual(
      analyzeDocumentMeta.outputs.map((o) => o.name),
    );
  });

  it("row schemas attach under `rows`, and reordering rows reorders the children", async () => {
    const { aiNodeId, targetId } = bootAiGraph();
    const rows = (names: string[]) => ({
      mode: "extract_rows",
      rowSchema: { fields: names.map((name) => ({ name, type: "string" })) },
    });
    act(() => {
      useGraphSlice.getState().updateNodeConfig(aiNodeId, rows(["item", "amount"]));
    });
    const { result } = renderHook(() => useUpstreamVariables(targetId));
    await waitFor(() =>
      expect(childNames(aiSource(result.current.sources, aiNodeId), "rows")).toEqual([
        "item",
        "amount",
      ]),
    );
    act(() => {
      useGraphSlice.getState().updateNodeConfig(aiNodeId, rows(["amount", "item"]));
    });
    expect(childNames(aiSource(result.current.sources, aiNodeId), "rows")).toEqual([
      "amount",
      "item",
    ]);
  });

  it("Transform Data custom mode exposes the schema under both `rows` and `record`; action mode exposes neither", async () => {
    const { aiNodeId, targetId } = bootAiGraph(transformDataMeta);
    act(() => {
      useGraphSlice.getState().updateNodeConfig(aiNodeId, {
        destinationMode: "custom",
        destinationSchema: {
          fields: [
            { name: "subject", type: "string" },
            { name: "body", type: "string" },
          ],
        },
      });
    });
    const { result } = renderHook(() => useUpstreamVariables(targetId));
    await waitFor(() =>
      expect(childNames(aiSource(result.current.sources, aiNodeId), "rows")).toEqual([
        "subject",
        "body",
      ]),
    );
    expect(childNames(aiSource(result.current.sources, aiNodeId), "record")).toEqual([
      "subject",
      "body",
    ]);

    act(() => {
      useGraphSlice.getState().updateNodeConfig(aiNodeId, {
        destinationMode: "action",
        destinationAction: "microsoft-outlook:send_email",
      });
    });
    const source = aiSource(result.current.sources, aiNodeId)!;
    expect(childNames(source, "rows")).toBeUndefined();
    expect(childNames(source, "record")).toBeUndefined();
  });
});
