import { NextResponse } from "next/server"

import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { getServiceClient, getFlowRepository, uuid } from "@/src/lib/workflows/builder/api/helpers"

export async function GET() {
  const serviceClient = await getServiceClient()
  const repository = await getFlowRepository(serviceClient)

  const flowId = uuid()
  const definitionName = "Blank Flow"

  // Note: nodes and edges are stored in workflow_nodes and workflow_edges tables
  const { error } = await serviceClient
    .from("workflows")
    .insert({
      id: flowId,
      name: definitionName,
      status: 'draft',
    })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const flow = FlowSchema.parse({
    id: flowId,
    name: definitionName,
    version: 1,
    nodes: [],
    edges: [],
    trigger: { type: "manual", enabled: true },
    interface: { inputs: [], outputs: [] },
  })

  const revision = await repository.createRevision({ flowId, flow, version: 1 })

  return NextResponse.json({ ok: true, flowId, revisionId: revision.id })
}
