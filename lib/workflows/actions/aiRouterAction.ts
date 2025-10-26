import { logger } from '@/lib/utils/logger'

type UsageCheck = {
  allowed: boolean
  reason?: string
}

type RoutingDecision = {
  selectedPaths: string[]
  tokensUsed?: number
  cost?: number
  confidence?: number
}

type ChainExecutionResult = {
  chains: Array<{
    chainId: string
    success: boolean
    output?: Record<string, any>
    executionTime?: number
  }>
  summary?: string
  errors?: string[]
}

/**
 * Legacy AIRouterAction wrapper used by older tests.
 * The modern runtime now routes through executeAIAgentAction, but we keep this
 * small class around so we can stub its lifecycle in isolation tests.
 */
export class AIRouterAction {
  async execute(config: any, context: Record<string, any>) {
    const usage = await this.checkUsageLimits(context)
    if (!usage?.allowed) {
      throw new Error(usage?.reason || 'Usage limit exceeded')
    }

    const aiClient = await this.initializeAIClient(config, context)
    const prompt = this.preparePrompt(config, context, aiClient)
    const memoryContext = await this.getMemoryContext(context, config)

    const decision = await this.makeRoutingDecision({
      config,
      context,
      aiClient,
      prompt,
      memoryContext
    })

    if (!decision || !Array.isArray(decision.selectedPaths)) {
      throw new Error('Routing decision did not return any paths')
    }

    const chainExecution = await this.executeChainsForDecision(decision, config, context)

    await this.trackUsage(decision, context)
    await this.storeMemory(memoryContext, decision, context)

    logger.debug('[AIRouterAction] Execution complete', {
      selectedPaths: decision.selectedPaths,
      tokensUsed: decision.tokensUsed,
      cost: decision.cost
    })

    return {
      selectedPaths: decision.selectedPaths,
      output: {
        chainExecution
      },
      tokensUsed: decision.tokensUsed ?? 0,
      cost: decision.cost ?? 0,
      confidence: decision.confidence ?? 0
    }
  }

  // ---- Overridable hooks --------------------------------------------------

  async checkUsageLimits(_context: Record<string, any>): Promise<UsageCheck> {
    return { allowed: true }
  }

  async initializeAIClient(_config: any, _context: Record<string, any>): Promise<any> {
    return null
  }

  preparePrompt(_config: any, _context: Record<string, any>, _aiClient: any): Record<string, any> {
    return { systemPrompt: '', userPrompt: '' }
  }

  async getMemoryContext(_context: Record<string, any>, _config: any): Promise<any> {
    return null
  }

  async makeRoutingDecision(_args: {
    config: any
    context: Record<string, any>
    aiClient: any
    prompt: Record<string, any>
    memoryContext: any
  }): Promise<RoutingDecision> {
    return {
      selectedPaths: [],
      tokensUsed: 0,
      cost: 0,
      confidence: 0
    }
  }

  async executeChainsForDecision(
    _decision: RoutingDecision,
    _config: any,
    _context: Record<string, any>
  ): Promise<ChainExecutionResult> {
    return {
      chains: [],
      summary: 'No chains executed',
      errors: []
    }
  }

  async trackUsage(_decision: RoutingDecision, _context: Record<string, any>): Promise<void> {
    // noop by default
  }

  async storeMemory(
    _memoryContext: any,
    _decision: RoutingDecision,
    _context: Record<string, any>
  ): Promise<void> {
    // noop by default
  }
}
