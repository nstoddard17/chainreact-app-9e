import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { AI_ROUTER_TEMPLATES } from '../nodes/providers/ai/aiRouterNode'
import type {
  ChainExecutionEngine as ChainExecutionEngineType,
  ChainDefinition,
  ChainSelectionResult,
  SelectedChain,
  AIAgentExecutionContext,
  ChainExecutionResult
} from '@/lib/workflows/ai/chainExecutionEngine'

// Model pricing (per 1K tokens)
const MODEL_PRICING = {
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'gemini-pro': { input: 0.00025, output: 0.0005 },
  'mistral-large': { input: 0.002, output: 0.006 }
}

// Usage limits per plan
const PLAN_LIMITS = {
  free: { monthly: 100, daily: 10, perExecution: 0.05 },
  pro: { monthly: 1000, daily: 100, perExecution: 0.50 },
  business: { monthly: 5000, daily: 500, perExecution: 2.00 },
  enterprise: { monthly: -1, daily: -1, perExecution: 10.00 } // -1 means unlimited
}

interface AIRouterConfig {
  template: string
  systemPrompt?: string
  memory: 'none' | 'workflow' | 'conversation' | 'vector'
  memoryProvider?: string
  model: string
  apiSource: 'chainreact' | 'custom'
  customApiKey?: string
  customApiProvider?: string
  outputPaths: Array<{
    id: string
    name: string
    description?: string
    color: string
    chainId?: string
    condition: {
      type: 'ai_decision' | 'keyword' | 'regex' | 'confidence' | 'fallback'
      value?: string
      minConfidence?: number
    }
  }>
  chains?: ChainDefinition[]
  decisionMode: 'single' | 'multi' | 'weighted'
  temperature: number
  maxRetries: number
  timeout: number
  includeReasoning: boolean
  costLimit: number
}

interface ExecutionContext {
  userId: string
  workflowId: string
  executionId: string
  input: any
  previousResults?: any
  memoryContext?: any
}

let ChainExecutionEngineRef: typeof ChainExecutionEngineType | null = null

async function getChainExecutionEngine(): Promise<typeof ChainExecutionEngineType> {
  if (!ChainExecutionEngineRef) {
    const module = await import('@/lib/workflows/ai/chainExecutionEngine')
    ChainExecutionEngineRef = module.ChainExecutionEngine
  }
  return ChainExecutionEngineRef!
}
export class AIRouterAction {
  private supabase: any
  private openai?: OpenAI
  private anthropic?: Anthropic
  private gemini?: GoogleGenerativeAI
  
  constructor() {
    // Initialize Supabase for usage tracking
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }
  
  async execute(config: AIRouterConfig, context: ExecutionContext) {
    try {
      // 1. Check usage limits
      const canProceed = await this.checkUsageLimits(context.userId, config)
      if (!canProceed.allowed) {
        throw new Error(`Usage limit exceeded: ${canProceed.reason}`)
      }
      
      // 2. Initialize AI client
      const aiClient = await this.initializeAIClient(config, context.userId)
      
      // 3. Prepare prompt with template and context
      const prompt = this.preparePrompt(config, context)
      
      // 4. Get memory context if enabled
      const memoryContext = await this.getMemoryContext(config, context)
      
      // 5. Make routing decision
      const startTime = Date.now()
      const decision = await this.makeRoutingDecision(
        aiClient,
        prompt,
        config,
        memoryContext,
        context
      )
      const executionTime = Date.now() - startTime
      
      // 6. Track usage and costs
      await this.trackUsage(
        context.userId,
        config,
        decision.tokensUsed,
        decision.cost,
        context.workflowId
      )
      
      // 7. Store memory if enabled
      await this.storeMemory(config, context, decision)
      
      // 8. Format output for workflow
      const output = this.formatOutput(config, decision, executionTime)

      const chainExecution = await this.executeChainsForDecision(config, decision, context)
      if (chainExecution) {
        output.chainExecution = {
          summary: chainExecution.summary,
          chains: chainExecution.chains
        }
      }
      
      return {
        success: true,
        output,
        selectedPaths: decision.selectedPaths,
        metadata: {
          model: config.model,
          tokensUsed: decision.tokensUsed,
          cost: decision.cost,
          executionTime,
          chainsExecuted: chainExecution?.chains?.length || 0
        }
      }
      
    } catch (error: any) {
      console.error('[AI Router] Execution error:', error)
      
      // Track failed attempt
      await this.trackFailedAttempt(context.userId, config.model, error.message)
      
      throw error
    }
  }

