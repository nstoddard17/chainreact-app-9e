# AI Agent Execution Architecture

## Overview
This architecture enables AI agents to analyze workflow inputs and intelligently route them to appropriate action chains, similar to N8N's workflow execution model but enhanced with AI decision-making capabilities.

## Core Components

### 1. AI Agent Execution Context
```typescript
interface AIAgentExecutionContext {
  // Input data from trigger or previous nodes
  input: {
    triggerData: any           // Original trigger payload
    workflowData: any           // Accumulated workflow data
    nodeOutputs: Record<string, any>  // Previous node outputs
  }

  // Chain definitions from AI agent configuration
  chains: {
    id: string
    name: string
    description: string
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
    conditions?: {             // Optional conditions for chain selection
      field: string
      operator: 'equals' | 'contains' | 'matches' | 'exists'
      value: any
    }[]
  }[]

  // AI agent configuration
  config: {
    model: string              // AI model to use (gpt-4, claude-3, etc)
    prompt: string             // Master prompt for decision making
    temperature: number        // AI creativity level
    apiSource: 'chainreact' | 'custom'
    apiKey?: string            // Custom API key if needed
    autoSelectChain: boolean   // Let AI automatically select chains
    parallelExecution: boolean // Execute multiple chains in parallel
  }

  // Execution metadata
  metadata: {
    executionId: string
    workflowId: string
    userId: string
    timestamp: string
    testMode: boolean
  }
}
```

### 2. Chain Selection Strategy
The AI agent uses a multi-step process to select which chains to execute:

```typescript
interface ChainSelectionResult {
  selectedChains: {
    chainId: string
    reasoning: string
    priority: number          // Execution order
    confidence: number        // AI confidence score (0-1)
    inputMapping: Record<string, any>  // Chain-specific input data
  }[]

  unselectedChains: {
    chainId: string
    reasoning: string         // Why this chain wasn't selected
  }[]

  executionPlan: {
    parallel: boolean         // Execute chains in parallel or sequence
    maxConcurrency: number    // Max parallel executions
    continueOnError: boolean  // Continue if a chain fails
  }
}
```

### 3. Chain Execution Engine
```typescript
class ChainExecutionEngine {
  async executeChains(
    context: AIAgentExecutionContext,
    selection: ChainSelectionResult
  ): Promise<ChainExecutionResult> {
    const results: ChainExecutionResult = {
      chains: [],
      summary: null,
      errors: []
    }

    // Execute chains based on execution plan
    if (selection.executionPlan.parallel) {
      // Parallel execution with concurrency control
      const chunks = this.chunkChains(
        selection.selectedChains,
        selection.executionPlan.maxConcurrency
      )

      for (const chunk of chunks) {
        const chunkResults = await Promise.allSettled(
          chunk.map(chain => this.executeChain(chain, context))
        )
        results.chains.push(...this.processResults(chunkResults))
      }
    } else {
      // Sequential execution with data flow
      let flowData = context.input

      for (const chain of selection.selectedChains) {
        const result = await this.executeChain(chain, {
          ...context,
          input: { ...context.input, ...flowData }
        })

        if (result.success) {
          // Pass output to next chain
          flowData = { ...flowData, ...result.output }
          results.chains.push(result)
        } else if (!selection.executionPlan.continueOnError) {
          results.errors.push(result.error)
          break
        }
      }
    }

    return results
  }

  private async executeChain(
    chain: SelectedChain,
    context: AIAgentExecutionContext
  ): Promise<ChainResult> {
    // Execute individual chain nodes
    const nodes = context.chains.find(c => c.id === chain.chainId)?.nodes || []
    let nodeResults = {}

    for (const node of nodes) {
      // Handle AI field placeholders
      const config = await this.resolveAIFields(node.config, context)

      // Execute node action
      const result = await this.executeNode(node, config, {
        ...context,
        nodeOutputs: nodeResults
      })

      nodeResults[node.id] = result
    }

    return {
      chainId: chain.chainId,
      success: true,
      output: nodeResults,
      executionTime: Date.now() - startTime
    }
  }

  private async resolveAIFields(
    config: Record<string, any>,
    context: AIAgentExecutionContext
  ): Promise<Record<string, any>> {
    const resolved = { ...config }

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string' && value.startsWith('{{AI_FIELD:')) {
        // Extract field name
        const fieldName = value.match(/{{AI_FIELD:(.+)}}/)?.[1]

        if (fieldName) {
          // Generate value using AI
          resolved[key] = await this.generateFieldValue(
            fieldName,
            context
          )
        }
      }
    }

    return resolved
  }
}
```

### 4. AI Decision Making Process
```typescript
class AIDecisionMaker {
  async analyzeAndRoute(
    context: AIAgentExecutionContext
  ): Promise<ChainSelectionResult> {
    // Build analysis prompt
    const prompt = this.buildAnalysisPrompt(context)

    // Get AI decision
    const aiResponse = await this.callAIModel({
      model: context.config.model,
      prompt: prompt,
      temperature: context.config.temperature,
      systemPrompt: `You are an intelligent workflow router. Analyze the input data and determine which action chains should be executed based on the content and context.

