import { logger } from '@/lib/utils/logger'

export type WorkflowConnection = {
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

const hasCustomHandle = (handle?: string | null) =>
  Boolean(handle && handle !== 'source' && handle !== 'default')

export function filterConnectionsForNode(
  sourceNode: any,
  outgoingConnections: WorkflowConnection[],
  result: any
): WorkflowConnection[] {
  if (!sourceNode || outgoingConnections.length === 0) {
    return outgoingConnections
  }

  const nodeType = sourceNode?.data?.type
  if (!nodeType) {
    return outgoingConnections
  }

  if (nodeType === 'path') {
    const includesHandles = outgoingConnections.some(conn => hasCustomHandle(conn.sourceHandle))
    if (!includesHandles) {
      logger.debug(`🛤️ Path node ${sourceNode.id} using legacy routing (no handle metadata)`)
      return outgoingConnections
    }

    const pathTaken = result?.pathTaken ?? result?.data?.pathTaken ?? 'else'
    const matched = outgoingConnections.filter(conn => conn.sourceHandle === pathTaken)

    if (matched.length === 0) {
      logger.debug(`🛤️ Path node ${sourceNode.id} found no connections for handle "${pathTaken}"`)
    }

    return matched
  }

  if (nodeType === 'ai_router') {
    const includesHandles = outgoingConnections.some(conn => hasCustomHandle(conn.sourceHandle))

    let selectedPaths: string[] = []
    if (Array.isArray(result?.data?.selectedPaths) && result.data.selectedPaths.length > 0) {
      selectedPaths = result.data.selectedPaths.filter(Boolean)
    } else if (result?.data?.selectedPath) {
      selectedPaths = [result.data.selectedPath]
    } else if (result?.nextNodeId) {
      selectedPaths = [result.nextNodeId]
    }

    if (!includesHandles) {
      if (selectedPaths.length === 0) {
        return outgoingConnections
      }

      return outgoingConnections.filter(conn =>
        selectedPaths.includes(conn.target) ||
        (conn.sourceHandle && selectedPaths.includes(conn.sourceHandle))
      )
    }

    if (selectedPaths.length === 0) {
      logger.debug(`🤖 AI router node ${sourceNode.id} did not return selected paths; executing all handles`)
      return outgoingConnections
    }

    const selectedSet = new Set(selectedPaths)
    const matched = outgoingConnections.filter(conn => conn.sourceHandle && selectedSet.has(conn.sourceHandle))

    if (matched.length === 0) {
      logger.debug(`🤖 AI router node ${sourceNode.id} selected ${selectedPaths.join(', ')} but no matching connections found`)
    }

    return matched
  }

  if (result?.nextNodeId) {
    return outgoingConnections.filter(conn =>
      conn.target === result.nextNodeId ||
      conn.sourceHandle === result.nextNodeId
    )
  }

  return outgoingConnections
}
