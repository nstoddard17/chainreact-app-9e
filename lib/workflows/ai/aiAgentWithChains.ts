/**
 * AI Agent with Chain Execution
 *
 * Main entry point for executing AI agents that have action chains configured.
 * Orchestrates the decision making and chain execution process.
 */

import { AIAgentParams, AIAgentResult } from '../aiAgent'
import { ChainExecutionEngine, AIAgentExecutionContext } from './chainExecutionEngine'
import { AIDecisionMaker } from './aiDecisionMaker'

/**
 * Execute AI Agent with chain-based routing
 */
export async function executeAIAgentWithChains(
  params: AIAgentParams
): Promise<AIAgentResult> {
  const startTime = Date.now()

  try {
    const { userId, config, input, workflowContext } = params


    // Get API key - try user's key first, fallback to platform key
    let apiKey = process.env.OPENAI_API_KEY || '' // Platform key as default
    let usingUserKey = false

    if (config.selectedApiKeyId) {
      // User has explicitly selected their own API key
      const { getUserAPIKey } = await import('@/app/api/user/ai-api-keys/route')
      const userApiKey = await getUserAPIKey(userId, config.selectedApiKeyId)

      if (userApiKey) {
        apiKey = userApiKey
        usingUserKey = true
      }
    }

    if (!apiKey) {
      console.error('No API key available (neither user nor platform)')
      return {
        success: false,
        error: 'No OpenAI API key available. Please configure platform API key or add your own in Settings.'
      }
    }

    console.log(`🔑 Using ${usingUserKey ? 'user' : 'platform'} API key for AI Agent execution`)

    // Check AI usage limits
    const { checkUsageLimit, trackUsage } = await import('@/lib/usageTracking')
    const usageCheck = await checkUsageLimit(userId, 'ai_agent')
    if (!usageCheck.allowed) {
      return {
        success: false,
        error: `AI usage limit exceeded. You've used ${usageCheck.current}/${usageCheck.limit} AI agent executions this month. Please upgrade your plan for more AI usage.`
      }
    }

    // Validate chains are configured
    if (!config.chainsLayout?.chains || config.chainsLayout.chains.length === 0) {
      return {
        success: false,
        error: 'No action chains configured. Please add chains to the AI agent.'
      }
    }

    // Build execution context
    const context: AIAgentExecutionContext = {
      input: {
        triggerData: input.triggerData || input.originalPayload || input,
        workflowData: input.workflowData || input,
        nodeOutputs: input.nodeOutputs || workflowContext?.previousResults || {}
      },
      chains: config.chainsLayout.chains.map((chain: any) => ({
        id: chain.id || `chain-${Date.now()}`,
        name: chain.name || 'Unnamed Chain',
        description: chain.description || '',
        nodes: config.chainsLayout.nodes?.filter((n: any) =>
          // Find nodes that belong to this chain
          n.data?.parentChainIndex === config.chainsLayout.chains.indexOf(chain) ||
          // Also check if node ID indicates it's part of this chain
          (chain.nodes && chain.nodes.some((chainNode: any) => chainNode.id === n.id))
        ) || [],
        edges: config.chainsLayout.edges?.filter((e: any) =>
          // Find edges that connect nodes in this chain
          config.chainsLayout.nodes?.some((n: any) =>
            (n.id === e.source || n.id === e.target) &&
            (n.data?.parentChainIndex === config.chainsLayout.chains.indexOf(chain))
          )
        ) || [],
        conditions: chain.conditions
      })),
      config: {
        model: config.model || 'gpt-4o-mini',
        prompt: config.prompt || config.masterPrompt,
        temperature: config.temperature || 0.7,
        apiKey: apiKey, // Use user's key if provided, otherwise platform key
        autoSelectChain: config.autoSelectChain !== false,
        parallelExecution: config.parallelExecution || false
      },
      metadata: {
        executionId: `exec_${Date.now()}`,
        workflowId: workflowContext?.workflowId || 'unknown',
        userId,
        timestamp: new Date().toISOString(),
        testMode: workflowContext?.testMode || false
      }
    }


    // Initialize components
    const decisionMaker = new AIDecisionMaker(context)
    const executionEngine = new ChainExecutionEngine(context)

    // Step 1: AI analyzes input and selects chains
    const chainSelection = await decisionMaker.analyzeAndRoute()

    console.log(`AI Agent selected ${chainSelection.selectedChains.length} chain(s) for execution`)

    // Log only selected chains with reasoning
    chainSelection.selectedChains.forEach(chain => {
      console.log(`  ✅ ${chain.chainId}: ${chain.reasoning}`)
    })

    // Check if any chains were selected
    if (chainSelection.selectedChains.length === 0) {
      return {
        success: true,
        output: {
          message: 'No action chains matched the input criteria.',
          selection: chainSelection
        },
        message: 'No chains were selected for execution based on the input.'
      }
    }

    // Step 2: Execute selected chains
    const executionResult = await executionEngine.executeChains(chainSelection)

    // Step 3: Generate summary
    const summary = await decisionMaker.summarizeExecution(executionResult, context)

    // Track AI usage
    await trackUsage(userId, 'ai_agent', {
      chains: chainSelection.selectedChains.length,
      model: context.config.model
    })

    const executionTime = Date.now() - startTime
    console.log(`AI Agent execution completed in ${executionTime}ms`)

    // Return results
    return {
      success: executionResult.errors.length === 0,
      output: {
        chainResults: executionResult.chains,
        summary: summary,
        selection: chainSelection,
        executionTime: executionTime
      },
      message: summary,
      steps: executionResult.chains.map((chain, i) => ({
        step: i + 1,
        action: `Execute ${chain.chainId}`,
        tool: chain.chainId,
        input: chainSelection.selectedChains.find(c => c.chainId === chain.chainId)?.inputMapping,
        output: chain.output,
        reasoning: chainSelection.selectedChains.find(
          c => c.chainId === chain.chainId
        )?.reasoning || '',
        success: chain.success,
        error: chain.error
      }))
    }

  } catch (error: any) {
    console.error('❌ AI Agent with chains execution failed:', error)
    return {
      success: false,
      error: error.message || 'Failed to execute AI agent with chains',
      message: `Execution failed: ${error.message}`
    }
  }
}