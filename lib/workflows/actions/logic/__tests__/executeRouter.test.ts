import { executeRouter } from '../executeRouter'
import type { ConditionalPath } from '@/components/workflows/configuration/fields/CriteriaBuilder'

describe('executeRouter', () => {
  describe('Filter Mode', () => {
    const createFilterConfig = (conditions: ConditionalPath[], stopMessage?: string) => ({
      mode: 'filter' as const,
      conditions,
      stopMessage,
    })

    it('should pass when simple condition is met', async () => {
      const config = createFilterConfig([
        {
          id: 'path-1',
          name: 'Path A',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.emailNode.subject',
              operator: 'contains',
              value: 'urgent',
            },
          ],
          logicOperator: 'and',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            subject: 'URGENT: System Alert',
            from: 'admin@example.com',
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.filterPassed).toBe(true)
      expect(result.data?.mode).toBe('filter')
      expect(result.data?.conditionsMet).toBe(true)
      expect(result.data?.pathTaken).toBe('continue')
    })

    it('should stop workflow when condition fails', async () => {
      const config = createFilterConfig(
        [
          {
            id: 'path-1',
            name: 'Path A',
            conditions: [
              {
                id: 'cond-1',
                field: 'nodeOutputs.emailNode.subject',
                operator: 'contains',
                value: 'urgent',
              },
            ],
            logicOperator: 'and',
          },
        ],
        'Email is not urgent'
      )

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            subject: 'Regular Update',
            from: 'admin@example.com',
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(false)
      expect(result.filterPassed).toBe(false)
      expect(result.stopWorkflow).toBe(true)
      expect(result.reason).toBe('Email is not urgent')
      expect(result.data?.mode).toBe('filter')
      expect(result.data?.conditionsMet).toBe(false)
      expect(result.data?.pathTaken).toBe('stopped')
    })

    it('should pass when ALL conditions are met with AND logic', async () => {
      const config = createFilterConfig([
        {
          id: 'path-1',
          name: 'Path A',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.emailNode.subject',
              operator: 'contains',
              value: 'urgent',
            },
            {
              id: 'cond-2',
              field: 'nodeOutputs.emailNode.priority',
              operator: 'greater_than',
              value: '5',
            },
          ],
          logicOperator: 'and',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            subject: 'URGENT: System Alert',
            priority: 8,
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.filterPassed).toBe(true)
    })

    it('should fail when ANY condition fails with AND logic', async () => {
      const config = createFilterConfig([
        {
          id: 'path-1',
          name: 'Path A',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.emailNode.subject',
              operator: 'contains',
              value: 'urgent',
            },
            {
              id: 'cond-2',
              field: 'nodeOutputs.emailNode.priority',
              operator: 'greater_than',
              value: '5',
            },
          ],
          logicOperator: 'and',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            subject: 'Regular Update',
            priority: 8,
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(false)
      expect(result.filterPassed).toBe(false)
      expect(result.stopWorkflow).toBe(true)
    })

    it('should pass when ANY condition is met with OR logic', async () => {
      const config = createFilterConfig([
        {
          id: 'path-1',
          name: 'Path A',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.emailNode.subject',
              operator: 'contains',
              value: 'urgent',
            },
            {
              id: 'cond-2',
              field: 'nodeOutputs.emailNode.priority',
              operator: 'greater_than',
              value: '5',
            },
          ],
          logicOperator: 'or',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            subject: 'Regular Update',
            priority: 8,
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.filterPassed).toBe(true)
    })

    it('should use default stop message when none provided', async () => {
      const config = createFilterConfig([
        {
          id: 'path-1',
          name: 'Path A',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.emailNode.subject',
              operator: 'equals',
              value: 'test',
            },
          ],
          logicOperator: 'and',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            subject: 'different',
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Filter conditions not met')
    })

    it('should handle is_empty operator', async () => {
      const config = createFilterConfig([
        {
          id: 'path-1',
          name: 'Path A',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.emailNode.cc',
              operator: 'is_empty',
              value: '',
            },
          ],
          logicOperator: 'and',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            subject: 'Test',
            cc: '',
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.filterPassed).toBe(true)
    })

    it('should handle is_not_empty operator', async () => {
      const config = createFilterConfig([
        {
          id: 'path-1',
          name: 'Path A',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.emailNode.body',
              operator: 'is_not_empty',
              value: '',
            },
          ],
          logicOperator: 'and',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            subject: 'Test',
            body: 'This is the email body',
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.filterPassed).toBe(true)
    })
  })

  describe('Router Mode', () => {
    const createRouterConfig = (conditions: ConditionalPath[]) => ({
      mode: 'router' as const,
      conditions,
    })

    it('should route to first matching path', async () => {
      const config = createRouterConfig([
        {
          id: 'path-1',
          name: 'High Priority',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.emailNode.priority',
              operator: 'greater_than',
              value: '7',
            },
          ],
          logicOperator: 'and',
        },
        {
          id: 'path-2',
          name: 'Medium Priority',
          conditions: [
            {
              id: 'cond-2',
              field: 'nodeOutputs.emailNode.priority',
              operator: 'greater_than',
              value: '3',
            },
          ],
          logicOperator: 'and',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            priority: 9,
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.routingComplete).toBe(true)
      expect(result.pathTaken).toBe('High Priority')
      expect(result.data?.mode).toBe('router')
      expect(result.data?.conditionsMet).toBe(true)
    })

    it('should route to second path when first does not match', async () => {
      const config = createRouterConfig([
        {
          id: 'path-1',
          name: 'High Priority',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.emailNode.priority',
              operator: 'greater_than',
              value: '7',
            },
          ],
          logicOperator: 'and',
        },
        {
          id: 'path-2',
          name: 'Medium Priority',
          conditions: [
            {
              id: 'cond-2',
              field: 'nodeOutputs.emailNode.priority',
              operator: 'greater_than',
              value: '3',
            },
          ],
          logicOperator: 'and',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            priority: 5,
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.pathTaken).toBe('Medium Priority')
    })

    it('should route to Else when no paths match', async () => {
      const config = createRouterConfig([
        {
          id: 'path-1',
          name: 'High Priority',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.emailNode.priority',
              operator: 'greater_than',
              value: '7',
            },
          ],
          logicOperator: 'and',
        },
        {
          id: 'path-2',
          name: 'Medium Priority',
          conditions: [
            {
              id: 'cond-2',
              field: 'nodeOutputs.emailNode.priority',
              operator: 'greater_than',
              value: '3',
            },
          ],
          logicOperator: 'and',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            priority: 1,
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.pathTaken).toBe('Else')
      expect(result.data?.conditionsMet).toBe(false)
    })

    it('should evaluate paths in order and take first match', async () => {
      const config = createRouterConfig([
        {
          id: 'path-1',
          name: 'Contains Urgent',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.emailNode.subject',
              operator: 'contains',
              value: 'urgent',
            },
          ],
          logicOperator: 'and',
        },
        {
          id: 'path-2',
          name: 'Contains Important',
          conditions: [
            {
              id: 'cond-2',
              field: 'nodeOutputs.emailNode.subject',
              operator: 'contains',
              value: 'important',
            },
          ],
          logicOperator: 'and',
        },
        {
          id: 'path-3',
          name: 'Has Any Subject',
          conditions: [
            {
              id: 'cond-3',
              field: 'nodeOutputs.emailNode.subject',
              operator: 'is_not_empty',
              value: '',
            },
          ],
          logicOperator: 'and',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            subject: 'urgent and important update',
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      // Should match first path even though others also match
      expect(result.success).toBe(true)
      expect(result.pathTaken).toBe('Contains Urgent')
    })

    it('should support complex multi-condition paths', async () => {
      const config = createRouterConfig([
        {
          id: 'path-1',
          name: 'VIP Customer',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.customerNode.tier',
              operator: 'equals',
              value: 'premium',
            },
            {
              id: 'cond-2',
              field: 'nodeOutputs.customerNode.spent',
              operator: 'greater_than',
              value: '1000',
            },
          ],
          logicOperator: 'and',
        },
        {
          id: 'path-2',
          name: 'Regular Customer',
          conditions: [
            {
              id: 'cond-3',
              field: 'nodeOutputs.customerNode.tier',
              operator: 'equals',
              value: 'standard',
            },
          ],
          logicOperator: 'and',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          customerNode: {
            tier: 'premium',
            spent: 1500,
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.pathTaken).toBe('VIP Customer')
    })

    it('should provide evaluated paths in output', async () => {
      const config = createRouterConfig([
        {
          id: 'path-1',
          name: 'Path A',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.node.value',
              operator: 'equals',
              value: '1',
            },
          ],
          logicOperator: 'and',
        },
        {
          id: 'path-2',
          name: 'Path B',
          conditions: [
            {
              id: 'cond-2',
              field: 'nodeOutputs.node.value',
              operator: 'equals',
              value: '2',
            },
          ],
          logicOperator: 'and',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          node: {
            value: '2',
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.data?.evaluatedPaths).toEqual([
        { name: 'Path A', conditionsMet: false },
        { name: 'Path B', conditionsMet: true },
      ])
    })

    it('should handle OR logic in multi-condition paths', async () => {
      const config = createRouterConfig([
        {
          id: 'path-1',
          name: 'Urgent or High Priority',
          conditions: [
            {
              id: 'cond-1',
              field: 'nodeOutputs.emailNode.subject',
              operator: 'contains',
              value: 'urgent',
            },
            {
              id: 'cond-2',
              field: 'nodeOutputs.emailNode.priority',
              operator: 'greater_than',
              value: '7',
            },
          ],
          logicOperator: 'or',
        },
      ])

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            subject: 'Regular Update',
            priority: 9,
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.pathTaken).toBe('Urgent or High Priority')
    })
  })

  describe('Error Handling', () => {
    it('should handle missing conditions', async () => {
      const config = {
        mode: 'router' as const,
        conditions: [],
      }

      const previousOutputs = {}

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('No routing conditions configured')
    })

    it('should handle undefined/null field values gracefully', async () => {
      const config = {
        mode: 'filter' as const,
        conditions: [
          {
            id: 'path-1',
            name: 'Path A',
            conditions: [
              {
                id: 'cond-1',
                field: 'nodeOutputs.missingNode.field',
                operator: 'equals',
                value: 'test',
              },
            ],
            logicOperator: 'and' as const,
          },
        ],
      }

      const previousOutputs = {
        nodeOutputs: {},
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(false)
      expect(result.filterPassed).toBe(false)
    })

    it('should handle variable isVariable flag', async () => {
      const config = {
        mode: 'router' as const,
        conditions: [
          {
            id: 'path-1',
            name: 'Path A',
            conditions: [
              {
                id: 'cond-1',
                field: 'nodeOutputs.node1.email',
                operator: 'equals',
                value: '{{nodeOutputs.node2.email}}',
                isVariable: true,
              },
            ],
            logicOperator: 'and' as const,
          },
        ],
      }

      const previousOutputs = {
        nodeOutputs: {
          node1: {
            email: 'test@example.com',
          },
          node2: {
            email: 'test@example.com',
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.pathTaken).toBe('Path A')
    })
  })

  describe('Different Operators', () => {
    it('should handle starts_with operator', async () => {
      const config = {
        mode: 'filter' as const,
        conditions: [
          {
            id: 'path-1',
            name: 'Path A',
            conditions: [
              {
                id: 'cond-1',
                field: 'nodeOutputs.emailNode.subject',
                operator: 'starts_with',
                value: 'RE:',
              },
            ],
            logicOperator: 'and' as const,
          },
        ],
      }

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            subject: 'RE: Your inquiry',
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.filterPassed).toBe(true)
    })

    it('should handle ends_with operator', async () => {
      const config = {
        mode: 'filter' as const,
        conditions: [
          {
            id: 'path-1',
            name: 'Path A',
            conditions: [
              {
                id: 'cond-1',
                field: 'nodeOutputs.emailNode.from',
                operator: 'ends_with',
                value: '@company.com',
              },
            ],
            logicOperator: 'and' as const,
          },
        ],
      }

      const previousOutputs = {
        nodeOutputs: {
          emailNode: {
            from: 'john@company.com',
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.filterPassed).toBe(true)
    })

    it('should handle greater_equal operator', async () => {
      const config = {
        mode: 'filter' as const,
        conditions: [
          {
            id: 'path-1',
            name: 'Path A',
            conditions: [
              {
                id: 'cond-1',
                field: 'nodeOutputs.node.score',
                operator: 'greater_equal',
                value: '80',
              },
            ],
            logicOperator: 'and' as const,
          },
        ],
      }

      const previousOutputs = {
        nodeOutputs: {
          node: {
            score: 80,
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.filterPassed).toBe(true)
    })

    it('should handle less_equal operator', async () => {
      const config = {
        mode: 'filter' as const,
        conditions: [
          {
            id: 'path-1',
            name: 'Path A',
            conditions: [
              {
                id: 'cond-1',
                field: 'nodeOutputs.node.age',
                operator: 'less_equal',
                value: '30',
              },
            ],
            logicOperator: 'and' as const,
          },
        ],
      }

      const previousOutputs = {
        nodeOutputs: {
          node: {
            age: 25,
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.filterPassed).toBe(true)
    })

    it('should handle is_true operator', async () => {
      const config = {
        mode: 'filter' as const,
        conditions: [
          {
            id: 'path-1',
            name: 'Path A',
            conditions: [
              {
                id: 'cond-1',
                field: 'nodeOutputs.node.active',
                operator: 'is_true',
                value: '',
              },
            ],
            logicOperator: 'and' as const,
          },
        ],
      }

      const previousOutputs = {
        nodeOutputs: {
          node: {
            active: true,
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.filterPassed).toBe(true)
    })

    it('should handle is_false operator', async () => {
      const config = {
        mode: 'filter' as const,
        conditions: [
          {
            id: 'path-1',
            name: 'Path A',
            conditions: [
              {
                id: 'cond-1',
                field: 'nodeOutputs.node.deleted',
                operator: 'is_false',
                value: '',
              },
            ],
            logicOperator: 'and' as const,
          },
        ],
      }

      const previousOutputs = {
        nodeOutputs: {
          node: {
            deleted: false,
          },
        },
      }

      const result = await executeRouter({
        config,
        previousOutputs,
      })

      expect(result.success).toBe(true)
      expect(result.filterPassed).toBe(true)
    })
  })
})
