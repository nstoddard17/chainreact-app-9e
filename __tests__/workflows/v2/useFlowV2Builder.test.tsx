/**
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from "@testing-library/react"

import type { Flow } from "@/src/lib/workflows/builder/schema"
import { useFlowV2Builder } from "@/src/lib/workflows/builder/useFlowV2Builder"

const mockSetNodes = jest.fn()
const mockSetEdges = jest.fn()
const mockSetWorkflowName = jest.fn()
const mockSetHasUnsavedChanges = jest.fn()

jest.mock("@/hooks/workflows/useWorkflowBuilder", () => ({
  useWorkflowBuilder: () => ({
    setNodes: mockSetNodes,
    setEdges: mockSetEdges,
    setWorkflowName: mockSetWorkflowName,
    setHasUnsavedChanges: mockSetHasUnsavedChanges,
  }),
}))

const baseFlow: Flow = {
  id: "flow-1",
  name: "Test Flow",
  version: 1,
  nodes: [],
  edges: [],
  trigger: { type: "manual", enabled: true },
  interface: { inputs: [], outputs: [] },
}

function mockFetchSequence(responses: Array<{ ok?: boolean; body: any }>) {
  const fetchMock = jest.fn().mockImplementation(() => {
    const next = responses.shift()
    if (!next) {
      throw new Error("Unexpected fetch call")
    }
    const { ok = true, body } = next
    return Promise.resolve({
      ok,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as any)
  })

  ;(global as any).fetch = fetchMock

  return fetchMock
}

describe("useFlowV2Builder", () => {
  afterEach(() => {
    jest.clearAllMocks()
    delete (global as any).fetch
  })

  it("applies agent edits and updates nodes", async () => {
    const updatedFlow: Flow = {
      ...baseFlow,
      version: 2,
      nodes: [
        {
          id: "node-1",
          type: "mapper.node",
          label: "Mapper",
          config: {},
          inPorts: [],
          outPorts: [],
          io: { inputSchema: undefined, outputSchema: undefined },
          policy: { timeoutMs: 60000, retries: 0 },
          costHint: 0,
          metadata: { position: { x: 100, y: 100 } },
        },
      ],
      edges: [],
    }

    const fetchMock = mockFetchSequence([
      { body: { revisions: [{ id: "rev-1", version: 1 }] } },
      { body: { revision: { id: "rev-1", flowId: "flow-1", graph: baseFlow } } },
      { body: { edits: [{ op: "addNode", node: updatedFlow.nodes[0] }] } },
      { body: { flow: updatedFlow, revisionId: "rev-2", version: 2 } },
    ])

    const { result } = renderHook(() => useFlowV2Builder("flow-1"))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    await act(async () => {
      const agent = await result.current?.actions.askAgent("Add mapper node")
      expect(agent?.edits).toHaveLength(1)
      await result.current?.actions.applyEdits(agent?.edits ?? [])
    })

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(mockSetNodes).toHaveBeenCalled()
    const latestNodes = mockSetNodes.mock.calls.at(-1)?.[0]
    expect(Array.isArray(latestNodes)).toBe(true)
    expect(latestNodes[0].id).toBe("node-1")
  })

  it("starts a run and stores last run id", async () => {
    const fetchMock = mockFetchSequence([
      { body: { revisions: [{ id: "rev-1", version: 1 }] } },
      { body: { revision: { id: "rev-1", flowId: "flow-1", graph: baseFlow } } },
      { body: { runId: "run-123" } },
    ])

    const { result } = renderHook(() => useFlowV2Builder("flow-1"))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    await act(async () => {
      const runResult = await result.current?.actions.run({ inputs: {} })
      expect(runResult?.runId).toBe("run-123")
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.current?.flowState.lastRunId).toBe("run-123")
  })

  it("retrieves node snapshot data", async () => {
    const fetchMock = mockFetchSequence([
      { body: { revisions: [{ id: "rev-1", version: 1 }] } },
      { body: { revision: { id: "rev-1", flowId: "flow-1", graph: baseFlow } } },
      {
        body: {
          run: {
            id: "run-200",
            status: "success",
            nodes: [],
            logs: [],
            summary: {
              totalDurationMs: 10,
              totalCost: 0,
              successCount: 1,
              errorCount: 0,
              pendingCount: 0,
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
            },
          },
        },
      },
      { body: { snapshot: { input: { foo: "bar" }, output: { result: "ok" } }, lineage: [] } },
    ])

    const { result } = renderHook(() => useFlowV2Builder("flow-1"))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    await act(async () => {
      await result.current?.actions.refreshRun("run-200")
    })

    let snapshot
    await act(async () => {
      snapshot = await result.current?.actions.getNodeSnapshot("node-xyz", "run-200")
    })

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(snapshot?.snapshot?.output?.result).toBe("ok")
    expect(result.current?.flowState.nodeSnapshots["node-xyz"].snapshot.output.result).toBe("ok")
  })
})
