import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextRequest } from "next/server"
import { executeAction } from "@/lib/workflows/executeNode"
import { mapWorkflowData, evaluateExpression, evaluateCondition } from "@/lib/execution/variableResolver"
import { logger } from '@/lib/utils/logger'

// Helper to safely clone data and remove circular references
function safeClone(obj: any, seen = new WeakSet()): any {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj)
  if (obj instanceof Array) return obj.map(item => safeClone(item, seen))
  if (seen.has(obj)) return '[Circular Reference]'

  seen.add(obj)

  const cloned: any = {}
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = safeClone(obj[key], seen)
    }
  }

  return cloned
}

// Generate a short summary of action output for preview
function generateOutputPreview(nodeType: string, output: any): string {
  if (!output) return 'Completed'

  // Handle different node types
  switch (nodeType) {
    case 'slack_send_message':
    case 'slack_post_message':
      return output.channel ? `Sent to ${output.channel}` : 'Message sent'
    case 'gmail_send_email':
    case 'send_email':
      const recipients = output.to || output.recipients
      if (recipients) {
        const count = Array.isArray(recipients) ? recipients.length : 1
        return `Email sent to ${count} recipient${count > 1 ? 's' : ''}`
      }
      return 'Email sent'
    case 'notion_create_page':
      return output.title ? `Created: ${output.title}` : 'Page created'
    case 'notion_update_page':
      return 'Page updated'
    case 'http_request':
    case 'webhook':
      const status = output.status || output.statusCode
      return status ? `${status} OK` : 'Request completed'
    case 'filter':
    case 'conditional':
      return output.passed ? 'Condition passed' : 'Condition not met'
    case 'loop':
    case 'forEach':
      const count = output.processedCount || output.items?.length || 0
      return `Processed ${count} items`
    case 'ai_generate':
    case 'ai_router':
      return output.selectedPaths ? `Routed to: ${output.selectedPaths.join(', ')}` : 'AI processed'
    case 'delay':
      return `Delayed ${output.duration || 'completed'}`
    default:
      if (output.success === true) return 'Completed successfully'
      if (output.message) return String(output.message).slice(0, 50)
      return 'Completed'
  }
}

// Generate action description for "running" state
function generateRunningPreview(nodeType: string, nodeTitle: string, config: any): string {
  switch (nodeType) {
    case 'slack_send_message':
    case 'slack_post_message':
      return config?.channel ? `Sending to ${config.channel}...` : 'Sending message...'
    case 'gmail_send_email':
    case 'send_email':
      return config?.to ? `Sending to ${config.to}...` : 'Sending email...'
    case 'notion_create_page':
      return 'Creating page...'
    case 'notion_update_page':
      return 'Updating page...'
    case 'http_request':
    case 'webhook':
      return config?.url ? `Requesting ${new URL(config.url).hostname}...` : 'Making request...'
    case 'filter':
    case 'conditional':
      return 'Evaluating condition...'
    case 'loop':
    case 'forEach':
      return 'Processing items...'
    case 'ai_generate':
    case 'ai_router':
      return 'Processing with AI...'
    case 'delay':
      return `Waiting ${config?.duration || ''}...`
    default:
      return `Running ${nodeTitle || nodeType}...`
  }
}

interface StreamEvent {
  type: 'node_started' | 'node_completed' | 'node_failed' | 'workflow_completed' | 'workflow_failed' | 'trigger_listening' | 'trigger_received'
  nodeId?: string
  nodeType?: string
  nodeTitle?: string
  output?: any
  error?: string
  preview?: string
  executionTime?: number
  timestamp: number
}

