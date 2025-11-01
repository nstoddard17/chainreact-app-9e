import type { Flow, Node } from "../schema"

export class CycleError extends Error {
  constructor(message = "Flow contains cyclic dependencies") {
    super(message)
    this.name = "CycleError"
  }
}

export function topologicalPlan(flow: Flow): Array<Array<Node>> {
  const stages: Array<Array<Node>> = []
  const nodesById = new Map(flow.nodes.map((node) => [node.id, node]))

  const incoming = new Map<string, number>()
  const adjacency = new Map<string, Set<string>>()

  flow.nodes.forEach((node) => {
    incoming.set(node.id, 0)
    adjacency.set(node.id, new Set())
  })

  flow.edges.forEach((edge) => {
    const fromId = edge.from.nodeId
    const toId = edge.to.nodeId
    if (!nodesById.has(fromId) || !nodesById.has(toId)) {
      return
    }
    adjacency.get(fromId)?.add(toId)
    incoming.set(toId, (incoming.get(toId) ?? 0) + 1)
  })

  const ready: string[] = []
  incoming.forEach((count, nodeId) => {
    if (count === 0) {
      ready.push(nodeId)
    }
  })

  const processed = new Set<string>()

  while (ready.length > 0) {
    const stageIds = [...ready]
    ready.length = 0

    const stageNodes: Node[] = []
    for (const nodeId of stageIds) {
      if (processed.has(nodeId)) {
        continue
      }
      const node = nodesById.get(nodeId)
      if (!node) {
        continue
      }
      stageNodes.push(node)
      processed.add(nodeId)

      const neighbors = adjacency.get(nodeId)
      if (!neighbors) {
        continue
      }

      neighbors.forEach((neighborId) => {
        const inCount = (incoming.get(neighborId) ?? 0) - 1
        incoming.set(neighborId, inCount)
        if (inCount === 0) {
          ready.push(neighborId)
        }
      })
    }

    if (stageNodes.length > 0) {
      stages.push(stageNodes)
    }
  }

  if (processed.size !== flow.nodes.length) {
    throw new CycleError()
  }

  return stages
}
