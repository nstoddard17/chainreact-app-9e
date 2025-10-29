import fetchMock from "jest-fetch-mock"

jest.mock("@/utils/supabase/server", () => ({
  createSupabaseServiceClient: jest.fn(async () => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      upsert: async () => ({ data: null, error: null }),
      insert: async () => ({ data: null, error: null }),
    }
    return {
      from: () => chain,
    }
  }),
}))

import { executeRun } from "@/src/lib/workflows/builder/runner/execute"
import { clearNodeRunners, registerNodeDefinition } from "@/src/lib/workflows/builder/runner/registry"
import { FlowSchema, type Flow, type LineageRecord, type NodeRunSnapshot } from "@/src/lib/workflows/builder/schema"
import type { RunStore, NodeRunSnapshotWithId, StoredRun } from "@/src/lib/workflows/builder/runner/execute"
import type { NodeDefinition } from "@/src/lib/workflows/builder/nodes/types"
import { z } from "zod"

class InMemoryRunStore implements RunStore {
  runs = new Map<string, { status: string; flowId: string; revisionId: string; inputs: any; globals: Record<string, any> }>()
  snapshots = new Map<string, Map<string, NodeRunSnapshot>>()
  lineage: LineageRecord[] = []

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

  async loadRun(_: string): Promise<StoredRun | null> {
    return null
  }

  getSnapshot(runId: string, nodeId: string) {
    return this.snapshots.get(runId)?.get(nodeId)
  }
}

process.env.FLOW_V2_SECRET_SLACK_WEBHOOK = "https://hooks.slack.com/services/test"

const sampleFlow: Flow = FlowSchema.parse({
  id: "flow-integration",
  name: "Sample Flow",
  version: 1,
  nodes: [
    {
      id: "trigger-1",
      type: "http.trigger",
      label: "HTTP Trigger",
      config: {},
      inPorts: [],
      outPorts: [],
      io: { inputSchema: undefined, outputSchema: undefined },
      policy: { timeoutMs: 60000, retries: 0 },
      costHint: 0,
      metadata: {},
    },
    {
      id: "ai-1",
      type: "ai.generate",
      label: "Summarize",
      config: {
        model: "gpt-4o-mini",
        system: "Return JSON",
        user: '{"summary":"{{inputs.payload.title}}","details":"{{inputs.payload.body}}"}',
      },
      inPorts: [],
      outPorts: [],
      io: { inputSchema: undefined, outputSchema: undefined },
      policy: { timeoutMs: 60000, retries: 0 },
      costHint: 1,
      metadata: {},
    },
    {
      id: "mapper-1",
      type: "mapper.node",
      label: "Mapper",
      config: {},
      inPorts: [],
      outPorts: [],
      io: { inputSchema: undefined, outputSchema: undefined },
      policy: { timeoutMs: 60000, retries: 0 },
      costHint: 0,
      metadata: {},
    },
    {
      id: "notify-1",
      type: "notify.dispatch",
      label: "Notify",
      config: {
        text: "{{upstream.payload.summary}}",
        webhookUrl: "{{secret:SLACK_WEBHOOK}}",
      },
      inPorts: [],
      outPorts: [],
      io: { inputSchema: undefined, outputSchema: undefined },
      policy: { timeoutMs: 60000, retries: 0 },
      costHint: 1,
      metadata: {},
    },
  ],
  edges: [
    {
      id: "edge-1",
      from: { nodeId: "trigger-1" },
      to: { nodeId: "ai-1" },
      mappings: [
        { id: "map-1", target: "payload", expr: "upstream.payload", required: true },
      ],
    },
    {
      id: "edge-2",
      from: { nodeId: "ai-1" },
      to: { nodeId: "mapper-1" },
      mappings: [
        { id: "map-2", target: "payload", expr: "upstream.json", required: true },
      ],
    },
    {
      id: "edge-3",
      from: { nodeId: "mapper-1" },
      to: { nodeId: "notify-1" },
      mappings: [
        { id: "map-3", target: "payload.summary", expr: "upstream.payload.summary", required: true },
      ],
    },
  ],
  trigger: { type: "manual", nodeId: "trigger-1", enabled: true },
  interface: { inputs: [], outputs: [] },
})

beforeAll(() => {
  fetchMock.enableMocks()
})

beforeEach(() => {
  fetchMock.resetMocks()
  clearNodeRunners()

  const triggerNode: NodeDefinition = {
    type: "http.trigger",
    title: "HTTP Trigger",
    description: "",
    configSchema: z.object({}),
    inputSchema: z.object({ payload: z.any() }).passthrough(),
    outputSchema: z.object({ payload: z.any() }),
    costHint: 0,
    async run({ input }) {
      return { output: { payload: input.payload ?? input } }
    },
  }

  const aiNode: NodeDefinition = {
    type: "ai.generate",
    title: "AI Generate",
    description: "",
    configSchema: z.object({
      model: z.string(),
      system: z.string().optional(),
      user: z.string(),
    }),
    inputSchema: z.object({ payload: z.any() }).passthrough(),
    outputSchema: z.object({ json: z.any() }),
    costHint: 1,
    async run({ input }) {
      const output = {
        json: {
          summary: input.payload?.title,
          details: input.payload?.body,
        },
      }
      return { output }
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
      return { output: JSON.parse(JSON.stringify(input)) }
    },
  }

  const notifyNode: NodeDefinition = {
    type: "notify.dispatch",
    title: "Notify",
    description: "",
    configSchema: z.object({
      text: z.string().optional(),
      webhookUrl: z.string().optional(),
    }),
    inputSchema: z.object({ payload: z.any() }).passthrough(),
    outputSchema: z.object({ ok: z.boolean() }),
    costHint: 1,
    async run({ config }) {
      if (config.webhookUrl) {
        await fetch(config.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: config.text ?? "" }),
        })
      }
      return { output: { ok: true } }
    },
  }

  registerNodeDefinition(triggerNode)
  registerNodeDefinition(aiNode)
  registerNodeDefinition(mapperNode)
  registerNodeDefinition(notifyNode)
})

describe("Flow v2 integration", () => {
  test("runs sample flow and captures lineage", async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ ok: true }))

    const store = new InMemoryRunStore()

    await executeRun({
      flow: sampleFlow,
      revisionId: "rev-1",
      runId: "run-1",
      inputs: { payload: { title: "Hello", body: "World" } },
      globals: {},
      store,
    })

    const notifySnapshot = store.getSnapshot("run-1", "notify-1")
    expect(notifySnapshot?.status).toBe("success")
    expect(notifySnapshot?.output).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith("https://hooks.slack.com/services/test", expect.any(Object))

    expect(store.lineage.some((row) => row.targetPath === "payload.summary" && row.fromNodeId === "mapper-1")).toBe(true)
  })
})
