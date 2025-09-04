import { OpenAI } from "openai"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import { NodeComponent } from "@/lib/workflows/nodes/types"
import { nodeRegistry, getAllNodes, getNodeByType } from "@/lib/workflows/nodes/registry"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface WorkflowGenerationRequest {
  prompt: string
  userId: string
  model?: 'gpt-4o' | 'gpt-4o-mini'  // Optional model selection, defaults to gpt-4o-mini for cost
}

export interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    title: string
    type: string
    config: Record<string, any>
    isTrigger?: boolean
    providerId?: string
  }
}

export interface WorkflowConnection {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface GeneratedWorkflow {
  name: string
  description: string
  nodes: WorkflowNode[]
  connections: WorkflowConnection[]
}

/**
 * Step 1: Dynamically generate prompt with actual available nodes
 */
function generateDynamicPrompt(): string {
  // Register all nodes if not already registered
  if (getAllNodes().length === 0) {
    nodeRegistry.registerNodes(ALL_NODE_COMPONENTS)
  }

  const allNodes = getAllNodes()
  // Filter out coming soon nodes - IMPORTANT: Must check comingSoon flag
  const availableNodes = allNodes.filter(node => !node.comingSoon && node.comingSoon !== true)
  const triggerNodes = availableNodes.filter(node => node.isTrigger)
  const actionNodes = availableNodes.filter(node => !node.isTrigger && node.type !== 'ai_agent')
  
  // Group triggers by provider for better organization
  const triggersByProvider = new Map<string, NodeComponent[]>()
  triggerNodes.forEach(node => {
    const providerId = node.providerId || 'generic'
    const nodes = triggersByProvider.get(providerId) || []
    nodes.push(node)
    triggersByProvider.set(providerId, nodes)
  })

  // Group actions by provider
  const actionsByProvider = new Map<string, NodeComponent[]>()
  actionNodes.forEach(node => {
    const providerId = node.providerId || 'generic'
    const nodes = actionsByProvider.get(providerId) || []
    nodes.push(node)
    actionsByProvider.set(providerId, nodes)
  })

  // Build trigger list
  let triggerList = "AVAILABLE TRIGGERS (use ONLY these exact types):\n"
  for (const [provider, nodes] of triggersByProvider) {
    triggerList += `\n${provider.toUpperCase()}:\n`
    nodes.forEach(node => {
      triggerList += `- ${node.type}: ${node.title} - ${node.description || 'No description'}\n`
    })
  }

  // Build action list
  let actionList = "AVAILABLE ACTIONS FOR CHAINS (use ONLY these exact types):\n"
  for (const [provider, nodes] of actionsByProvider) {
    actionList += `\n${provider.toUpperCase()}:\n`
    nodes.forEach(node => {
      // Only include actions that can be used in AI chains
      if (!node.type.includes('trigger') && !node.type.includes('webhook')) {
        actionList += `- ${node.type}: ${node.title} - ${node.description || 'No description'}\n`
      }
    })
  }

  return `
You are an expert workflow automation architect for ChainReact. Create sophisticated workflows with AI Agent chains.

CRITICAL: The AI Agent is the CENTRAL component that uses a chain-based architecture where:
1. AI Agent analyzes input and decides which chains to execute
2. Each chain can have multiple actions
3. All actions can use AI configuration (aiConfigured: true) where AI decides field values at runtime
4. The AI can execute multiple chains in parallel based on the input

WORKFLOW STRUCTURE:
1. ALWAYS start with a trigger
2. Connect trigger to AI Agent 
3. AI Agent contains chains with actions (no separate action nodes needed after AI Agent)
4. Each chain represents a different workflow path the AI can take

${triggerList}

${actionList}

RESPONSE FORMAT:
{
  "name": "Workflow Name",
  "description": "Brief description",
  "nodes": [
    {
      "id": "trigger-[timestamp]",
      "type": "custom",
      "position": {"x": 400, "y": 100},
      "data": {
        "label": "Trigger Label",
        "title": "Provider: Trigger Name",
        "type": "[exact_trigger_type]",
        "isTrigger": true,
        "providerId": "[provider]",
        "config": {}
      }
    },
    {
      "id": "node-[timestamp]",
      "type": "custom", 
      "position": {"x": 400, "y": 300},
      "data": {
        "label": "AI Agent",
        "title": "AI Agent",
        "type": "ai_agent",
        "isTrigger": false,
        "providerId": "ai",
        "config": {
          "model": "gpt-4-turbo",
          "chains": [
            {
              "id": "chain-1",
              "name": "Chain Name",
              "description": "What this chain does",
              "actions": [
                {
                  "type": "[exact_action_type]",
                  "providerId": "[provider]",
                  "aiConfigured": true,
                  "label": "Action Label"
                }
              ]
            }
          ]
        }
      }
    }
  ],
  "connections": [
    {
      "id": "edge-1",
      "source": "trigger-[timestamp]",
      "target": "node-[timestamp]"
    }
  ]
}

IMPORTANT RULES:
1. Use timestamps for IDs (e.g., trigger-1234567890, node-1234567891)
2. DO NOT include systemPrompt in AI Agent config - the master prompt handles everything
3. Each chain should have 3-4 relevant actions that work together logically
4. Create at least 2-3 chains to demonstrate comprehensive workflow capabilities
5. All actions MUST use EXACT types from the lists above
6. Every action must have aiConfigured: true and a descriptive label
7. ONLY use the actions and triggers listed above - do NOT make up or imagine any integrations
8. Return ONLY valid JSON without any markdown or explanation

Generate the workflow now.
`
}

/**
 * Step 2: Validate and fix generated nodes with proper titles
 */
function validateAndFixNodes(workflow: GeneratedWorkflow): { valid: boolean; workflow: GeneratedWorkflow; errors: string[] } {
  const errors: string[] = []
  
  // Register nodes if not already done
  if (getAllNodes().length === 0) {
    nodeRegistry.registerNodes(ALL_NODE_COMPONENTS)
  }

  // Process each node
  workflow.nodes = workflow.nodes.map(node => {
    // Skip AI Agent nodes as they're special
    if (node.data.type === 'ai_agent') {
      node.data.label = "AI Agent"
      node.data.title = "AI Agent"
      
      // Validate actions in chains
      if (node.data.config?.chains) {
        // Filter out invalid chains
        node.data.config.chains = node.data.config.chains.map((chain: any, chainIdx: number) => {
          if (chain.actions) {
            // Filter out invalid or coming soon actions
            const validActions = chain.actions.filter((action: any, actionIdx: number) => {
              const actionComponent = getNodeByType(action.type)
              if (!actionComponent) {
                errors.push(`Chain ${chainIdx + 1}, Action ${actionIdx + 1}: Unknown action type '${action.type}'`)
                return false
              }
              if (actionComponent.comingSoon) {
                errors.push(`Chain ${chainIdx + 1}, Action ${actionIdx + 1}: Action '${action.type}' is coming soon`)
                return false
              }
              // Use the actual title from the component
              action.label = actionComponent.title
              return true
            })
            chain.actions = validActions
          }
          return chain
        }).filter((chain: any) => chain.actions && chain.actions.length > 0) // Remove empty chains
      }
      return node
    }

    // Look up the node component
    const nodeComponent = getNodeByType(node.data.type)
    
    if (!nodeComponent) {
      errors.push(`Unknown node type: ${node.data.type}`)
      return null // Mark for removal
    }
    
    if (nodeComponent.comingSoon) {
      errors.push(`Node type '${node.data.type}' is coming soon and not available`)
      return null // Mark for removal
    }

    // Step 2: Overwrite label and title with component's actual title
    node.data.label = nodeComponent.title
    node.data.title = nodeComponent.title
    node.data.providerId = nodeComponent.providerId || node.data.providerId
    node.data.isTrigger = nodeComponent.isTrigger

    return node
  }).filter(node => node !== null) // Remove invalid nodes

  return {
    valid: errors.length === 0,
    workflow: {
      ...workflow,
      nodes: workflow.nodes
    },
    errors
  }
}

/**
 * Step 3: Enhanced chain expansion with vertical layout
 */
function expandAIAgentChainsVertical(workflow: GeneratedWorkflow): GeneratedWorkflow {
  const expandedNodes: WorkflowNode[] = []
  const expandedConnections: WorkflowConnection[] = []
  
  // Process each node
  workflow.nodes.forEach(node => {
    expandedNodes.push(node)
    
    // Check if this is an AI Agent node with chains
    if (node.data.type === 'ai_agent' && node.data.config?.chains?.length > 0) {
      const aiAgentId = node.id
      const aiAgentNode = node
      const chains = node.data.config.chains
      
      // Step 3: Generate visual nodes for each chain with vertical layout
      // Position chains evenly spaced around the AI Agent
      const aiAgentX = aiAgentNode.position.x
      const chainSpacing = 450 // Horizontal space between chain centers (increased to prevent overlaps)
      const totalChains = chains.length
      
      // Calculate starting X position to center all chains around AI Agent
      // For 3 chains: positions would be at -450, 0, +450 relative to center
      const startOffset = -((totalChains - 1) * chainSpacing) / 2
      
      chains.forEach((chain: any, chainIndex: number) => {
        // Each chain is evenly spaced from the AI Agent center
        const chainX = aiAgentX + startOffset + (chainIndex * chainSpacing)
        // Start position for first action in chain - below the AI Agent
        let yPosition = aiAgentNode.position.y + 200 // Start below AI Agent
        const ySpacing = 150 // Vertical space between actions
        
        let previousNodeId: string | null = null
        
        // Create action nodes for this chain
        if (chain.actions && Array.isArray(chain.actions)) {
          chain.actions.forEach((action: any, actionIndex: number) => {
            const timestamp = Date.now() + chainIndex * 1000 + actionIndex
            const actionNodeId = `${aiAgentId}-chain${chainIndex + 1}-action${actionIndex + 1}-${timestamp}`
            
            // Look up the actual node component for proper title
            const nodeComponent = getNodeByType(action.type)
            const nodeTitle = nodeComponent?.title || action.label || action.type
            
            // Create the action node with vertical positioning
            expandedNodes.push({
              id: actionNodeId,
              type: "custom",
              position: { 
                x: chainX, // Fixed x per chain
                y: yPosition + (actionIndex * ySpacing) // Increment y for each action
              },
              data: {
                label: nodeTitle,
                title: nodeTitle,
                type: action.type,
                providerId: action.providerId,
                isTrigger: false,
                config: action.aiConfigured ? { 
                  aiConfigured: true,
                  _allFieldsAI: true 
                } : (action.config || {}),
                parentAIAgentId: aiAgentId
              }
            })
            
            // Step 3.3: Create edges following vertical order
            if (actionIndex === 0) {
              // Connect AI Agent to first action
              expandedConnections.push({
                id: `edge-${aiAgentId}-to-${actionNodeId}`,
                source: aiAgentId,
                target: actionNodeId
              })
            } else if (previousNodeId) {
              // Connect previous action to current action (vertical flow)
              expandedConnections.push({
                id: `edge-${previousNodeId}-to-${actionNodeId}`,
                source: previousNodeId,
                target: actionNodeId
              })
            }
            
            previousNodeId = actionNodeId
          })
          
          // Don't add "Add Action" nodes for AI-generated workflows
          // as they show as "Unnamed Action" and aren't necessary
        }
      })
    }
  })
  
  // Copy original connections (except ones that might conflict)
  workflow.connections.forEach(conn => {
    // Only add connections that aren't duplicates
    if (!expandedConnections.find(c => c.source === conn.source && c.target === conn.target)) {
      expandedConnections.push(conn)
    }
  })
  
  return {
    ...workflow,
    nodes: expandedNodes,
    connections: expandedConnections
  }
}

/**
 * Main function to generate workflow with dynamic nodes
 */
export async function generateDynamicWorkflow(request: WorkflowGenerationRequest): Promise<GeneratedWorkflow> {
  try {
    // Generate timestamp for unique IDs
    const timestamp = Date.now()
    const triggerId = `trigger-${timestamp}`
    const aiAgentId = `node-${timestamp + 1}`

    // Step 1: Generate dynamic prompt with actual available nodes
    const dynamicPrompt = generateDynamicPrompt()

    // Use the model from request, default to gpt-4o-mini for cost efficiency
    const model = request.model || 'gpt-4o-mini'

    try {
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content: dynamicPrompt,
          },
          {
            role: "user",
            content: `Create a workflow for: ${request.prompt}

Use these exact IDs:
- Trigger ID: ${triggerId}
- AI Agent ID: ${aiAgentId}

Respond with ONLY valid JSON.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: "json_object" },
      })

      const response = completion.choices[0]?.message?.content
      if (!response) {
        // Fallback to a default workflow
        return createDefaultWorkflow(triggerId, aiAgentId)
      }

      const generatedWorkflow = JSON.parse(response) as GeneratedWorkflow
      
      // Step 2: Validate and fix nodes with proper titles
      const { valid, workflow, errors } = validateAndFixNodes(generatedWorkflow)
      
      if (!valid) {
        console.error("Workflow validation errors:", errors)
        // Could still return the workflow but flag it for review
      }

      // Step 3: Expand chains with vertical layout
      return expandAIAgentChainsVertical(workflow)
      
    } catch (aiError: any) {
      console.error("OpenAI generation failed, using fallback:", aiError.message)
      return createDefaultWorkflow(triggerId, aiAgentId)
    }
  } catch (error) {
    console.error("Error generating dynamic workflow:", error)
    const timestamp = Date.now()
    return createDefaultWorkflow(`trigger-${timestamp}`, `node-${timestamp + 1}`)
  }
}

/**
 * Create a default workflow as fallback
 */
function createDefaultWorkflow(triggerId: string, aiAgentId: string): GeneratedWorkflow {
  // Register nodes if not already done
  if (getAllNodes().length === 0) {
    nodeRegistry.registerNodes(ALL_NODE_COMPONENTS)
  }

  const nodes: WorkflowNode[] = []
  const connections: WorkflowConnection[] = []
  
  // Use actual registered nodes for the default workflow
  const gmailTrigger = getNodeByType("gmail_trigger_new_email")
  const slackAction = getNodeByType("slack_action_send_message")
  const notionAction = getNodeByType("notion_action_create_page")
  
  if (!gmailTrigger) {
    throw new Error("Gmail trigger not found in registry")
  }

  // Add trigger node with proper title
  nodes.push({
    id: triggerId,
    type: "custom",
    position: { x: 400, y: 100 },
    data: {
      label: gmailTrigger.title,
      title: gmailTrigger.title,
      type: gmailTrigger.type,
      isTrigger: true,
      providerId: gmailTrigger.providerId,
      config: {}
    }
  })
  
  // Build chains with available actions
  const chains = []
  
  if (notionAction && slackAction) {
    chains.push({
      id: "chain-1",
      name: "Process Email",
      description: "Handle incoming emails",
      actions: [
        { 
          type: notionAction.type, 
          providerId: notionAction.providerId, 
          aiConfigured: true, 
          label: notionAction.title 
        },
        { 
          type: slackAction.type, 
          providerId: slackAction.providerId, 
          aiConfigured: true, 
          label: slackAction.title 
        }
      ]
    })
  }

  // Add AI Agent node
  nodes.push({
    id: aiAgentId,
    type: "custom",
    position: { x: 400, y: 300 },
    data: {
      label: "AI Agent",
      title: "AI Agent",
      type: "ai_agent",
      isTrigger: false,
      providerId: "ai",
      config: {
        model: "gpt-4-turbo",
        chains: chains
      }
    }
  })
  
  // Connect trigger to AI Agent
  connections.push({
    id: "edge-1",
    source: triggerId,
    target: aiAgentId
  })
  
  // Expand the chains with vertical layout
  const workflow = {
    name: "Email Processing Workflow",
    description: "Process incoming emails with AI",
    nodes,
    connections
  }
  
  return expandAIAgentChainsVertical(workflow)
}