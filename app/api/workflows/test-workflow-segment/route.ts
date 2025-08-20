import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { executeAction } from "@/src/infrastructure/workflows/legacy-compatibility"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/availableNodes"

// Import execution functions from the main execute route
async function executeNodeAdvanced(node: any, allNodes: any[], connections: any[], context: any): Promise<any> {
  console.log(`Executing node: ${node.id} (${node.data.type})`)

  try {
    let nodeResult

    switch (node.data.type) {
      // Triggers
      case "webhook":
        nodeResult = await executeWebhookNode(node, context)
        break
      case "manual":
        nodeResult = { type: "manual", triggered: true, timestamp: new Date().toISOString() }
        break
      case "gmail_trigger_new_email":
        nodeResult = await executeGmailTriggerNode(node, context)
        break
      
      // AI Agent
      case "ai_agent":
        console.log(`Using executeAction for AI agent node: ${node.id}`)
        nodeResult = await executeAction({
          node,
          input: context.data,
          userId: context.userId,
          workflowId: context.workflowId
        })
        break
      
      // Actions - use the generic executeAction for most
      default:
        if (node.data.type && node.data.type.includes('_action_')) {
          console.log(`Using generic executeAction for node type: ${node.data.type}`)
          nodeResult = await executeAction({
            node,
            input: context.data,
            userId: context.userId,
            workflowId: context.workflowId
          })
        } else {
          // For non-action nodes, provide a basic result
          nodeResult = { 
            type: node.data.type, 
            executed: true, 
            timestamp: new Date().toISOString(),
            nodeId: node.id
          }
        }
        break
    }

    // Store result in context
    context.results[node.id] = nodeResult
    return nodeResult
  } catch (error: any) {
    console.error(`Error executing node ${node.id}:`, error)
    throw error
  }
}

async function executeWebhookNode(node: any, context: any) {
  return {
    type: "webhook",
    data: context.data,
    timestamp: new Date().toISOString(),
    config: node.data.config,
  }
}

async function executeGmailTriggerNode(node: any, context: any) {
  return {
    type: "gmail_trigger_new_email",
    test: true,
    mock_email: {
      id: "mock_email_" + Date.now(),
      subject: "Test Email Subject",
      from: "sender@example.com",
      to: context.userId ? `user-${context.userId}@example.com` : "user@example.com",
      body: "This is a test email for workflow execution.",
      timestamp: new Date().toISOString(),
      labels: ["INBOX"],
      unread: true
    },
    config: node.data.config,
    timestamp: new Date().toISOString(),
  }
}

function renderTemplate(template: string, context: any): string {
  if (!template) return ""
  
  try {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const trimmedPath = path.trim()
      
      try {
        // Enhanced path evaluation
        let value
        
        if (trimmedPath.startsWith('data.')) {
          const dataPath = trimmedPath.substring(5)
          value = getNestedValue(context.data, dataPath)
        } else if (trimmedPath.startsWith('previousNode.')) {
          const nodePath = trimmedPath.substring(13)
          value = getNestedValue(context.previousNode, nodePath)
        } else if (trimmedPath.startsWith('nodeOutputs.')) {
          const outputPath = trimmedPath.substring(12)
          value = getNestedValue(context.nodeOutputs, outputPath)
        } else {
          // Simple evaluation for basic expressions
          const func = new Function("data", "previousNode", "nodeOutputs", `return ${trimmedPath}`)
          value = func(context.data, context.previousNode, context.nodeOutputs)
        }
        
        return value !== null && value !== undefined ? String(value) : ""
      } catch (error) {
        console.warn(`Template variable evaluation failed for "${trimmedPath}":`, error)
        return match
      }
    })
  } catch (error) {
    console.error("Template rendering error:", error)
    return template
  }
}

function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined
  
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined
  }, obj)
}

