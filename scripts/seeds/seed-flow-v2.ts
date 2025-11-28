import { randomUUID } from "crypto"

import { getServiceClient, getFlowRepository } from "@/src/lib/workflows/builder/api/helpers"
import { FlowSchema } from "@/src/lib/workflows/builder/schema"

async function main() {
  const client = await getServiceClient()
  const repository = await getFlowRepository(client)

  const flowId = randomUUID()
  const name = "Sample Flow v2"

  await client.from("workflows").insert({
    id: flowId,
    name,
    status: 'draft',
    nodes: [],
    connections: [],
  })

  const flow = FlowSchema.parse({
    id: flowId,
    name,
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
        metadata: { position: { x: 0, y: 0 } },
      },
      {
        id: "ai-1",
        type: "ai.generate",
        label: "Summarize",
        config: {
          model: "gpt-4o-mini",
          system: "Return concise JSON",
          user: '{"summary":"{{upstream.payload.title}}","details":"{{upstream.payload.body}}"}',
        },
        inPorts: [],
        outPorts: [],
        io: { inputSchema: undefined, outputSchema: undefined },
        policy: { timeoutMs: 60000, retries: 1 },
        costHint: 1,
        metadata: { position: { x: 280, y: 0 } },
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
        metadata: { position: { x: 560, y: 0 } },
      },
      {
        id: "notify-1",
        type: "notify.dispatch",
        label: "Notify",
        config: {
          text: "{{upstream.payload.summary}}",
          webhookUrl: "https://hooks.slack.com/services/REPLACE_ME",
        },
        inPorts: [],
        outPorts: [],
        io: { inputSchema: undefined, outputSchema: undefined },
        policy: { timeoutMs: 60000, retries: 0 },
        costHint: 1,
        metadata: { position: { x: 840, y: 0 } },
      },
    ],
    edges: [
      { id: "edge-1", from: { nodeId: "trigger-1" }, to: { nodeId: "ai-1" }, mappings: [] },
      { id: "edge-2", from: { nodeId: "ai-1" }, to: { nodeId: "mapper-1" }, mappings: [] },
      { id: "edge-3", from: { nodeId: "mapper-1" }, to: { nodeId: "notify-1" }, mappings: [] },
    ],
    trigger: { type: "manual", nodeId: "trigger-1", enabled: true },
    interface: { inputs: [], outputs: [] },
  })

  const revision = await repository.createRevision({ flowId, flow, version: 1 })

  console.log(JSON.stringify({ ok: true, flowId, revisionId: revision.id }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
