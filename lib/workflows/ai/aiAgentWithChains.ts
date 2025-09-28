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

    console.log('🤖 AI Agent with chains execution started')
    console.log('📋 Config:', JSON.stringify(config, null, 2))
    console.log('📥 Input data:', JSON.stringify(input, null, 2))

    // Check AI usage limits
    const { checkUsageLimit, trackUsage } = await import('@/lib/usageTracking')
    const usageCheck = await checkUsageLimit(userId, 'ai_agent')
    if (!usageCheck.allowed) {
      console.log('❌ AI usage limit exceeded for user:', userId)
      return {
        success: false,
        error: `AI usage limit exceeded. You've used ${usageCheck.current}/${usageCheck.limit} AI agent executions this month. Please upgrade your plan for more AI usage.`
      }
    }

    // Validate chains are configured
    if (!config.chainsLayout?.chains || config.chainsLayout.chains.length === 0) {
      console.log('⚠️ No chains configured for AI agent')
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
        model: config.model || 'gpt-4',
        prompt: config.prompt || config.masterPrompt,
        temperature: config.temperature || 0.7,
        apiSource: config.apiSource || 'chainreact',
        apiKey: config.apiKey,
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

    console.log('🔧 Execution context built:', {
      chains: context.chains.length,
      nodes: context.chains.reduce((sum, c) => sum + c.nodes.length, 0),
      model: context.config.model,
      parallel: context.config.parallelExecution
    })

    // Initialize components
    const decisionMaker = new AIDecisionMaker(context)
    const executionEngine = new ChainExecutionEngine(context)

    // Step 1: AI analyzes input and selects chains
    console.log('🧠 Step 1: Analyzing input and selecting chains...')
    const chainSelection = await decisionMaker.analyzeAndRoute()

    console.log('📊 Chain selection result:', {
      selected: chainSelection.selectedChains.length,
      unselected: chainSelection.unselectedChains.length,
      parallel: chainSelection.executionPlan.parallel
    })

    // Log reasoning for each selection
    chainSelection.selectedChains.forEach(chain => {
      console.log(`  ✅ Selected: ${chain.chainId} (confidence: ${chain.confidence})`)
      console.log(`     Reason: ${chain.reasoning}`)
    })

    chainSelection.unselectedChains.forEach(chain => {
      console.log(`  ⏭️ Skipped: ${chain.chainId}`)
      console.log(`     Reason: ${chain.reasoning}`)
    })

    // Check if any chains were selected
    if (chainSelection.selectedChains.length === 0) {
      console.log('⚠️ No chains selected for execution')
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
    console.log('⚡ Step 2: Executing selected chains...')
    const executionResult = await executionEngine.executeChains(chainSelection)

    console.log('📋 Execution result:', {
      successful: executionResult.chains.filter(c => c.success).length,
      failed: executionResult.chains.filter(c => !c.success).length,
      errors: executionResult.errors.length
    })

    // Step 3: Generate summary
    console.log('📝 Step 3: Generating execution summary...')
    const summary = await decisionMaker.summarizeExecution(executionResult, context)

    // Track AI usage
    await trackUsage(userId, 'ai_agent', {
      chains: chainSelection.selectedChains.length,
      model: context.config.model
    })

    const executionTime = Date.now() - startTime
    console.log(`✅ AI Agent execution completed in ${executionTime}ms`)

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