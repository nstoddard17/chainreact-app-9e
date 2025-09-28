/**
 * AI Decision Maker for Chain Routing
 *
 * This module analyzes workflow inputs and intelligently selects
 * which action chains to execute based on the content and context.
 */

import { OpenAI } from 'openai'
import {
  AIAgentExecutionContext,
  ChainDefinition,
  ChainSelectionResult,
  SelectedChain,
  ExecutionPlan
} from './chainExecutionEngine'

// Dynamic import for Anthropic SDK (optional dependency)
let Anthropic: any
try {
  Anthropic = require('@anthropic-ai/sdk').default
} catch {
  // Anthropic SDK not installed, will use fallback
  Anthropic = null
}

export class AIDecisionMaker {
  private context: AIAgentExecutionContext
  private openaiClient?: OpenAI
  private anthropicClient?: any

  constructor(context: AIAgentExecutionContext) {
    this.context = context
    this.initializeClients()
  }

  /**
   * Initialize AI clients based on configuration
   */
  private initializeClients() {
    if (this.context.config.apiSource === 'custom' && this.context.config.apiKey) {
      if (this.context.config.model.includes('gpt')) {
        this.openaiClient = new OpenAI({
          apiKey: this.context.config.apiKey
        })
      } else if (this.context.config.model.includes('claude') && Anthropic) {
        this.anthropicClient = new Anthropic({
          apiKey: this.context.config.apiKey
        })
      }
    }
  }

  /**
   * Analyze input and route to appropriate chains
   */
  async analyzeAndRoute(): Promise<ChainSelectionResult> {
    console.log('🧠 AI Decision Maker: Analyzing input for chain routing')

    // Check if chains are defined
    if (!this.context.chains || this.context.chains.length === 0) {
      console.log('⚠️ No chains defined, returning empty selection')
      return {
        selectedChains: [],
        unselectedChains: [],
        executionPlan: {
          parallel: false,
          maxConcurrency: 1,
          continueOnError: true
        }
      }
    }

    // Check for condition-based routing first
    const conditionBasedSelection = this.evaluateConditions()
    if (conditionBasedSelection.selectedChains.length > 0 && !this.context.config.autoSelectChain) {
      console.log('✅ Using condition-based routing')
      return conditionBasedSelection
    }

    // Use AI for intelligent routing
    try {
      const aiResponse = await this.getAIDecision()
      return this.parseAIResponse(aiResponse)
    } catch (error) {
      console.error('❌ AI decision making failed, falling back to default', error)
      return this.getDefaultSelection()
    }
  }

  /**
   * Evaluate condition-based routing
   */
  private evaluateConditions(): ChainSelectionResult {
    const selected: SelectedChain[] = []
    const unselected: { chainId: string; reasoning: string }[] = []

    this.context.chains.forEach((chain, index) => {
      if (chain.conditions && chain.conditions.length > 0) {
        const conditionsMet = this.checkConditions(chain.conditions)

        if (conditionsMet) {
          selected.push({
            chainId: chain.id,
            reasoning: 'Conditions met for this chain',
            priority: index,
            confidence: 1.0
          })
        } else {
          unselected.push({
            chainId: chain.id,
            reasoning: 'Conditions not met'
          })
        }
      }
    })

    return {
      selectedChains: selected,
      unselectedChains: unselected,
      executionPlan: {
        parallel: this.context.config.parallelExecution,
        maxConcurrency: 3,
        continueOnError: true
      }
    }
  }

  /**
   * Check if conditions are met for a chain
   */
  private checkConditions(conditions: any[]): boolean {
    return conditions.every(condition => {
      const value = this.getValueFromPath(condition.field)

      switch (condition.operator) {
        case 'equals':
          return value === condition.value
        case 'contains':
          return String(value).includes(String(condition.value))
        case 'matches':
          return new RegExp(condition.value).test(String(value))
        case 'exists':
          return value !== undefined && value !== null
        case 'gt':
          return Number(value) > Number(condition.value)
        case 'lt':
          return Number(value) < Number(condition.value)
        default:
          return false
      }
    })
  }

