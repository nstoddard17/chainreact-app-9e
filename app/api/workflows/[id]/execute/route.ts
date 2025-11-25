import crypto from "crypto"
import { NextResponse } from "next/server"

import { errorResponse, jsonResponse } from "@/lib/utils/api-response"
import { ensureNodeRegistry, createRunStore, getFlowRepository, uuid } from "@/src/lib/workflows/builder/api/helpers"
import { getLatestPublishedRevision } from "@/src/lib/workflows/builder/publish"
import { FlowSchema, type Flow, type JsonValue } from "@/src/lib/workflows/builder/schema"
import { executeRun } from "@/src/lib/workflows/builder/runner/execute"
import { createSupabaseServiceClient } from "@/utils/supabase/server"

const REQUIRED_SCOPE = "workflows:execute"

function extractBearer(request: Request) {
  const header = request.headers.get("authorization") || request.headers.get("Authorization")
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return null
  }
  return header.slice(7).trim()
}

function hashKey(rawKey: string) {
  return crypto.createHash("sha256").update(rawKey).digest("hex")
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() < Date.now()
}

function pickAllowedInputs(flow: Flow, provided: any) {
  const iface = flow.interface
  if (!iface || !iface.inputs || iface.inputs.length === 0) {
    return { filtered: provided || {}, missing: [] }
  }

  const providedObject = provided && typeof provided === "object" && !Array.isArray(provided) ? provided : {}
  const filtered: Record<string, JsonValue> = {}
  const missing: string[] = []

  for (const field of iface.inputs) {
    const value = (providedObject as any)[field.key]
    if (value === undefined) {
      if (field.required) {
        missing.push(field.key)
      }
      continue
    }
    filtered[field.key] = value as JsonValue
  }

  return { filtered, missing }
}

function getTerminalNodeIds(flow: Flow) {
  const downstream = new Set(flow.edges.map((edge) => edge.from.nodeId))
  const targets = new Set(flow.edges.map((edge) => edge.to.nodeId))
  const terminals = flow.nodes
    .map((node) => node.id)
    .filter((id) => !downstream.has(id) || !targets.has(id))
  return terminals.length > 0 ? terminals : flow.nodes.map((node) => node.id)
}

function getPathValue(obj: any, path?: string) {
  if (!path) return obj
  return path.split(".").reduce((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as any)[key]
    }
    return undefined
  }, obj)
}

function shapeOutputs(flow: Flow, nodeOutputs: Record<string, any>) {
  const iface = flow.interface
  const terminalIds = getTerminalNodeIds(flow)

  if (!iface?.outputs || iface.outputs.length === 0) {
    const fallback: Record<string, any> = {}
    terminalIds.forEach((id) => {
      if (nodeOutputs[id] !== undefined) {
        fallback[id] = nodeOutputs[id]
      }
    })
    return { outputs: fallback }
  }

  const shaped: Record<string, any> = {}
  iface.outputs.forEach((field) => {
    const metadata = (field as any).metadata || {}
    const sourceNodeId: string | undefined = metadata.nodeId || (terminalIds.length === 1 ? terminalIds[0] : undefined)
    const rawOutput = sourceNodeId ? nodeOutputs[sourceNodeId] : undefined
    if (rawOutput === undefined) {
      return
    }
    const value = getPathValue(rawOutput, metadata.path)
    shaped[field.key] = value ?? null
  })

  return { outputs: shaped }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServiceClient()
  const { id: workflowId } = await params

  const rawKey = extractBearer(request)
  if (!rawKey) {
    return errorResponse("Missing Bearer API key", 401)
  }

  const keyHash = hashKey(rawKey)
  const { data: apiKey, error: apiKeyError } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .maybeSingle()

  if (apiKeyError || !apiKey) {
    return errorResponse("Invalid API key", 401)
  }

  if (isExpired(apiKey.expires_at)) {
    return errorResponse("API key expired", 401)
  }

  if (Array.isArray(apiKey.scopes) && !apiKey.scopes.includes(REQUIRED_SCOPE)) {
    return errorResponse("Insufficient permissions for workflow execution", 403)
  }

  // Update last used timestamp (non-blocking)
  supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id).catch(() => {})

  // Ensure a published revision exists
  const publishedRevisionId = await getLatestPublishedRevision(workflowId, supabase)
  if (!publishedRevisionId) {
    return errorResponse("Publish this workflow before running it via API", 409)
  }

  // Ownership check
  const { data: workflowRow } = await supabase
    .from("workflows")
    .select("created_by")
    .eq("id", workflowId)
    .maybeSingle()

  if (!workflowRow) {
    return errorResponse("Workflow not found", 404)
  }

  if (workflowRow.created_by && workflowRow.created_by !== apiKey.user_id) {
    return errorResponse("You do not have access to this workflow", 403)
  }

  const repository = await getFlowRepository(supabase)
  const revision = await repository.loadRevisionById(publishedRevisionId)
  if (!revision || revision.flowId !== workflowId) {
    return errorResponse("Workflow revision not found", 404)
  }

  const flow = FlowSchema.parse(revision.graph)
  await ensureNodeRegistry()

  // Parse and validate payload
  let body: any = {}
  try {
    body = await request.json()
  } catch (_error) {
    return errorResponse("Invalid JSON body", 400)
  }

  const { filtered: inputs, missing } = pickAllowedInputs(flow, body?.inputs ?? body)
  if (missing.length > 0) {
    return errorResponse("Missing required inputs", 400, { missing })
  }

  const runId = uuid()
  const store = createRunStore(supabase)

  try {
    await executeRun({
      flow,
      revisionId: revision.id,
      runId,
      inputs,
      globals: flow.globals ?? {},
      store,
    })
  } catch (error: any) {
    console.error("[Run via API] Execution failed", error)
    return errorResponse(error?.message || "Workflow execution failed", 500)
  }

  // Collect outputs from terminal nodes
  const { data: nodeRows } = await supabase
    .from("workflow_node_executions")
    .select("node_id, output_data")
    .eq("execution_id", runId)

  const nodeOutputs = Object.fromEntries((nodeRows ?? []).map((row) => [row.node_id, row.output_data]))
  const shaped = shapeOutputs(flow, nodeOutputs)

  return jsonResponse({
    ok: true,
    workflowId,
    revisionId: revision.id,
    runId,
    inputs,
    ...shaped,
  })
}
