import { executeRun } from "@/src/lib/workflows/builder/runner/execute"
import { registerNodeDefinition, clearNodeRunners } from "@/src/lib/workflows/builder/runner/registry"
import type { Flow, NodeRunSnapshot } from "@/src/lib/workflows/builder/schema"
import type { RunStore, NodeRunSnapshotWithId, StoredRun } from "@/src/lib/workflows/builder/runner/execute"
import { z } from "zod"
import type { NodeDefinition } from "@/src/lib/workflows/builder/nodes/types"

describe("workflow runner", () => {
  beforeEach(() => {
    clearNodeRunners()
  })

  test("executes simple trigger → mapper flow", async () => {
    const store = new InMemoryRunStore()

    const triggerNode: NodeDefinition = {
      type: "http.trigger",
      title: "Trigger",
      description: "",
      configSchema: z.object({}),
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({ payload: z.any() }),
      costHint: 0,
      async run({ input }) {
        return { output: { payload: input.payload ?? input } }
      },
    }

    const mapperNode: NodeDefinition = {
      type: "mapper.node",
      title: "Mapper",
      description: "",
      configSchema: z.object({}),
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({}).passthrough(),
      costHint: 0,
      async run({ input }) {
        return { output: input }
      },
    }

    registerNodeDefinition(triggerNode)
    registerNodeDefinition(mapperNode)

    const flow: Flow = {
      id: "flow-1",
      name: "Test Flow",
      version: 1,
      nodes: [
        {
          id: "trigger",
          type: "http.trigger",
          label: "Trigger",
          config: {},
          inPorts: [],
          outPorts: [],
          io: { inputSchema: {}, outputSchema: {} },
          policy: { timeoutMs: 1000, retries: 0 },
          costHint: 0,
        },
        {
          id: "mapper",
          type: "mapper.node",
          label: "Mapper",
          config: {},
          inPorts: [],
          outPorts: [],
          io: { inputSchema: {}, outputSchema: {} },
          policy: { timeoutMs: 1000, retries: 0 },
          costHint: 0,
        },
      ],
      edges: [
        {
          id: "edge-1",
          from: { nodeId: "trigger" },
          to: { nodeId: "mapper" },
          mappings: [
            {
              id: "m1",
              to: "payload.text",
              expr: "upstream.payload",
              required: true,
            },
          ],
        },
      ],
      trigger: { type: "manual", nodeId: "trigger", enabled: true },
      interface: { inputs: [], outputs: [] },
      globals: {},
    }

    await executeRun({
      flow,
      revisionId: "rev-1",
      runId: "run-1",
      inputs: { payload: "hello" },
      globals: {},
      store,
    })

    const storedRun = store.runs.get("run-1")
    expect(storedRun?.status).toBe("success")

    const triggerSnapshot = store.getSnapshot("run-1", "trigger")
    const mapperSnapshot = store.getSnapshot("run-1", "mapper")

    expect(triggerSnapshot?.status).toBe("success")
    expect(triggerSnapshot?.output).toEqual({ payload: "hello" })

    expect(mapperSnapshot?.status).toBe("success")
    expect(mapperSnapshot?.input).toEqual({ payload: { text: "hello" } })
    expect(mapperSnapshot?.output).toEqual({ payload: { text: "hello" } })

    expect(store.lineage).toHaveLength(1)
    expect(store.lineage[0]).toMatchObject({
      edgeId: "edge-1",
      targetPath: "payload.text",
      fromNodeId: "trigger",
      toNodeId: "mapper",
    })
  })
})

class InMemoryRunStore implements RunStore {
  runs = new Map<string, { status: string; flowId: string; revisionId: string; inputs: any; globals: Record<string, any> }>()
  snapshots = new Map<string, Map<string, NodeRunSnapshot>>()
  lineage: Array<Record<string, any>> = []

  async beginRun({ runId, flow, revisionId, inputs, globals }: Parameters<RunStore["beginRun"]>[0]) {
    this.runs.set(runId, {
      status: "running",
      flowId: flow.id,
      revisionId,
      inputs,
      globals,
    })
  }

  async completeRun({ runId }: Parameters<RunStore["completeRun"]>[0]) {
    const run = this.runs.get(runId)
    if (run) {
      run.status = "success"
    }
  }

  async failRun({ runId, error }: Parameters<RunStore["failRun"]>[0]) {
    const run = this.runs.get(runId)
    if (run) {
      run.status = "error"
      Object.assign(run, { error })
    }
  }

  async recordNodeSnapshot({ runId, nodeId, snapshot }: Parameters<RunStore["recordNodeSnapshot"]>[0]) {
    if (!this.snapshots.has(runId)) {
      this.snapshots.set(runId, new Map())
    }
    this.snapshots.get(runId)!.set(nodeId, snapshot)
  }

  async recordLineage(records: Parameters<RunStore["recordLineage"]>[0]) {
    this.lineage.push(...records)
  }

  async loadRun(runId: string): Promise<StoredRun | null> {
    const run = this.runs.get(runId)
    if (!run) {
      return null
    }

    const nodeSnapshots: NodeRunSnapshotWithId[] = []
    const nodeMap = this.snapshots.get(runId)
    if (nodeMap) {
      nodeMap.forEach((snapshot, nodeId) => {
        nodeSnapshots.push({ ...snapshot, nodeId })
      })
    }

    return {
      runId,
      flowId: run.flowId,
      revisionId: run.revisionId,
      inputs: run.inputs,
      globals: run.globals,
      nodeSnapshots,
    }
  }

  getSnapshot(runId: string, nodeId: string): NodeRunSnapshot | undefined {
    return this.snapshots.get(runId)?.get(nodeId)
  }
}
