import { randomUUID } from "crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

export interface NodeLogPayload {
  runId: string
  nodeId: string
  status: string
  latencyMs?: number | null
  cost?: number | null
  retries?: number | null
}

export function createNodeLogger(client: SupabaseClient<any>) {
  return async function recordNodeLog(entry: NodeLogPayload) {
    await client.from("flow_v2_node_logs").insert({
      id: randomUUID(),
      run_id: entry.runId,
      node_id: entry.nodeId,
      status: entry.status,
      latency_ms: entry.latencyMs ?? null,
      cost: entry.cost ?? null,
      retries: entry.retries ?? null,
    })
  }
}