  private async executeChainsForDecision(
    config: AIRouterConfig,
    decision: any,
    context: ExecutionContext
  ): Promise<ChainExecutionResult | null> {
    if (!Array.isArray(config.chains) || config.chains.length === 0) {
      return null
    }

    const pathToChain = new Map<string, string>()
    for (const path of config.outputPaths) {
      if (path.chainId) {
        pathToChain.set(path.id, path.chainId)
      }
    }

    const selectedChainIds = (decision.selectedPaths || [])
      .map((pathId: string) => pathToChain.get(pathId))
      .filter((id): id is string => Boolean(id))

    if (selectedChainIds.length === 0) {
      return null
    }

    const engineContext: AIAgentExecutionContext = {
      input: {
        triggerData: context.input?.trigger,
        workflowData: context.input,
        nodeOutputs: context.previousResults || {}
      },
      chains: config.chains,
      config: {
        model: config.model,
        temperature: config.temperature,
        apiSource: config.apiSource,
        apiKey: config.customApiKey
      },
      metadata: {
        executionId: context.executionId,
        workflowId: context.workflowId,
        userId: context.userId,
        timestamp: new Date().toISOString(),
        testMode: Boolean(context.input?.testMode)
      }
    }

    const ChainExecutionEngine = await getChainExecutionEngine()
    const engine = new ChainExecutionEngine(engineContext)

    const selectedChains: SelectedChain[] = selectedChainIds.map((chainId, index) => {
      let confidence = 0.8
      if (typeof decision.confidence === 'number') {
        confidence = decision.confidence
      } else if (decision.confidence && typeof decision.confidence === 'object') {
        confidence = decision.confidence[chainId] || decision.confidence[decision.selectedPaths?.[index]] || 0.8
      }

      return {
        chainId,
        reasoning: decision.reasoning || `AI router selected path ${decision.selectedPaths?.[index]}`,
        priority: index,
        confidence
      }
    })

    const selection: ChainSelectionResult = {
      selectedChains,
      unselectedChains: [],
      executionPlan: {
        parallel: false,
        maxConcurrency: 1,
        continueOnError: false
      }
    }

    return engine.executeChains(selection)
  }
  
  private async checkUsageLimits(userId: string, config: AIRouterConfig) {
    // Skip ALL limits if using custom API key - they're paying directly
    if (config.apiSource === 'custom' && config.customApiKey) {
      // Still check their custom API budget if set
      const { data: customKey } = await this.supabase
        .from('user_api_keys')
        .select('monthly_budget, current_usage')
        .eq('user_id', userId)
        .eq('provider', config.customApiProvider)
        .single()
      
      if (customKey && customKey.monthly_budget > 0) {
        if (customKey.current_usage >= customKey.monthly_budget) {
          return { 
            allowed: false, 
            reason: `Monthly budget exceeded for custom API ($${customKey.current_usage}/$${customKey.monthly_budget})`
          }
        }
      }
      
      return { allowed: true }
    }
    
    // Only apply ChainReact limits when using ChainReact API
    const { data: subscription } = await this.supabase
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()
    
    const plan = subscription?.plans?.name?.toLowerCase() || 'free'
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]
    
    // Check cost limit per execution
    const estimatedCost = this.estimateCost(config.model)
    if (estimatedCost > limits.perExecution) {
      return { 
        allowed: false, 
        reason: `Estimated cost ($${estimatedCost}) exceeds per-execution limit ($${limits.perExecution})`
      }
    }
    
    // Check daily usage
    const today = new Date().toISOString().split('T')[0]
    const { data: dailyUsage } = await this.supabase
      .from('ai_cost_logs')
      .select('cost')
      .eq('user_id', userId)
      .gte('created_at', today)
    
    const dailyTotal = dailyUsage?.reduce((sum: number, log: any) => sum + log.cost, 0) || 0
    
    if (limits.daily !== -1 && dailyTotal >= limits.daily) {
      return { 
        allowed: false, 
        reason: `Daily limit reached ($${dailyTotal}/$${limits.daily})`
      }
    }
    
    // Check monthly usage
    const currentMonth = new Date().getMonth() + 1
    const currentYear = new Date().getFullYear()
    