export async function POST(request: Request) {
  try {
    const requestData = await request.json()
    const { workflowId, nodeId: targetNodeId, input: triggerData } = requestData

    console.log('Received test request:', { 
      workflowId, 
      targetNodeId,
      triggerData
    })

    // Need to fetch the workflow data first
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    // Fetch the workflow data
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single()

    if (workflowError || !workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    // Parse the workflow data
    const workflowData = {
      nodes: workflow.nodes || [],
      edges: workflow.edges || []
    }

    const { nodes, edges } = workflowData
    
    if (!nodes || !Array.isArray(nodes)) {
      return NextResponse.json({ error: "Invalid workflow nodes" }, { status: 400 })
    }

    // Find the trigger node
    const triggerNode = nodes.find((node: any) => node.data.isTrigger)
    if (!triggerNode) {
      return NextResponse.json({ error: "No trigger node found in workflow" }, { status: 400 })
    }

    // Find the target node - if not provided, use the entire workflow
    const actualTargetNodeId = targetNodeId || triggerNode.id
    const targetNode = nodes.find((node: any) => node.id === actualTargetNodeId)
    
    if (!targetNode) {
      console.log('Available node IDs:', nodes.map((n: any) => n.id))
      console.log('Looking for target node ID:', actualTargetNodeId)
      return NextResponse.json({ error: "Target node not found" }, { status: 400 })
    }

    // Build execution path from trigger to target node
    const executionPath = buildExecutionPath(triggerNode.id, actualTargetNodeId, edges)
    if (executionPath.length === 0) {
      return NextResponse.json({ error: "No execution path found from trigger to target node" }, { status: 400 })
    }

    console.log("Execution path:", executionPath)

    // Initialize execution context
    const context = {
      userId: user.id,
      workflowId: workflowId,
      testMode: true,
      data: triggerData || {
        // Default trigger data
        name: "John Doe",
        email: "john@example.com",
        status: "active",
        amount: 100,
        date: new Date().toISOString()
      },
      results: {},
      nodeOutputs: {},
      previousNode: null as any
    }

    const executionResults: any[] = []
    let currentContext = { ...context }

    // Execute each node in the path
    for (let i = 0; i < executionPath.length; i++) {
      const nodeId = executionPath[i]
      const node = nodes.find((n: any) => n.id === nodeId)
      
      if (!node) {
        console.warn(`Node ${nodeId} not found, skipping`)
        continue
      }

      console.log(`Executing node ${i + 1}/${executionPath.length}: ${node.data.type} (${nodeId})`)

      try {
        // Execute the node
        const nodeResult = await executeNodeAdvanced(node, nodes, edges, currentContext)
        
        // Store execution result
        const executionResult = {
          nodeId: nodeId,
          nodeType: node.data.type,
          nodeTitle: node.data.title || node.data.type,
          input: { ...currentContext.data },
          output: nodeResult,
          success: true,
          executionOrder: i + 1
        }
        
        executionResults.push(executionResult)

        // Update context for next node
        currentContext = {
          ...currentContext,
          data: {
            ...currentContext.data,
            ...nodeResult,
            previousNodeData: {
              ...currentContext.data.previousNodeData,
              [nodeId]: nodeResult
            }
          },
          nodeOutputs: {
            ...currentContext.nodeOutputs,
            [nodeId]: nodeResult
          },
          previousNode: {
            id: nodeId,
            type: node.data.type,
            output: nodeResult
          }
        }

        console.log(`Node ${nodeId} executed successfully`)

      } catch (error: any) {
        console.error(`Error executing node ${nodeId}:`, error)
        
        executionResults.push({
          nodeId: nodeId,
          nodeType: node.data.type,
          nodeTitle: node.data.title || node.data.type,
          input: { ...currentContext.data },
          output: null,
          error: error.message,
          success: false,
          executionOrder: i + 1
        })
        
        // Stop execution on error
        break
      }
    }

    // Get the final input and output for the target node
    const targetExecution = executionResults.find(result => result.nodeId === actualTargetNodeId)
    const triggerExecution = executionResults[0] // First node is the trigger

    return NextResponse.json({
      success: true,
      testResults: executionResults,
      executionPath,
      triggerOutput: triggerExecution?.output || {},
      testedNodeId: actualTargetNodeId
    })

  } catch (error: any) {
    console.error("Workflow segment test error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to test workflow segment" },
      { status: 500 }
    )
  }
}

// Helper function to build execution path from trigger to target node
function buildExecutionPath(startNodeId: string, targetNodeId: string, edges: any[]): string[] {
  const visited = new Set<string>()
  const path: string[] = []
  
  function dfs(currentNodeId: string): boolean {
    if (visited.has(currentNodeId)) return false
    visited.add(currentNodeId)
    path.push(currentNodeId)
    
    if (currentNodeId === targetNodeId) return true
    
    // Find outgoing edges from current node
    const outgoingEdges = edges.filter(edge => edge.source === currentNodeId)
    
    for (const edge of outgoingEdges) {
      if (dfs(edge.target)) return true
    }
    
    // Backtrack
    path.pop()
    return false
  }
  
  if (dfs(startNodeId)) {
    return path
  }
  
  return []
} 