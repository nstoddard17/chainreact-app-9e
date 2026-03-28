/**
 * Computes a human-readable diff between two workflow states.
 * Used to show users what changed when saving an active workflow.
 */

export interface WorkflowDiffItem {
  type: 'added' | 'removed' | 'modified'
  category: 'node' | 'edge' | 'config'
  description: string
}

export interface WorkflowDiff {
  hasChanges: boolean
  items: WorkflowDiffItem[]
  summary: string
}

interface SnapshotNode {
  id: string
  type?: string
  title?: string
  config?: Record<string, any>
}

interface SnapshotEdge {
  source: string
  target: string
}

interface WorkflowSnapshot {
  nodes: SnapshotNode[]
  edges: SnapshotEdge[]
}

/**
 * Normalizes workflow nodes from various formats into a consistent shape.
 */
function normalizeNodes(raw: any[]): SnapshotNode[] {
  return raw
    .filter((n) => {
      const t = n.data?.type || n.type || ''
      return t !== 'addAction' && t !== 'insertAction' && t !== 'chainPlaceholder'
    })
    .map((n) => ({
      id: n.id,
      type: n.data?.type || n.node_type || n.type || '',
      title: n.data?.title || n.data?.label || n.data?.type || n.node_type || n.id,
      config: n.data?.config || n.config || {},
    }))
}

/**
 * Normalizes workflow edges from various formats.
 */
function normalizeEdges(raw: any[]): SnapshotEdge[] {
  return raw.map((e) => ({
    source: e.source || e.source_node_id,
    target: e.target || e.target_node_id,
  }))
}

/**
 * Compares two config objects and returns a list of changed field names.
 */
function getConfigChanges(before: Record<string, any>, after: Record<string, any>): string[] {
  const changes: string[] = []
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])

  for (const key of allKeys) {
    if (key.startsWith('__') || key.startsWith('_label_') || key.startsWith('_cached')) continue

    const bVal = JSON.stringify(before[key] ?? null)
    const aVal = JSON.stringify(after[key] ?? null)
    if (bVal !== aVal) {
      changes.push(key)
    }
  }

  return changes
}

/**
 * Creates a snapshot from current workflow data (nodes + edges).
 * Store this in the database on activation.
 */
export function createWorkflowSnapshot(nodes: any[], edges: any[]): WorkflowSnapshot {
  return {
    nodes: normalizeNodes(nodes),
    edges: normalizeEdges(edges),
  }
}

/**
 * Computes the diff between a stored snapshot and the current workflow state.
 */
export function diffWorkflows(
  before: WorkflowSnapshot,
  afterNodes: any[],
  afterEdges: any[]
): WorkflowDiff {
  const items: WorkflowDiffItem[] = []
  const after: WorkflowSnapshot = {
    nodes: normalizeNodes(afterNodes),
    edges: normalizeEdges(afterEdges),
  }

  const beforeNodeMap = new Map(before.nodes.map((n) => [n.id, n]))
  const afterNodeMap = new Map(after.nodes.map((n) => [n.id, n]))

  // Detect added nodes
  for (const [id, node] of afterNodeMap) {
    if (!beforeNodeMap.has(id)) {
      items.push({
        type: 'added',
        category: 'node',
        description: `Added: ${node.title}`,
      })
    }
  }

  // Detect removed nodes
  for (const [id, node] of beforeNodeMap) {
    if (!afterNodeMap.has(id)) {
      items.push({
        type: 'removed',
        category: 'node',
        description: `Removed: ${node.title}`,
      })
    }
  }

  // Detect modified nodes (config changes)
  for (const [id, afterNode] of afterNodeMap) {
    const beforeNode = beforeNodeMap.get(id)
    if (!beforeNode) continue

    const configChanges = getConfigChanges(beforeNode.config ?? {}, afterNode.config ?? {})
    if (configChanges.length > 0) {
      items.push({
        type: 'modified',
        category: 'config',
        description: `${afterNode.title}: changed ${configChanges.join(', ')}`,
      })
    }
  }

  // Detect edge changes
  const beforeEdgeSet = new Set(before.edges.map((e) => `${e.source}→${e.target}`))
  const afterEdgeSet = new Set(after.edges.map((e) => `${e.source}→${e.target}`))

  for (const edgeKey of afterEdgeSet) {
    if (!beforeEdgeSet.has(edgeKey)) {
      items.push({
        type: 'added',
        category: 'edge',
        description: 'New connection added',
      })
    }
  }

  for (const edgeKey of beforeEdgeSet) {
    if (!afterEdgeSet.has(edgeKey)) {
      items.push({
        type: 'removed',
        category: 'edge',
        description: 'Connection removed',
      })
    }
  }

  // Generate summary
  const added = items.filter((i) => i.type === 'added').length
  const removed = items.filter((i) => i.type === 'removed').length
  const modified = items.filter((i) => i.type === 'modified').length

  const parts: string[] = []
  if (added > 0) parts.push(`${added} added`)
  if (removed > 0) parts.push(`${removed} removed`)
  if (modified > 0) parts.push(`${modified} modified`)

  return {
    hasChanges: items.length > 0,
    items,
    summary: parts.length > 0 ? parts.join(', ') : 'No changes',
  }
}