    const { data: monthlyUsage } = await this.supabase
      .from('monthly_ai_costs')
      .select('total_cost, ai_agent_cost')
      .eq('user_id', userId)
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .single()
    
    const monthlyTotal = monthlyUsage?.total_cost || 0
    
    if (limits.monthly !== -1 && monthlyTotal >= limits.monthly) {
      return { 
        allowed: false, 
        reason: `Monthly limit reached ($${monthlyTotal}/$${limits.monthly})`
      }
    }
    
    return { allowed: true }
  }
  
  private async initializeAIClient(config: AIRouterConfig, userId: string) {
    if (config.apiSource === 'custom' && config.customApiKey) {
      // Use user's custom API key
      return this.initializeCustomClient(config)
    } 
      // Use ChainReact's API keys
      return this.initializeChainReactClient(config.model)
    
  }
  
  private async initializeCustomClient(config: AIRouterConfig) {
    const provider = config.customApiProvider
    const apiKey = config.customApiKey!
    
    // Decrypt API key if encrypted
    const decryptedKey = await this.decryptApiKey(apiKey)
    
    switch (provider) {
      case 'openai':
        return new OpenAI({ apiKey: decryptedKey })
      case 'anthropic':
        return new Anthropic({ apiKey: decryptedKey })
      case 'google':
        return new GoogleGenerativeAI(decryptedKey)
      case 'mistral':
        // Mistral client initialization
        return { type: 'mistral', apiKey: decryptedKey }
      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }
  }
  
  private async initializeChainReactClient(model: string) {
    // Use environment variables for ChainReact's API keys
    if (model.startsWith('gpt')) {
      return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    } else if (model.startsWith('claude')) {
      return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    } else if (model.startsWith('gemini')) {
      return new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
    } else if (model.startsWith('mistral')) {
      return { type: 'mistral', apiKey: process.env.MISTRAL_API_KEY }
    }
    
    throw new Error(`Unsupported model: ${model}`)
  }
  
  private preparePrompt(config: AIRouterConfig, context: ExecutionContext) {
    let systemPrompt = ''
    
    // Get template prompt or custom prompt
    if (config.template !== 'custom') {
      const template = AI_ROUTER_TEMPLATES[config.template as keyof typeof AI_ROUTER_TEMPLATES]
      systemPrompt = template.systemPrompt
    } else {
      systemPrompt = config.systemPrompt || ''
    }
    
    // Add output paths to prompt
    const pathDescriptions = config.outputPaths.map(path => 
      `- ${path.name}: ${path.description || 'No description'}`
    ).join('\n')
    
    systemPrompt += `\n\nAvailable output paths:\n${pathDescriptions}`
    
    // Add decision mode instructions
    if (config.decisionMode === 'single') {
      systemPrompt += '\n\nSelect ONLY ONE output path that best matches the input.'
    } else if (config.decisionMode === 'multi') {
      systemPrompt += '\n\nYou may select MULTIPLE output paths if the input matches multiple categories.'
    }
    
    // Format input data
    const userPrompt = `Analyze the following input and make a routing decision:\n\n${JSON.stringify(context.input, null, 2)}`
    
    return { systemPrompt, userPrompt }
  }
  
  private async makeRoutingDecision(
    aiClient: any,
    prompt: { systemPrompt: string, userPrompt: string },
    config: AIRouterConfig,
    memoryContext: any,
    context: ExecutionContext
  ) {
    let response: any
    let tokensUsed = 0
    let cost = 0
    
    // Add memory context to prompt if available
    if (memoryContext) {
      prompt.systemPrompt += `\n\nPrevious context:\n${JSON.stringify(memoryContext, null, 2)}`
    }
    
    try {
      if (config.model.startsWith('gpt')) {
        const completion = await (aiClient as OpenAI).chat.completions.create({
          model: config.model,
          messages: [
            { role: 'system', content: prompt.systemPrompt },
            { role: 'user', content: prompt.userPrompt }
          ],
          temperature: config.temperature,
          response_format: { type: 'json_object' },
          max_tokens: 1000
        })
        
        response = JSON.parse(completion.choices[0].message.content || '{}')
        tokensUsed = completion.usage?.total_tokens || 0
        
      } else if (config.model.startsWith('claude')) {
        const message = await (aiClient as Anthropic).messages.create({
          model: config.model,
          system: prompt.systemPrompt,
          messages: [{ role: 'user', content: prompt.userPrompt }],
          temperature: config.temperature,
          max_tokens: 1000
        })
        
        response = JSON.parse(message.content[0].type === 'text' ? message.content[0].text : '{}')
        tokensUsed = (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0)
        
      } else if (config.model.startsWith('gemini')) {
        const model = (aiClient as GoogleGenerativeAI).getGenerativeModel({ model: config.model })
        const result = await model.generateContent(`${prompt.systemPrompt }\n\n${ prompt.userPrompt}`)
        const text = result.response.text()
        response = JSON.parse(text)
        tokensUsed = 1000 // Estimate for Gemini
        
      } else {
        throw new Error(`Model ${config.model} not yet implemented`)
      }
      
      // Calculate cost
      const pricing = MODEL_PRICING[config.model as keyof typeof MODEL_PRICING]
      if (pricing) {
        const inputTokens = Math.floor(tokensUsed * 0.7) // Estimate
        const outputTokens = tokensUsed - inputTokens
        cost = (inputTokens / 1000 * pricing.input) + (outputTokens / 1000 * pricing.output)
      }
      
      // Determine selected paths based on response
      const selectedPaths = this.determineSelectedPaths(response, config)
      
      return {
        ...response,
        selectedPaths,
        tokensUsed,
        cost
      }
      
    } catch (error) {
      console.error('[AI Router] Decision error:', error)
      throw error
    }
  }
  
  private determineSelectedPaths(response: any, config: AIRouterConfig) {
    const selectedPaths: string[] = []
    
    // Check AI decision
    if (response.classification) {
      const matchingPath = config.outputPaths.find(path => 
        path.name.toLowerCase() === response.classification.toLowerCase() ||
        path.id === response.classification
      )
      
      if (matchingPath && response.confidence >= (matchingPath.condition.minConfidence || 0.5)) {
        selectedPaths.push(matchingPath.id)
      }
    }
    
    // Check multiple classifications for multi-path mode
    if (config.decisionMode === 'multi' && response.classifications) {
      for (const classification of response.classifications) {
        const matchingPath = config.outputPaths.find(path => 
          path.name.toLowerCase() === classification.name.toLowerCase()
        )
        
        if (matchingPath && classification.confidence >= (matchingPath.condition.minConfidence || 0.5)) {
          selectedPaths.push(matchingPath.id)
        }
      }
    }
    
    // Add fallback if no paths selected
    if (selectedPaths.length === 0) {
      const fallbackPath = config.outputPaths.find(path => path.condition.type === 'fallback')
      if (fallbackPath) {
        selectedPaths.push(fallbackPath.id)
      }
    }
    
    return selectedPaths
  }
  
  private async trackUsage(
    userId: string,
    config: AIRouterConfig,
    tokensUsed: number,
    cost: number,
    workflowId: string
  ) {
    try {
      // If using custom API, track in separate table
      if (config.apiSource === 'custom' && config.customApiKey) {
        // Get the API key record
        const { data: apiKey } = await this.supabase
          .from('user_api_keys')
          .select('id')
          .eq('user_id', userId)
          .eq('provider', config.customApiProvider)
          .single()
        
        if (apiKey) {
          // Track custom API usage (doesn't count against plan)
          await this.supabase.from('user_api_usage').insert({
            user_id: userId,
            api_key_id: apiKey.id,
            workflow_id: workflowId,
            provider: config.customApiProvider!,
            model: config.model,
            input_tokens: Math.floor(tokensUsed * 0.7),
            output_tokens: Math.floor(tokensUsed * 0.3),
            estimated_cost: cost,
            metadata: {
              template: config.template,
              decision_mode: config.decisionMode
            }
          })
        }
        
        // Still log for audit but mark as custom
        await this.supabase.from('ai_cost_logs').insert({
          user_id: userId,
          feature: 'ai_agent_custom', // Different feature tag
          model: config.model,
          input_tokens: Math.floor(tokensUsed * 0.7),
          output_tokens: Math.floor(tokensUsed * 0.3),
          cost: 0, // No cost to ChainReact
          calculated_cost: cost, // Actual cost to user
          metadata: {
            workflow_id: workflowId,
            template: config.template,
            api_source: 'custom',
            provider: config.customApiProvider,
            decision_mode: config.decisionMode
          }
        })
        
        // DO NOT update monthly_usage for custom API usage
        return
      }
      
      // Only track against plan limits if using ChainReact API
      await this.supabase.from('ai_cost_logs').insert({
        user_id: userId,
        feature: 'ai_agent',
        model: config.model,
        input_tokens: Math.floor(tokensUsed * 0.7),
        output_tokens: Math.floor(tokensUsed * 0.3),
        cost: cost,
        calculated_cost: cost,
        metadata: {
          workflow_id: workflowId,
          template: config.template,
          api_source: config.apiSource,
          decision_mode: config.decisionMode
        }
      })
      
      // Update monthly usage ONLY for ChainReact API
      const currentMonth = new Date().getMonth() + 1
      const currentYear = new Date().getFullYear()
      
      await this.supabase.from('monthly_usage').upsert({
        user_id: userId,
        year: currentYear,
        month: currentMonth,
        ai_agent_executions: 1
      }, {
        onConflict: 'user_id,year,month',
        count: 'exact'
      })
      
    } catch (error) {
      console.error('[AI Router] Failed to track usage:', error)
      // Don't throw - allow execution to continue even if tracking fails
    }
  }
  
  private async getMemoryContext(config: AIRouterConfig, context: ExecutionContext) {
    if (config.memory === 'none') return null
    
    if (config.memory === 'workflow') {
      // Return previous results from this workflow execution
      return context.previousResults || null
    }
    
    if (config.memory === 'conversation') {
      // Get conversation history from database
      const { data } = await this.supabase
        .from('workflow_conversations')
        .select('context')
        .eq('workflow_id', context.workflowId)
        .order('created_at', { ascending: false })
        .limit(5)
      
      return data?.map((d: any) => d.context) || []
    }
    
    if (config.memory === 'vector' && config.memoryProvider) {
      // Implement vector search
      // This would integrate with Pinecone, Weaviate, etc.
      return null // Placeholder
    }
    
    return null
  }
  
  private async storeMemory(config: AIRouterConfig, context: ExecutionContext, decision: any) {
    if (config.memory === 'none') return
    
    if (config.memory === 'conversation') {
      // Store conversation context
      await this.supabase.from('workflow_conversations').insert({
        workflow_id: context.workflowId,
        execution_id: context.executionId,
        context: {
          input: context.input,
          decision: decision,
          timestamp: new Date().toISOString()
        }
      })
    }
    
    // Vector storage would be implemented here
  }
  
  private formatOutput(config: AIRouterConfig, decision: any, executionTime: number) {
    return {
      routingDecision: decision,
      selectedPath: decision.selectedPaths[0], // Primary path
      selectedPaths: decision.selectedPaths,
      confidence: decision.confidence || 0,
      reasoning: config.includeReasoning ? decision.reasoning : undefined,
      classification: decision.classification,
      urgency: decision.urgency,
      sentiment: decision.sentiment,
      extractedData: decision.extractedData || {},
      suggestedActions: decision.suggestedActions || [],
      metadata: {
        template: config.template,
        model: config.model,
        executionTime,
        timestamp: new Date().toISOString()
      },
      tokensUsed: decision.tokensUsed,
      costIncurred: decision.cost,
      chainExecution: undefined as
        | {
            summary: string | null
            chains: any[]
          }
        | undefined
    }
  }
  
  private estimateCost(model: string): number {
    const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING]
    if (!pricing) return 0.10 // Default estimate
    
    // Estimate 500 input tokens + 200 output tokens
    return (500 / 1000 * pricing.input) + (200 / 1000 * pricing.output)
  }
  
  private async decryptApiKey(encryptedKey: string): Promise<string> {
    // Implement decryption logic here
    // For now, return as-is (should be encrypted in production)
    return encryptedKey
  }
  
  private async trackFailedAttempt(userId: string, model: string, error: string) {
    try {
      await this.supabase.from('ai_error_logs').insert({
        user_id: userId,
        feature: 'ai_router',
        model: model,
        error: error,
        timestamp: new Date().toISOString()
      })
    } catch (err) {
      console.error('[AI Router] Failed to track error:', err)
    }
  }
}

// Export the main execution function
export async function executeAIRouter(
  config: AIRouterConfig,
  context: ExecutionContext
) {
  const router = new AIRouterAction()
  return router.execute(config, context)
}
