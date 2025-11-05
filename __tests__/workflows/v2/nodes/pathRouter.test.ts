import { executePath } from '@/lib/workflows/actions/logic/executePath'
import { filterConnectionsForNode } from '@/lib/services/utils/connectionRouting'

describe('Path Router execution', () => {
  const baseContext = {
    previousOutputs: {
      trigger: {
        amount: 0,
        status: 'new',
        priority: 'normal'
      }
    }
  }

  it('selects the first matching path', async () => {
    const config = {
      paths: [
        {
          id: 'high_value',
          name: 'High Value',
          logicOperator: 'and' as const,
          conditions: [
            {
              id: 'amount_check',
              field: 'trigger.amount',
              operator: 'greater_than',
              value: '100'
            }
          ]
        },
        {
          id: 'vip',
          name: 'VIP Customer',
          logicOperator: 'and' as const,
          conditions: [
            {
              id: 'priority_check',
              field: 'trigger.priority',
              operator: 'equals',
              value: 'vip'
            }
          ]
        }
      ]
    }

    const result = await executePath({
      config,
      previousOutputs: {
        ...baseContext.previousOutputs,
        trigger: {
          ...baseContext.previousOutputs.trigger,
          amount: 250,
          priority: 'normal'
        }
      }
    })

    expect(result.success).toBe(true)
    expect(result.pathTaken).toBe('high_value')
    expect(result.data?.pathTaken).toBe('high_value')
  })

  it('falls back to else when no path matches', async () => {
    const config = {
      paths: [
        {
          id: 'high_value',
          name: 'High Value',
          logicOperator: 'and' as const,
          conditions: [
            {
              id: 'amount_check',
              field: 'trigger.amount',
              operator: 'greater_than',
              value: '100'
            }
          ]
        }
      ]
    }

    const result = await executePath({
      config,
      previousOutputs: {
        ...baseContext.previousOutputs,
        trigger: {
          ...baseContext.previousOutputs.trigger,
          amount: 25
        }
      }
    })

    expect(result.success).toBe(true)
    expect(result.pathTaken).toBe('else')
    expect(result.data?.conditionsMet).toBe(false)
  })
})

describe('filterConnectionsForNode', () => {
  const pathNode = {
    id: 'node-1',
    data: {
      type: 'path'
    }
  }

  it('filters connections by selected path handle', () => {
    const connections = [
      { source: 'node-1', target: 'node-2', sourceHandle: 'path_a' },
      { source: 'node-1', target: 'node-3', sourceHandle: 'path_b' },
      { source: 'node-1', target: 'node-4', sourceHandle: 'else' }
    ]

    const routed = filterConnectionsForNode(pathNode, connections as any, {
      pathTaken: 'path_b'
    })

    expect(routed).toHaveLength(1)
    expect(routed[0]?.target).toBe('node-3')
  })

  it('falls back to else branch when specified', () => {
    const connections = [
      { source: 'node-1', target: 'node-2', sourceHandle: 'path_a' },
      { source: 'node-1', target: 'node-4', sourceHandle: 'else' }
    ]

    const routed = filterConnectionsForNode(pathNode, connections as any, {
      pathTaken: 'else'
    })

    expect(routed).toHaveLength(1)
    expect(routed[0]?.sourceHandle).toBe('else')
  })

  it('returns all connections for legacy path nodes without handle metadata', () => {
    const connections = [
      { source: 'node-1', target: 'node-2' },
      { source: 'node-1', target: 'node-3' }
    ]

    const routed = filterConnectionsForNode(pathNode, connections as any, {
      pathTaken: 'path_a'
    })

    expect(routed).toHaveLength(2)
  })

  it('supports AI router selections', () => {
    const aiRouterNode = {
      id: 'ai-node',
      data: { type: 'ai_router' }
    }

    const connections = [
      { source: 'ai-node', target: 'node-a', sourceHandle: 'billing' },
      { source: 'ai-node', target: 'node-b', sourceHandle: 'support' },
      { source: 'ai-node', target: 'node-c', sourceHandle: 'general' }
    ]

    const routed = filterConnectionsForNode(aiRouterNode, connections as any, {
      data: {
        selectedPaths: ['support', 'general']
      }
    })

    expect(routed).toHaveLength(2)
    expect(routed.map(conn => conn.sourceHandle)).toEqual(['support', 'general'])
  })
})
