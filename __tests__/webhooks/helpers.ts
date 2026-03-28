import type { WebhookEvent } from '@/lib/webhooks/processor'

export function makeWebhookEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: 'evt-test-1',
    provider: 'slack',
    eventType: 'slack_trigger_new_message',
    eventData: { text: 'hello' },
    requestId: 'req-test-1',
    timestamp: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

export function makeTriggerNode(
  provider: string,
  eventType: string,
  triggerConfig: Record<string, any> = {}
) {
  return {
    id: `node-${provider}-trigger`,
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: {
      type: eventType,
      label: `${provider} trigger`,
      config: triggerConfig,
      isTrigger: true,
      providerId: provider,
      triggerConfig,
    },
  }
}

export function makeWorkflow(
  id: string,
  nodes: any[],
  overrides: Record<string, any> = {}
) {
  return {
    id,
    name: `Test Workflow ${id}`,
    user_id: 'user-1',
    status: 'active',
    nodes,
    ...overrides,
  }
}

/**
 * Creates a chainable mock that mimics Supabase's fluent query API.
 * Call `setResult(data, error)` to set what the final query returns.
 */
export function mockSupabaseChain(defaultData: any = null, defaultError: any = null) {
  let resultData = defaultData
  let resultError = defaultError

  const chain: any = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockImplementation(() => Promise.resolve({ data: resultData, error: resultError })),
    maybeSingle: jest.fn().mockImplementation(() => Promise.resolve({ data: resultData, error: resultError })),
    then: undefined as any, // Make it thenable for await
    setResult(data: any, error: any = null) {
      resultData = data
      resultError = error
    },
  }

  // Make chain thenable so `await supabase.from(...).select(...)` resolves
  chain.then = (resolve: any) => resolve({ data: resultData, error: resultError })

  return chain
}
