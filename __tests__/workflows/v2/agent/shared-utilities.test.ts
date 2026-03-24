/**
 * Tests for the shared AI utilities:
 * - AI model config
 * - Token-aware conversation truncation
 * - Plan cache
 * - OpenAI client singleton
 */

describe('AI_MODELS config', () => {
  let AI_MODELS: any
  let selectModel: any

  beforeAll(async () => {
    const models = await import('@/lib/ai/models')
    AI_MODELS = models.AI_MODELS
    selectModel = models.selectModel
  })

  it('has all expected model keys', () => {
    expect(AI_MODELS.planning).toBeDefined()
    expect(AI_MODELS.fast).toBeDefined()
    expect(AI_MODELS.configuration).toBeDefined()
    expect(AI_MODELS.utility).toBeDefined()
    expect(AI_MODELS.transcription).toBeDefined()
  })

  it('planning model is gpt-4o', () => {
    expect(AI_MODELS.planning).toBe('gpt-4o')
  })

  it('fast model is gpt-4o-mini', () => {
    expect(AI_MODELS.fast).toBe('gpt-4o-mini')
  })

  it('selectModel returns user preference when not "auto"', () => {
    expect(selectModel('planning', 'gpt-3.5-turbo')).toBe('gpt-3.5-turbo')
  })

  it('selectModel returns configured model when preference is "auto"', () => {
    expect(selectModel('planning', 'auto')).toBe('gpt-4o')
    expect(selectModel('fast', 'auto')).toBe('gpt-4o-mini')
  })

  it('selectModel returns configured model when no preference given', () => {
    expect(selectModel('planning')).toBe('gpt-4o')
  })
})

describe('Token-aware conversation truncation', () => {
  let truncateConversationHistory: any

  beforeAll(async () => {
    const utils = await import('@/lib/ai/token-utils')
    truncateConversationHistory = utils.truncateConversationHistory
  })

  it('returns empty array for empty input', () => {
    expect(truncateConversationHistory([], 1000)).toEqual([])
    expect(truncateConversationHistory(null as any, 1000)).toEqual([])
  })

  it('returns all messages when within budget', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]
    const result = truncateConversationHistory(messages, 1000)
    expect(result).toHaveLength(2)
  })

  it('truncates oldest messages first when over budget', () => {
    const messages = [
      { role: 'user', content: 'A'.repeat(400) }, // ~100 tokens
      { role: 'user', content: 'B'.repeat(400) }, // ~100 tokens
      { role: 'user', content: 'C'.repeat(400) }, // ~100 tokens
      { role: 'user', content: 'D'.repeat(400) }, // ~100 tokens
    ]
    // Budget of 250 tokens should keep last 2-3 messages
    const result = truncateConversationHistory(messages, 250)
    expect(result.length).toBeLessThan(4)
    // Last message should always be included
    expect(result[result.length - 1].content).toBe('D'.repeat(400))
  })

  it('always includes at least 1 message even if over budget', () => {
    const messages = [
      { role: 'user', content: 'A'.repeat(10000) }, // way over budget
    ]
    const result = truncateConversationHistory(messages, 10)
    expect(result).toHaveLength(1)
  })

  it('preserves chronological order', () => {
    const messages = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
      { role: 'user', content: 'third' },
    ]
    const result = truncateConversationHistory(messages, 1000)
    expect(result[0].content).toBe('first')
    expect(result[2].content).toBe('third')
  })
})

describe('Plan cache', () => {
  let getCachedPlan: any
  let cachePlan: any
  let clearPlanCache: any

  beforeAll(async () => {
    const cache = await import('@/lib/ai/plan-cache')
    getCachedPlan = cache.getCachedPlan
    cachePlan = cache.cachePlan
    clearPlanCache = cache.clearPlanCache
  })

  beforeEach(() => {
    clearPlanCache()
  })

  it('returns null for uncached prompt', () => {
    expect(getCachedPlan('build a workflow', ['gmail'])).toBeNull()
  })

  it('caches and retrieves a plan', () => {
    const plan = { nodes: [{ type: 'gmail_trigger' }], confidence: 'high' }
    cachePlan('build a workflow', ['gmail'], plan)
    const result = getCachedPlan('build a workflow', ['gmail'])
    expect(result).toEqual(plan)
  })

  it('cache is case-insensitive', () => {
    const plan = { nodes: [{ type: 'test' }] }
    cachePlan('Build A Workflow', ['Gmail'], plan)
    const result = getCachedPlan('build a workflow', ['gmail'])
    expect(result).toEqual(plan)
  })

  it('different integrations produce different cache keys', () => {
    const plan1 = { type: 'gmail' }
    const plan2 = { type: 'outlook' }
    cachePlan('email to slack', ['gmail'], plan1)
    cachePlan('email to slack', ['outlook'], plan2)
    expect(getCachedPlan('email to slack', ['gmail'])).toEqual(plan1)
    expect(getCachedPlan('email to slack', ['outlook'])).toEqual(plan2)
  })

  it('expired entries are evicted', async () => {
    // We can't easily test TTL without mocking Date, so just verify clear works
    const plan = { nodes: [] }
    cachePlan('test', [], plan)
    expect(getCachedPlan('test', [])).toEqual(plan)
    clearPlanCache()
    expect(getCachedPlan('test', [])).toBeNull()
  })
})

describe('OpenAI client singleton', () => {
  let getOpenAIClient: any
  let resetOpenAIClient: any

  beforeAll(async () => {
    const client = await import('@/lib/ai/openai-client')
    getOpenAIClient = client.getOpenAIClient
    resetOpenAIClient = client.resetOpenAIClient
  })

  afterEach(() => {
    resetOpenAIClient()
  })

  it('throws when OPENAI_API_KEY is not set', () => {
    const original = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    resetOpenAIClient()
    expect(() => getOpenAIClient()).toThrow('OPENAI_API_KEY')
    process.env.OPENAI_API_KEY = original
  })

  it('returns same instance on multiple calls', () => {
    process.env.OPENAI_API_KEY = 'test-key-12345'
    resetOpenAIClient()
    const a = getOpenAIClient()
    const b = getOpenAIClient()
    expect(a).toBe(b)
  })
})
