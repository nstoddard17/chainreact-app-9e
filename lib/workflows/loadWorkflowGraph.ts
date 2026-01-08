import { SupabaseClient } from "@supabase/supabase-js"

export interface WorkflowNode {
  id: string
  workflow_id: string
  user_id: string | null
  node_type: string
  label: string | null
  description: string | null
  config: Record<string, any>
  position_x: number
  position_y: number
  is_trigger: boolean
  provider_id: string | null
  display_order: number
  in_ports: any[]
  out_ports: any[]
  io_schema: Record<string, any> | null
  policy: Record<string, any>
  cost_hint: number
  metadata: Record<string, any> | null
  created_at: string
  updated_at: string
}

export interface WorkflowEdge {
  id: string
  workflow_id: string
  user_id: string | null
  source_node_id: string
  target_node_id: string
  source_port_id: string
  target_port_id: string
  condition_expr: string | null
  mappings: any[]
  metadata: Record<string, any> | null
  created_at: string
  updated_at: string
}

export interface WorkflowWithGraph {
  id: string
  name: string
  description: string | null
  status: string
  user_id: string
  workspace_id: string | null
  created_at: string
  updated_at: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  [key: string]: any // Allow other workflow fields
}

/**
 * Load a workflow with its nodes and edges from normalized tables.
 * This is the single source of truth for workflow graph data.
 */
export async function loadWorkflowGraph(
  supabase: SupabaseClient,
  workflowId: string
): Promise<WorkflowWithGraph | null> {
  const [workflowResult, nodesResult, edgesResult] = await Promise.all([
    supabase.from("workflows").select("*").eq("id", workflowId).single(),
    supabase.from("workflow_nodes").select("*").eq("workflow_id", workflowId).order("display_order"),
    supabase.from("workflow_edges").select("*").eq("workflow_id", workflowId),
  ])

  if (workflowResult.error || !workflowResult.data) {
    return null
  }

  return {
    ...workflowResult.data,
    nodes: nodesResult.data || [],
    edges: edgesResult.data || [],
  }
}

/**
 * Load just the nodes for a workflow from the normalized table.
 */
export async function loadWorkflowNodes(
  supabase: SupabaseClient,
  workflowId: string
): Promise<WorkflowNode[]> {
  const { data, error } = await supabase
    .from("workflow_nodes")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("display_order")

  if (error) {
    console.error("[loadWorkflowNodes] Error:", error.message)
    return []
  }

  return data || []
}

/**
 * Load just the edges for a workflow from the normalized table.
 */
export async function loadWorkflowEdges(
  supabase: SupabaseClient,
  workflowId: string
): Promise<WorkflowEdge[]> {
  const { data, error } = await supabase
    .from("workflow_edges")
    .select("*")
    .eq("workflow_id", workflowId)

  if (error) {
    console.error("[loadWorkflowEdges] Error:", error.message)
    return []
  }

  return data || []
}

/**
 * Convert normalized WorkflowNode to the legacy node format used by execution engine.
 * This provides backward compatibility during the transition.
 */
export function nodeToLegacyFormat(node: WorkflowNode): any {
  return {
    id: node.id,
    type: node.node_type,
    data: {
      type: node.node_type,
      label: node.label || node.node_type,
      config: node.config || {},
      isTrigger: node.is_trigger,
      providerId: node.provider_id,
    },
    position: {
      x: node.position_x,
      y: node.position_y,
    },
  }
}

/**
 * Convert normalized WorkflowEdge to the legacy connection format.
 */
export function edgeToLegacyFormat(edge: WorkflowEdge): any {
  return {
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    sourceHandle: edge.source_port_id || "source",
    targetHandle: edge.target_port_id || "target",
  }
}

/**
 * Convert all nodes and edges to legacy format for execution engine compatibility.
 */
export function graphToLegacyFormat(nodes: WorkflowNode[], edges: WorkflowEdge[]): {
  nodes: any[]
  connections: any[]
} {
  return {
    nodes: nodes.map(nodeToLegacyFormat),
    connections: edges.map(edgeToLegacyFormat),
  }
}

/**
 * Update a single node's config in the normalized table.
 */
export async function updateNodeConfig(
  supabase: SupabaseClient,
  nodeId: string,
  workflowId: string,
  config: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("workflow_nodes")
    .update({
      config,
      updated_at: new Date().toISOString()
    })
    .eq("id", nodeId)
    .eq("workflow_id", workflowId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Get a specific node by ID from the normalized table.
 */
export async function getNodeById(
  supabase: SupabaseClient,
  nodeId: string,
  workflowId: string
): Promise<WorkflowNode | null> {
  const { data, error } = await supabase
    .from("workflow_nodes")
    .select("*")
    .eq("id", nodeId)
    .eq("workflow_id", workflowId)
    .single()

  if (error || !data) {
    return null
  }

  return data
}