  /**
   * Get value from input data using dot notation path
   */
  private getValueFromPath(path: string): any {
    const parts = path.split('.')
    let value = this.context.input

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part]
      } else {
        return undefined
      }
    }

    return value
  }

  /**
   * Get AI decision for chain selection
   */
  private async getAIDecision(): Promise<string> {
    const prompt = this.buildAnalysisPrompt()
    const systemPrompt = this.buildSystemPrompt()

    console.log('🤖 Requesting AI decision with prompt length:', prompt.length)

    try {
      if (this.context.config.model.includes('gpt')) {
        return await this.getOpenAIDecision(systemPrompt, prompt)
      } else if (this.context.config.model.includes('claude')) {
        return await this.getClaudeDecision(systemPrompt, prompt)
      } else {
        // Use ChainReact's API
        return await this.getChainReactDecision(systemPrompt, prompt)
      }
    } catch (error) {
      console.error('AI decision request failed:', error)
      throw error
    }
  }

  /**
   * Get decision from OpenAI
   */
  private async getOpenAIDecision(systemPrompt: string, userPrompt: string): Promise<string> {
    const client = this.openaiClient || new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    const response = await client.chat.completions.create({
      model: this.context.config.model || 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: this.context.config.temperature,
      response_format: { type: 'json_object' }
    })

    return response.choices[0].message.content || '{}'
  }

  /**
   * Get decision from Claude
   */
  private async getClaudeDecision(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!Anthropic) {
      console.warn('Anthropic SDK not installed, falling back to OpenAI')
      return this.getOpenAIDecision(systemPrompt, userPrompt)
    }

    const client = this.anthropicClient || new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    })

    const response = await client.messages.create({
      model: this.context.config.model || 'claude-3-opus-20240229',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: this.context.config.temperature
    })

    const content = response.content[0]
    return content.type === 'text' ? content.text : '{}'
  }

  /**
   * Get decision from ChainReact's API
   */
  private async getChainReactDecision(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch('/api/ai/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.context.config.model,
        systemPrompt,
        userPrompt,
        temperature: this.context.config.temperature,
        userId: this.context.metadata.userId
      })
    })

    if (!response.ok) {
      throw new Error(`ChainReact API failed: ${response.statusText}`)
    }

    const data = await response.json()
    return data.decision || '{}'
  }

  /**
   * Build system prompt for AI
   */
  private buildSystemPrompt(): string {
    return `You are an intelligent workflow router that analyzes input data and determines which action chains should be executed.

Your task is to:
1. Analyze the input data to understand its content and context
2. Review available action chains and their purposes
3. Select the most appropriate chain(s) to handle the input
4. Provide clear reasoning for your selections
5. Determine if chains should run in parallel or sequence

Return your decision in this exact JSON format:
{
  "selectedChains": [
    {
      "chainId": "chain-id-here",
      "reasoning": "Clear explanation of why this chain was selected",
      "priority": 1,
      "confidence": 0.95,
      "inputMapping": {
        "fieldName": "value to pass to this chain"
      }
    }
  ],
  "unselectedChains": [
    {
      "chainId": "chain-id-here",
      "reasoning": "Why this chain was not selected"
    }
  ],
  "executionPlan": {
    "parallel": false,
    "maxConcurrency": 3,
    "continueOnError": true
  }
}

Guidelines:
- Select chains that are relevant to the input data
- Use parallel execution when chains are independent
- Use sequential execution when chains depend on each other
- Confidence should be between 0 and 1
- Priority determines execution order (lower = higher priority)
- Be concise but clear in your reasoning`
  }

  /**
   * Build analysis prompt with context
   */
  private buildAnalysisPrompt(): string {
    const chainDescriptions = this.context.chains.map(chain => {
      const actions = chain.nodes
        .filter(n => n.data?.type && n.data.type !== 'ai_agent')
        .map(n => n.data.title || n.data.type)
        .join(' → ')

      return `
Chain ID: ${chain.id}
Name: ${chain.name || 'Unnamed Chain'}
Description: ${chain.description || 'No description'}
Actions: ${actions || 'No actions defined'}
${chain.conditions ? `Conditions: ${JSON.stringify(chain.conditions)}` : ''}`
    }).join('\n---\n')

    const inputSummary = JSON.stringify(this.context.input, null, 2)
      .substring(0, 3000) // Limit input size

    return `Analyze this workflow input and determine which action chains to execute:

INPUT DATA:
${inputSummary}

AVAILABLE CHAINS:
${chainDescriptions}

USER INSTRUCTIONS:
${this.context.config.prompt || 'Route to the most appropriate chain(s) based on the input data.'}

Analyze the input carefully and select the appropriate chain(s) to execute. Consider:
1. The type and content of the input data
2. The purpose and capabilities of each chain
3. Whether multiple chains should run
4. The optimal execution order

Provide your routing decision in the specified JSON format.`
  }

  /**
   * Parse AI response into ChainSelectionResult
   */
  private parseAIResponse(response: string): ChainSelectionResult {
    try {
      const parsed = JSON.parse(response)

      // Validate and normalize the response
      const result: ChainSelectionResult = {
        selectedChains: Array.isArray(parsed.selectedChains)
          ? parsed.selectedChains.map(this.normalizeSelectedChain)
          : [],
        unselectedChains: Array.isArray(parsed.unselectedChains)
          ? parsed.unselectedChains
          : [],
        executionPlan: {
          parallel: parsed.executionPlan?.parallel ?? this.context.config.parallelExecution,
          maxConcurrency: parsed.executionPlan?.maxConcurrency ?? 3,
          continueOnError: parsed.executionPlan?.continueOnError ?? true
        }
      }

      console.log(`✅ AI selected ${result.selectedChains.length} chain(s) for execution`)
      return result

    } catch (error) {
      console.error('Failed to parse AI response:', error)
      return this.getDefaultSelection()
    }
  }

  /**
   * Normalize selected chain data
   */
  private normalizeSelectedChain(chain: any): SelectedChain {
    return {
      chainId: String(chain.chainId),
      reasoning: String(chain.reasoning || 'No reasoning provided'),
      priority: Number(chain.priority) || 1,
      confidence: Number(chain.confidence) || 0.5,
      inputMapping: chain.inputMapping || {}
    }
  }

  /**
   * Get default selection when AI fails
   */
  private getDefaultSelection(): ChainSelectionResult {
    // Select first chain as fallback
    const firstChain = this.context.chains[0]

    if (!firstChain) {
      return {
        selectedChains: [],
        unselectedChains: [],
        executionPlan: {
          parallel: false,
          maxConcurrency: 1,
          continueOnError: true
        }
      }
    }

    return {
      selectedChains: [{
        chainId: firstChain.id,
        reasoning: 'Default selection (AI decision unavailable)',
        priority: 1,
        confidence: 0.5
      }],
      unselectedChains: this.context.chains.slice(1).map(chain => ({
        chainId: chain.id,
        reasoning: 'Not selected in default mode'
      })),
      executionPlan: {
        parallel: false,
        maxConcurrency: 1,
        continueOnError: true
      }
    }
  }

  /**
   * Summarize execution results
   */
  async summarizeExecution(
    results: any,
    context: AIAgentExecutionContext
  ): Promise<string> {
    const successful = results.chains.filter((c: any) => c.success).length
    const failed = results.chains.filter((c: any) => !c.success).length

    let summary = `Executed ${results.chains.length} chain(s). `
    summary += `${successful} succeeded, ${failed} failed. `

    if (successful > 0) {
      const chainNames = results.chains
        .filter((c: any) => c.success)
        .map((c: any) => {
          const chain = context.chains.find(ch => ch.id === c.chainId)
          return chain?.name || c.chainId
        })
        .join(', ')

      summary += `Completed: ${chainNames}. `
    }

    if (failed > 0) {
      summary += `Errors encountered in some chains. `
    }

    return summary
  }
}