Available chains:
${context.chains.map(c => `- ${c.name}: ${c.description}`).join('\n')}

Return your decision in this JSON format:
{
  "selectedChains": [
    {
      "chainId": "chain-1",
      "reasoning": "This email contains a customer support request",
      "priority": 1,
      "confidence": 0.95,
      "inputMapping": {
        "customerEmail": "{{input.email}}",
        "issueType": "technical"
      }
    }
  ],
  "executionPlan": {
    "parallel": false,
    "continueOnError": true
  }
}`
    })

    return this.parseAIResponse(aiResponse)
  }

  private buildAnalysisPrompt(context: AIAgentExecutionContext): string {
    return `Analyze this workflow input and determine which action chains to execute:

INPUT DATA:
${JSON.stringify(context.input, null, 2)}

AVAILABLE CHAINS:
${context.chains.map(chain => {
  return `
Chain: ${chain.name}
Description: ${chain.description}
Actions: ${chain.nodes.map(n => n.data?.title).join(' → ')}
${chain.conditions ? `Conditions: ${JSON.stringify(chain.conditions)}` : ''}
`
}).join('\n---\n')}

USER INSTRUCTIONS:
${context.config.prompt || 'Route to the most appropriate chain(s) based on the input data.'}

Analyze the input and select the appropriate chain(s) to execute.`
  }
}
```

### 5. Integration with Existing Workflow

#### Update AI Agent Node Handler
```typescript
// In executeNode.ts or aiAgent.ts
export async function executeAIAgentWithChains(
  params: AIAgentParams
): Promise<AIAgentResult> {
  const { userId, config, input, workflowContext } = params

  // Build execution context
  const context: AIAgentExecutionContext = {
    input: {
      triggerData: input.originalPayload || input,
      workflowData: input,
      nodeOutputs: workflowContext?.previousResults || {}
    },
    chains: config.chainsLayout?.chains || [],
    config: {
      model: config.model || 'gpt-4',
      prompt: config.prompt,
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

  // Initialize components
  const decisionMaker = new AIDecisionMaker()
  const executionEngine = new ChainExecutionEngine()

  // Step 1: AI analyzes input and selects chains
  const chainSelection = await decisionMaker.analyzeAndRoute(context)

  // Step 2: Execute selected chains
  const executionResult = await executionEngine.executeChains(
    context,
    chainSelection
  )

  // Step 3: Summarize results
  const summary = await decisionMaker.summarizeExecution(
    executionResult,
    context
  )

  return {
    success: executionResult.errors.length === 0,
    output: {
      chainResults: executionResult.chains,
      summary: summary,
      selection: chainSelection
    },
    message: summary,
    steps: executionResult.chains.map((chain, i) => ({
      step: i + 1,
      action: `Execute ${chain.chainId}`,
      tool: chain.chainId,
      input: chain.input,
      output: chain.output,
      reasoning: chainSelection.selectedChains.find(
        c => c.chainId === chain.chainId
      )?.reasoning || '',
      success: chain.success
    }))
  }
}
```

## Example Use Cases

### 1. Customer Support Router
```javascript
// AI Agent analyzes incoming support email and routes to appropriate chain:
// - Technical issues → Technical Support Chain (create Jira ticket, notify engineer)
// - Billing issues → Billing Chain (check Stripe, create invoice adjustment)
// - General inquiry → FAQ Chain (search knowledge base, send response)
```

### 2. Social Media Manager
```javascript
// AI Agent analyzes social media mentions and:
// - Positive feedback → Engagement Chain (like, thank user, log in CRM)
// - Complaint → Support Chain (create ticket, alert team, draft response)
// - Question → Answer Chain (search docs, generate response, post reply)
```

### 3. E-commerce Order Processor
```javascript
// AI Agent processes order and executes multiple chains in parallel:
// - Inventory Chain (check stock, reserve items)
// - Payment Chain (process payment, send receipt)
// - Shipping Chain (create label, notify warehouse)
// - Customer Chain (send confirmation, update CRM)
```

## Implementation Steps

1. **Update AI Agent Configuration Modal**
   - Already supports chain building ✓
   - Add chain selection conditions UI
   - Add execution plan settings (parallel/sequential)

2. **Create Chain Execution Engine**
   - Build ChainExecutionEngine class
   - Implement parallel/sequential execution
   - Add error handling and retry logic

3. **Enhance AI Decision Maker**
   - Create prompt templates for chain analysis
   - Implement confidence scoring
   - Add chain selection logic

4. **Update Execution Engine**
   - Modify advancedExecutionEngine.ts to use new AI agent handler
   - Add support for chain execution results
   - Implement data flow between chains

5. **Add Field Value Generation**
   - Create AI field resolver
   - Cache generated values
   - Support different field types (text, number, boolean, etc)

## Benefits

1. **Intelligent Routing**: AI automatically determines the best chain(s) to execute
2. **Parallel Processing**: Execute multiple chains simultaneously for faster processing
3. **Context Awareness**: AI understands the full context and makes informed decisions
4. **Dynamic Configuration**: AI can generate field values on the fly
5. **Scalability**: Add new chains without changing core logic
6. **Flexibility**: Chains can be simple (single action) or complex (multi-step workflows)