export async function POST(request: NextRequest) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const body = await request.json()
  const { workflowId, nodes, connections, inputData = {}, options = {} } = body

  if (!workflowId) {
    return new Response(JSON.stringify({ error: 'Workflow ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Verify workflow ownership
  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .eq("user_id", user.id)
    .single()

  if (workflowError || !workflow) {
    return new Response(JSON.stringify({ error: 'Workflow not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Use provided nodes/connections or fall back to workflow data
  const workflowNodes = nodes || workflow.nodes || []
  const workflowConnections = connections || workflow.connections || []

  // Create a TransformStream for SSE
  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  // Helper to send SSE event
  const sendEvent = async (event: StreamEvent) => {
    console.log('[ExecuteStream] Sending event:', event.type, event.nodeId || '')
    const data = `data: ${JSON.stringify(event)}\n\n`
    await writer.write(encoder.encode(data))
  }

  // Execute workflow in background
  const executeWorkflow = async () => {
    try {
      console.log('[ExecuteStream] Started', {
        workflowId,
        nodeCount: workflowNodes.length,
        connectionCount: workflowConnections.length,
        hasInputData: !!inputData,
        options
      })

      const context = {
        data: inputData,
        trigger: inputData?.trigger,
        variables: {},
        userId: user.id,
        workflowId,
      }

      const executionQueue: any[] = []
      const executedNodeIds = new Set<string>()
      let currentData = inputData
      const previousResults: Record<string, any> = {}

      // Find trigger node
      const triggerNode = workflowNodes.find((n: any) => n.data?.isTrigger && !n.data?.isPlaceholder)

      if (triggerNode && !options.skipTrigger) {
        // For webhook triggers, we'd wait for the event
        // For now, mark trigger as completed with input data
        const triggerStartTime = Date.now()

        await sendEvent({
          type: 'node_started',
          nodeId: triggerNode.id,
          nodeType: triggerNode.data?.type,
          nodeTitle: triggerNode.data?.title || 'Trigger',
          preview: 'Processing trigger data...',
          timestamp: Date.now()
        })

        // Simulate trigger processing (in real scenario, this would be the webhook data)
        const triggerResult = inputData.trigger || inputData
        previousResults[triggerNode.id] = triggerResult
        currentData = { ...currentData, [triggerNode.id]: triggerResult }
        executedNodeIds.add(triggerNode.id)

        await sendEvent({
          type: 'node_completed',
          nodeId: triggerNode.id,
          nodeType: triggerNode.data?.type,
          nodeTitle: triggerNode.data?.title || 'Trigger',
          output: triggerResult,
          preview: 'Trigger data received',
          executionTime: Date.now() - triggerStartTime,
          timestamp: Date.now()
        })

        // Find first action nodes
        const initialConnections = workflowConnections.filter((c: any) => c.source === triggerNode.id)
        const firstActionNodes = initialConnections
          .map((c: any) => workflowNodes.find((n: any) => n.id === c.target))
          .filter(Boolean)

        executionQueue.push(...firstActionNodes)
      } else {
        // Skip trigger, start with first action node
        const actionNodes = workflowNodes.filter((n: any) => !n.data?.isTrigger && !n.data?.isPlaceholder)
        if (actionNodes.length > 0) {
          // Find nodes with no incoming connections (entry points)
          const entryNodes = actionNodes.filter((node: any) => {
            const hasIncoming = workflowConnections.some((c: any) => c.target === node.id)
            return !hasIncoming
          })

          if (entryNodes.length > 0) {
            executionQueue.push(...entryNodes)
          } else {
            // Fallback: use first action node
            executionQueue.push(actionNodes[0])
          }
        }
      }

      // Execute nodes in order
      while (executionQueue.length > 0) {
        const currentNode = executionQueue.shift()

        if (executedNodeIds.has(currentNode.id)) {
          continue
        }

        const nodeStartTime = Date.now()
        const nodeType = currentNode.data?.type || 'unknown'
        const nodeTitle = currentNode.data?.title || nodeType

        // Send node_started event
        await sendEvent({
          type: 'node_started',
          nodeId: currentNode.id,
          nodeType,
          nodeTitle,
          preview: generateRunningPreview(nodeType, nodeTitle, currentNode.data?.config),
          timestamp: Date.now()
        })

        try {
          // Prepare input for node execution
          const nodeInput = safeClone({
            ...currentData,
            ...previousResults,
            trigger: context.trigger,
            executionId: `stream-${Date.now()}`,
            workflowId,
            nodeId: currentNode.id,
            testMode: options.testMode || false
          })

          // Execute the node
          const actionResult = await executeAction({
            node: currentNode,
            input: nodeInput,
            userId: user.id,
            workflowId,
            testMode: options.testMode || false,
            executionMode: options.testMode ? 'sandbox' : 'live'
          })

          const executionTime = Date.now() - nodeStartTime

          if (actionResult.success === false) {
            // Node failed
            await sendEvent({
              type: 'node_failed',
              nodeId: currentNode.id,
              nodeType,
              nodeTitle,
              error: actionResult.message || actionResult.error || 'Action failed',
              executionTime,
              timestamp: Date.now()
            })

            // Stop execution on failure
            await sendEvent({
              type: 'workflow_failed',
              error: `Node "${nodeTitle}" failed: ${actionResult.message || actionResult.error}`,
              timestamp: Date.now()
            })

            break
          }

          // Node succeeded
          previousResults[currentNode.id] = actionResult
          currentData = { ...currentData, [currentNode.id]: actionResult }
          executedNodeIds.add(currentNode.id)

          await sendEvent({
            type: 'node_completed',
            nodeId: currentNode.id,
            nodeType,
            nodeTitle,
            output: actionResult,
            preview: generateOutputPreview(nodeType, actionResult),
            executionTime,
            timestamp: Date.now()
          })

          // Find and queue next nodes
          let nextConnections = workflowConnections.filter((c: any) => c.source === currentNode.id)

          // Handle AI router special case
          if (nodeType === 'ai_router') {
            const selectedPaths: string[] = Array.isArray(actionResult?.selectedPaths)
              ? actionResult.selectedPaths
              : []

            if (selectedPaths.length > 0) {
              const normalized = selectedPaths.map((path: string) => path.toLowerCase())
              nextConnections = nextConnections.filter((connection: any) => {
                if (!connection.sourceHandle) return false
                const handle = String(connection.sourceHandle)
                const cleanedHandle = handle.startsWith('output-') ? handle.slice(7) : handle
                return normalized.includes(handle.toLowerCase()) || normalized.includes(cleanedHandle.toLowerCase())
              })
            } else {
              nextConnections = []
            }
          }

          const nextNodes = nextConnections
            .map((c: any) => workflowNodes.find((n: any) => n.id === c.target))
            .filter(Boolean)

          for (const nextNode of nextNodes) {
            if (!executedNodeIds.has(nextNode.id) && !executionQueue.some((q: any) => q.id === nextNode.id)) {
              executionQueue.push(nextNode)
            }
          }

        } catch (error: any) {
          const executionTime = Date.now() - nodeStartTime

          await sendEvent({
            type: 'node_failed',
            nodeId: currentNode.id,
            nodeType,
            nodeTitle,
            error: error.message || 'Unknown error',
            executionTime,
            timestamp: Date.now()
          })

          await sendEvent({
            type: 'workflow_failed',
            error: `Node "${nodeTitle}" failed: ${error.message}`,
            timestamp: Date.now()
          })

          break
        }
      }

      // If we completed all nodes successfully
      if (executionQueue.length === 0) {
        await sendEvent({
          type: 'workflow_completed',
          timestamp: Date.now()
        })
      }

    } catch (error: any) {
      logger.error('Stream execution error:', error)
      await sendEvent({
        type: 'workflow_failed',
        error: error.message || 'Workflow execution failed',
        timestamp: Date.now()
      })
    } finally {
      await writer.close()
    }
  }

  // Start execution in background
  executeWorkflow()

  // Return SSE response
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
