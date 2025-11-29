import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.SUPABASE_SECRET_KEY ||= 'test-service-role'
process.env.OPENAI_API_KEY ||= 'test-openai-key'

console.log = () => {}

const baseConfig = {
  template: 'custom',
  systemPrompt: 'Route intelligently',
  memory: 'none' as const,
  model: 'gpt-4-turbo',
  apiSource: 'chainreact' as const,
  decisionMode: 'single' as const,
  temperature: 0,
  maxRetries: 0,
  timeout: 30,
  includeReasoning: false,
  costLimit: 1,
}

test('AI Router executes mapped chains when decision selects path', async () => {
  const { AIRouterAction } = await import('@/lib/workflows/actions/aiRouterAction')
  const router = new AIRouterAction() as any

  router.checkUsageLimits = async () => ({ allowed: true })
  router.initializeAIClient = async () => ({})
  router.preparePrompt = () => ({ systemPrompt: '', userPrompt: '' })
  router.getMemoryContext = async () => null
  router.makeRoutingDecision = async () => ({
    selectedPaths: ['path-sales'],
    tokensUsed: 42,
    cost: 0.002,
    confidence: 0.92,
  })
  router.trackUsage = async () => {}
  router.storeMemory = async () => {}
  router.executeChainsForDecision = async () => ({
    chains: [
      {
        chainId: 'chain-sales',
        success: true,
        output: {},
        executionTime: 12,
      },
    ],
    summary: 'executed',
    errors: [],
  })

  const config = {
    ...baseConfig,
    outputPaths: [
      {
        id: 'path-sales',
        name: 'Sales',
        description: 'Handles sales inquiries',
        color: '#3b82f6',
        chainId: 'chain-sales',
        condition: { type: 'ai_decision', minConfidence: 0.7 },
      },
    ],
    chains: [
      {
        id: 'chain-sales',
        name: 'Sales Follow-up',
        nodes: [],
        edges: [],
      },
    ],
  }

  const context = {
    userId: 'user-1',
    workflowId: 'workflow-1',
    executionId: 'exec-1',
    input: {},
    previousResults: {},
  }

  const result = await router.execute(config, context)

  assert.deepEqual(result.selectedPaths, ['path-sales'])
  assert.ok(result.output.chainExecution)
  assert.equal(result.output.chainExecution.chains.length, 1)
  assert.equal(result.output.chainExecution.chains[0].success, true)
})
