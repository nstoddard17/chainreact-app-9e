/**
 * Manual verification script for Router node execution
 * Tests both filter and router modes
 */

import { executeRouter } from '../lib/workflows/actions/logic/executeRouter'
import type { ConditionalPath } from '../components/workflows/configuration/fields/CriteriaBuilder'

interface TestCase {
  name: string
  config: {
    mode: 'filter' | 'router'
    conditions: ConditionalPath[]
    stopMessage?: string
  }
  previousOutputs: Record<string, any>
  expected: {
    success: boolean
    pathTaken?: string
    filterPassed?: boolean
    stopWorkflow?: boolean
  }
}

const testCases: TestCase[] = [
  // FILTER MODE TESTS
  {
    name: '[Filter] Pass - Simple condition met',
    config: {
      mode: 'filter',
      conditions: [
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
    },
    previousOutputs: {
      nodeOutputs: {
        emailNode: {
          subject: 'URGENT: System Alert',
          from: 'admin@example.com',
        },
      },
    },
    expected: {
      success: true,
      filterPassed: true,
    },
  },
  {
    name: '[Filter] Stop - Condition not met',
    config: {
      mode: 'filter',
      conditions: [
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
      stopMessage: 'Email is not urgent',
    },
    previousOutputs: {
      nodeOutputs: {
        emailNode: {
          subject: 'Regular Update',
          from: 'admin@example.com',
        },
      },
    },
    expected: {
      success: false,
      filterPassed: false,
      stopWorkflow: true,
    },
  },
  {
    name: '[Filter] Pass - AND logic, all conditions met',
    config: {
      mode: 'filter',
      conditions: [
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
      ],
    },
    previousOutputs: {
      nodeOutputs: {
        emailNode: {
          subject: 'URGENT: System Alert',
          priority: 8,
        },
      },
    },
    expected: {
      success: true,
      filterPassed: true,
    },
  },
  {
    name: '[Filter] Stop - AND logic, one condition fails',
    config: {
      mode: 'filter',
      conditions: [
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
      ],
    },
    previousOutputs: {
      nodeOutputs: {
        emailNode: {
          subject: 'Regular Update',
          priority: 8,
        },
      },
    },
    expected: {
      success: false,
      filterPassed: false,
      stopWorkflow: true,
    },
  },
  {
    name: '[Filter] Pass - OR logic, one condition met',
    config: {
      mode: 'filter',
      conditions: [
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
      ],
    },
    previousOutputs: {
      nodeOutputs: {
        emailNode: {
          subject: 'Regular Update',
          priority: 8,
        },
      },
    },
    expected: {
      success: true,
      filterPassed: true,
    },
  },

  // ROUTER MODE TESTS
  {
    name: '[Router] Route to first matching path',
    config: {
      mode: 'router',
      conditions: [
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
      ],
    },
    previousOutputs: {
      nodeOutputs: {
        emailNode: {
          priority: 9,
        },
      },
    },
    expected: {
      success: true,
      pathTaken: 'High Priority',
    },
  },
  {
    name: '[Router] Route to second path when first does not match',
    config: {
      mode: 'router',
      conditions: [
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
      ],
    },
    previousOutputs: {
      nodeOutputs: {
        emailNode: {
          priority: 5,
        },
      },
    },
    expected: {
      success: true,
      pathTaken: 'Medium Priority',
    },
  },
  {
    name: '[Router] Route to Else when no paths match',
    config: {
      mode: 'router',
      conditions: [
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
      ],
    },
    previousOutputs: {
      nodeOutputs: {
        emailNode: {
          priority: 1,
        },
      },
    },
    expected: {
      success: true,
      pathTaken: 'Else',
    },
  },
  {
    name: '[Router] Take first match even when multiple match',
    config: {
      mode: 'router',
      conditions: [
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
      ],
    },
    previousOutputs: {
      nodeOutputs: {
        emailNode: {
          subject: 'urgent and important update',
        },
      },
    },
    expected: {
      success: true,
      pathTaken: 'Contains Urgent',
    },
  },
  {
    name: '[Router] Multi-condition path with AND logic',
    config: {
      mode: 'router',
      conditions: [
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
      ],
    },
    previousOutputs: {
      nodeOutputs: {
        customerNode: {
          tier: 'premium',
          spent: 1500,
        },
      },
    },
    expected: {
      success: true,
      pathTaken: 'VIP Customer',
    },
  },
  {
    name: '[Router] Multi-condition path with OR logic',
    config: {
      mode: 'router',
      conditions: [
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
      ],
    },
    previousOutputs: {
      nodeOutputs: {
        emailNode: {
          subject: 'Regular Update',
          priority: 9,
        },
      },
    },
    expected: {
      success: true,
      pathTaken: 'Urgent or High Priority',
    },
  },
]

async function runTests() {
  console.log('🧪 Router Node Verification Tests\n')
  console.log('='.repeat(80))
  console.log('')

  let passed = 0
  let failed = 0
  const failures: string[] = []

  for (const testCase of testCases) {
    try {
      const result = await executeRouter({
        config: testCase.config,
        previousOutputs: testCase.previousOutputs,
      })

      let testPassed = true
      const errors: string[] = []

      // Check success
      if (result.success !== testCase.expected.success) {
        testPassed = false
        errors.push(
          `Expected success=${testCase.expected.success}, got ${result.success}`
        )
      }

      // Check pathTaken (router mode)
      if (testCase.expected.pathTaken && result.pathTaken !== testCase.expected.pathTaken) {
        testPassed = false
        errors.push(
          `Expected pathTaken="${testCase.expected.pathTaken}", got "${result.pathTaken}"`
        )
      }

      // Check filterPassed (filter mode)
      if (
        testCase.expected.filterPassed !== undefined &&
        result.filterPassed !== testCase.expected.filterPassed
      ) {
        testPassed = false
        errors.push(
          `Expected filterPassed=${testCase.expected.filterPassed}, got ${result.filterPassed}`
        )
      }

      // Check stopWorkflow (filter mode)
      if (
        testCase.expected.stopWorkflow !== undefined &&
        result.stopWorkflow !== testCase.expected.stopWorkflow
      ) {
        testPassed = false
        errors.push(
          `Expected stopWorkflow=${testCase.expected.stopWorkflow}, got ${result.stopWorkflow}`
        )
      }

      if (testPassed) {
        console.log(`✅ ${testCase.name}`)
        passed++
      } else {
        console.log(`❌ ${testCase.name}`)
        console.log(`   Errors:`)
        errors.forEach((err) => console.log(`   - ${err}`))
        console.log(`   Result: ${JSON.stringify(result, null, 2)}`)
        failed++
        failures.push(testCase.name)
      }
    } catch (error: any) {
      console.log(`❌ ${testCase.name}`)
      console.log(`   Exception: ${error.message}`)
      if (error.stack) {
        console.log(`   Stack: ${error.stack}`)
      }
      failed++
      failures.push(testCase.name)
    }
  }

  console.log('')
  console.log('='.repeat(80))
  console.log('')
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed (${testCases.length} total)`)

  if (failed > 0) {
    console.log('')
    console.log('Failed tests:')
    failures.forEach((name) => console.log(`  - ${name}`))
    process.exit(1)
  } else {
    console.log('')
    console.log('✅ All tests passed!')
    process.exit(0)
  }
}

runTests()
