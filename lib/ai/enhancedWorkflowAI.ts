import { OpenAI } from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface WorkflowGenerationRequest {
  prompt: string
  userId: string
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

const ENHANCED_WORKFLOW_GENERATION_PROMPT = `
You are an expert workflow automation architect for ChainReact. Create sophisticated workflows with AI Agent chains.

CRITICAL: The AI Agent is the CENTRAL component that uses a chain-based architecture where:
1. AI Agent analyzes input and decides which chains to execute
2. Each chain can have multiple actions
3. All actions can use AI configuration (aiConfigured: true) where AI decides field values at runtime
4. The AI can execute multiple chains in parallel based on the input

WORKFLOW STRUCTURE:
1. ALWAYS start with a trigger (gmail_trigger_new_email is most common for support workflows)
2. Connect trigger to AI Agent 
3. AI Agent contains chains with actions (no separate action nodes needed after AI Agent)
4. Each chain represents a different workflow path the AI can take

AVAILABLE TRIGGERS (use these exact types):
- gmail_trigger_new_email: New Gmail email received
- slack_trigger_new_message: New Slack message
- discord_trigger_new_message: New Discord message
- webhook: HTTP webhook trigger
- schedule: Scheduled trigger
- manual: Manual trigger
- notion_trigger_new_page: New Notion page created
- airtable_trigger_new_record: New Airtable record
- github_trigger_new_commit: New GitHub commit
- stripe_trigger_new_payment: New Stripe payment
- shopify_trigger_new_order: New Shopify order

AVAILABLE ACTIONS FOR CHAINS (use ONLY these exact types - NO CUSTOM NAMES):
- gmail_action_send_email: Send Gmail email
- slack_action_send_message: Send Slack message  
- discord_action_send_message: Send Discord message
- notion_action_create_page: Create Notion page
- notion_action_search_pages: Search Notion pages
- notion_action_update_page: Update Notion page
- airtable_action_create_record: Create Airtable record
- airtable_action_update_record: Update Airtable record
- airtable_action_list_records: List Airtable records
- google_calendar_action_create_event: Create calendar event
- google_sheets_unified_action: Add/update/delete rows in Google Sheets
- google_sheets_action_read_data: Read Google Sheets data
- google_docs_action_create_document: Create Google Doc
- google_docs_action_update_document: Update Google Doc
- trello_action_create_card: Create Trello card
- stripe_action_create_customer: Create Stripe customer
- hubspot_action_update_deal: Update HubSpot deal
- hubspot_action_create_contact: Create HubSpot contact
- hubspot_action_create_company: Create HubSpot company
- hubspot_action_create_deal: Create HubSpot deal

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
          "systemPrompt": "[Comprehensive prompt explaining what the AI should do]",
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

CUSTOMER SUPPORT WORKFLOW TEMPLATE:
For customer support workflows, use this EXACT pattern with ONLY valid action types:
- Trigger: gmail_trigger_new_email
- AI Agent with 6 chains for complete coverage:
  1. Ticket Classification: notion_action_create_page + slack_action_send_message
  2. FAQ Resolution: notion_action_search_pages + gmail_action_send_email
  3. Escalation: notion_action_create_page + slack_action_send_message + google_calendar_action_create_event
  4. Follow-ups: notion_action_search_pages + gmail_action_send_email
  5. Feedback Collection: google_sheets_unified_action + slack_action_send_message
  6. Order Processing: stripe_action_create_customer + hubspot_action_update_deal + gmail_action_send_email

CRITICAL: ONLY use action types from the AVAILABLE ACTIONS list above. Do NOT create custom action names!

AI Agent system prompt should be comprehensive and explain:
- What each chain does
- When to trigger each chain
- How to analyze input to decide which chains to execute
- That multiple chains can be executed in parallel

IMPORTANT RULES:
1. Use timestamps for IDs (e.g., trigger-1234567890, node-1234567891)
2. AI Agent should have a DETAILED systemPrompt (minimum 200 words) explaining:
   - The AI's role and purpose
   - Specific instructions for each chain
   - How to analyze inputs and decide which chains to execute
   - Examples of when to use each chain
3. Each chain should have:
   - Clear, descriptive name (2-3 words)
   - Detailed description (10-20 words)
   - 2-4 relevant actions that work together
4. All actions in chains MUST:
   - Use EXACT type from AVAILABLE ACTIONS list (NO CUSTOM NAMES!)
   - Have aiConfigured: true
   - Have label: descriptive name for the UI display
   - Have correct providerId matching the action
5. Position nodes: trigger at y:100, AI Agent at y:300
6. providerId must match exactly:
   - "gmail" for Gmail actions
   - "slack" for Slack actions
   - "notion" for Notion actions
   - "google-sheets" for Google Sheets (with hyphen!)
   - "google-calendar" for Calendar
   - "stripe" for Stripe
   - "hubspot" for HubSpot
7. VALIDATION: Every action type MUST exist in the AVAILABLE ACTIONS list above
8. Return ONLY valid JSON without any markdown or explanation

EXAMPLE SYSTEM PROMPT FOR CUSTOMER SUPPORT:
"You are an intelligent customer support AI assistant. Your role is to analyze incoming support emails and automatically execute the appropriate workflow chains based on the content, urgency, and context of each inquiry.

Analyze each email for:
- Keywords indicating the type of request
- Sentiment and urgency level
- Whether it's a new issue or follow-up
- Customer tier or importance

Execute chains based on these rules:
- Chain 1 (Ticket Classification): For new support requests that need tracking
- Chain 2 (FAQ Resolution): For common questions that can be answered automatically
- Chain 3 (Escalation): For urgent issues, angry customers, or VIP accounts
- Chain 4 (Follow-ups): For emails referencing existing tickets
- Chain 5 (Feedback): For feedback, testimonials, or satisfaction surveys
- Chain 6 (Order Issues): For payment, billing, or order-related problems

You may execute multiple chains in parallel when appropriate. For example, create a ticket AND send an immediate response."

Generate the workflow now.
`

// Helper function to expand AI Agent chains into visual nodes
function expandAIAgentChains(workflow: GeneratedWorkflow): GeneratedWorkflow {
  const expandedNodes: WorkflowNode[] = []
  const expandedConnections: WorkflowConnection[] = []
  
  // Process each node
  workflow.nodes.forEach(node => {
    expandedNodes.push(node)
    
    // Check if this is an AI Agent node with chains
    if (node.data.type === 'ai_agent' && node.data.config?.chains?.length > 0) {
      const aiAgentId = node.id
      const chains = node.data.config.chains
      
      // Generate visual nodes for each chain
      let baseX = node.position.x + 350 // Start chains to the right of AI Agent
      
      chains.forEach((chain: any, chainIndex: number) => {
        let yPosition = node.position.y - 100 + (chainIndex * 180) // Space chains vertically
        let previousNodeId: string | null = null
        
        // Create action nodes for this chain
        if (chain.actions && Array.isArray(chain.actions)) {
          chain.actions.forEach((action: any, actionIndex: number) => {
            const timestamp = Date.now() + chainIndex * 1000 + actionIndex
            const actionNodeId = `${aiAgentId}-chain${chainIndex + 1}-action${actionIndex + 1}-${timestamp}`
            
            // Create the action node
            expandedNodes.push({
              id: actionNodeId,
              type: "custom",
              position: { 
                x: baseX + (actionIndex * 250), 
                y: yPosition 
              },
              data: {
                label: action.label || action.type,
                title: action.label || action.type,
                type: action.type,
                providerId: action.providerId,
                isTrigger: false,
                config: action.aiConfigured ? { 
                  aiConfigured: true,
                  // Mark all fields as AI-configured
                  _allFieldsAI: true 
                } : (action.config || {}),
                parentAIAgentId: aiAgentId
              }
            })
            
            // Create edge from AI Agent or previous action
            if (actionIndex === 0) {
              // Connect AI Agent to first action
              expandedConnections.push({
                id: `edge-${aiAgentId}-to-${actionNodeId}`,
                source: aiAgentId,
                target: actionNodeId
              })
            } else if (previousNodeId) {
              // Connect previous action to current action
              expandedConnections.push({
                id: `edge-${previousNodeId}-to-${actionNodeId}`,
                source: previousNodeId,
                target: actionNodeId
              })
            }
            
            previousNodeId = actionNodeId
          })
          
          // Add an "Add Action" node at the end of each chain
          if (previousNodeId) {
            const addActionNodeId = `add-action-${aiAgentId}-chain${chainIndex + 1}-${Date.now()}`
            expandedNodes.push({
              id: addActionNodeId,
              type: "addAction",
              position: { 
                x: baseX + (chain.actions.length * 250), 
                y: yPosition 
              },
              data: {
                parentId: previousNodeId,
                parentAIAgentId: aiAgentId,
                onAddAction: () => {} // Will be handled by the workflow builder
              }
            })
            
            // Connect last action to Add Action node
            expandedConnections.push({
              id: `edge-${previousNodeId}-to-${addActionNodeId}`,
              source: previousNodeId,
              target: addActionNodeId
            })
          }
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

export async function generateEnhancedWorkflow(request: WorkflowGenerationRequest): Promise<GeneratedWorkflow> {
  try {
    // Generate timestamp for unique IDs
    const timestamp = Date.now()
    const triggerId = `trigger-${timestamp}`
    const aiAgentId = `node-${timestamp + 1}`

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: ENHANCED_WORKFLOW_GENERATION_PROMPT,
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
        // Fallback to a default customer support workflow
        return createDefaultCustomerSupportWorkflow(triggerId, aiAgentId)
      }

      const workflow = JSON.parse(response) as GeneratedWorkflow
      
      // Validate the workflow structure
      if (!workflow.name || !workflow.nodes || !Array.isArray(workflow.nodes)) {
        return createDefaultCustomerSupportWorkflow(triggerId, aiAgentId)
      }

      // Process the workflow to expand chains into visual nodes
      return expandAIAgentChains(workflow)
    } catch (aiError: any) {
      console.error("OpenAI generation failed, using fallback:", aiError.message)
      // Fallback to default workflow if OpenAI fails
      return createDefaultCustomerSupportWorkflow(triggerId, aiAgentId)
    }
  } catch (error) {
    console.error("Error generating enhanced workflow:", error)
    // Return a default customer support workflow as fallback
    const timestamp = Date.now()
    return createDefaultCustomerSupportWorkflow(`trigger-${timestamp}`, `node-${timestamp + 1}`)
  }
}

function createDefaultCustomerSupportWorkflow(triggerId: string, aiAgentId: string): GeneratedWorkflow {
  const nodes: WorkflowNode[] = []
  const connections: WorkflowConnection[] = []
  
  // Add trigger node
  nodes.push({
    id: triggerId,
    type: "custom",
    position: { x: 400, y: 100 },
    data: {
      label: "New Email",
      title: "Gmail: New Email",
      type: "gmail_trigger_new_email",
      isTrigger: true,
      providerId: "gmail",
      config: {}
    }
  })
  
  // Add AI Agent node with chains in config
  const chains = [
    {
      id: "chain-1",
      name: "Ticket Classification",
      description: "Create support tickets and notify team",
      actions: [
        { type: "notion_action_create_page", providerId: "notion", aiConfigured: true, label: "Create Support Ticket" },
        { type: "slack_action_send_message", providerId: "slack", aiConfigured: true, label: "Notify Support Team" }
      ]
    },
    {
      id: "chain-2",
      name: "FAQ Resolution",
      description: "Search and respond with solutions",
      actions: [
        { type: "notion_action_search_pages", providerId: "notion", aiConfigured: true, label: "Search Knowledge Base" },
        { type: "gmail_action_send_email", providerId: "gmail", aiConfigured: true, label: "Send Response to Customer" }
      ]
    },
    {
      id: "chain-3",
      name: "Escalation",
      description: "Handle high-priority issues",
      actions: [
        { type: "notion_action_create_page", providerId: "notion", aiConfigured: true, label: "Create Escalation Ticket" },
        { type: "slack_action_send_message", providerId: "slack", aiConfigured: true, label: "Notify Management Team" },
        { type: "google_calendar_action_create_event", providerId: "google-calendar", aiConfigured: true, label: "Schedule Escalation Meeting" }
      ]
    },
    {
      id: "chain-4",
      name: "Follow-ups",
      description: "Check status and update customers",
      actions: [
        { type: "notion_action_search_pages", providerId: "notion", aiConfigured: true, label: "Track Interaction" },
        { type: "gmail_action_send_email", providerId: "gmail", aiConfigured: true, label: "Send Follow-up Email" }
      ]
    },
    {
      id: "chain-5",
      name: "Feedback Collection",
      description: "Log feedback and notify team",
      actions: [
        { type: "google_sheets_unified_action", providerId: "google-sheets", aiConfigured: true, label: "Record Feedback" },
        { type: "slack_action_send_message", providerId: "slack", aiConfigured: true, label: "Notify Feedback Team" }
      ]
    },
    {
      id: "chain-6",
      name: "Order Processing",
      description: "Handle order and payment issues",
      actions: [
        { type: "stripe_action_create_customer", providerId: "stripe", aiConfigured: true, label: "Manage Order Issue" },
        { type: "hubspot_action_update_deal", providerId: "hubspot", aiConfigured: true, label: "Update Customer Deal" },
        { type: "gmail_action_send_email", providerId: "gmail", aiConfigured: true, label: "Inform Customer about Order" }
      ]
    }
  ]
  
  // Add AI Agent node
  nodes.push({
    id: aiAgentId,
    type: "custom",
    position: { x: 400, y: 300 },
    data: {
      label: "AI Support Agent",
      title: "AI Agent",
      type: "ai_agent",
      isTrigger: false,
      providerId: "ai",
      config: {
        model: "gpt-4-turbo",
        systemPrompt: "You are a comprehensive customer support AI. Analyze incoming emails and execute appropriate chains based on content:\n\n- Chain 1: Ticket Classification - For new support requests, create tickets and notify team\n- Chain 2: FAQ Resolution - For common questions, search knowledge base and send automated responses\n- Chain 3: Escalation - For urgent/complex issues, create high-priority tickets and schedule meetings\n- Chain 4: Follow-ups - For existing tickets, check status and send updates\n- Chain 5: Feedback - For feedback emails, log responses and notify if negative\n- Chain 6: Order Issues - For payment/order problems, check systems and update CRM\n\nAnalyze keywords, sentiment, and urgency to decide which chains to execute. You can execute multiple chains in parallel when appropriate.",
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
  
  // Now create visual nodes for each chain
  let xPosition = 650 // Start chains to the right of AI Agent
  chains.forEach((chain, chainIndex) => {
    let yPosition = 150 + (chainIndex * 200) // Space chains vertically
    
    // Create action nodes for this chain
    chain.actions.forEach((action, actionIndex) => {
      const actionNodeId = `${aiAgentId}-chain${chainIndex + 1}-action${actionIndex + 1}-${Date.now() + actionIndex}`
      
      nodes.push({
        id: actionNodeId,
        type: "custom",
        position: { x: xPosition + (actionIndex * 250), y: yPosition },
        data: {
          label: action.label,
          title: action.label,
          type: action.type,
          providerId: action.providerId,
          isTrigger: false,
          config: action.aiConfigured ? { aiConfigured: true } : {},
          parentAIAgentId: aiAgentId
        }
      })
      
      // Connect nodes in sequence
      if (actionIndex === 0) {
        // Connect AI Agent to first action in chain
        connections.push({
          id: `edge-${aiAgentId}-${actionNodeId}`,
          source: aiAgentId,
          target: actionNodeId
        })
      } else {
        // Connect previous action to current action
        const prevActionId = `${aiAgentId}-chain${chainIndex + 1}-action${actionIndex}-${Date.now() + actionIndex - 1}`
        connections.push({
          id: `edge-${prevActionId}-${actionNodeId}`,
          source: nodes[nodes.length - 2].id, // Previous node
          target: actionNodeId
        })
      }
    })
    
    // Add an "Add Action" node at the end of each chain
    const lastActionId = nodes[nodes.length - 1].id
    const addActionNodeId = `add-action-${aiAgentId}-chain${chainIndex + 1}`
    nodes.push({
      id: addActionNodeId,
      type: "addAction",
      position: { x: xPosition + (chain.actions.length * 250), y: yPosition },
      data: {
        parentId: lastActionId,
        parentAIAgentId: aiAgentId
      }
    })
    
    // Connect last action to Add Action node
    connections.push({
      id: `edge-${lastActionId}-${addActionNodeId}`,
      source: lastActionId,
      target: addActionNodeId
    })
  })
  
  return {
    name: "AI-Powered Customer Support Workflow",
    description: "Comprehensive customer support with automatic ticket classification, FAQ resolution, escalation, follow-ups, feedback collection, and order issue handling",
    nodes,
    connections
  }
}