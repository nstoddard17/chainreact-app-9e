import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { executeAction } from "@/lib/workflows/executeNode"
import { createDataFlowManager } from "@/lib/workflows/dataFlowContext"

interface ExecutionContext {
  userId: string
  workflowId: string
  testMode: boolean
  inputData: any
  results: Record<string, any>
  errors: string[]
  dataFlowManager: any // DataFlowManager instance
}

export async function POST(request: Request) {
  try {
    console.log("=== Workflow Execution Started ===")
    
    const body = await request.json()
    const { workflowId, testMode = false, inputData = {}, workflowData } = body
    
    console.log("Execution parameters:", {
      workflowId,
      testMode,
      hasInputData: !!inputData,
      hasWorkflowData: !!workflowData
    })

    if (!workflowId) {
      console.error("No workflowId provided")
      return NextResponse.json({ error: "workflowId is required" }, { status: 400 })
    }

    // Get the workflow from the database
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .single()

    if (workflowError || !workflow) {
      console.error("Error fetching workflow:", workflowError)
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    console.log("Workflow found:", {
      id: workflow.id,
      name: workflow.name,
      nodesCount: workflow.nodes?.length || 0
    })

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error("User authentication error:", userError)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    console.log("User authenticated:", user.id)

    // Parse workflow data
    const nodes = workflowData?.nodes || workflow.nodes || []
    const edges = workflowData?.edges || workflow.edges || []
    
    console.log("Workflow structure:", {
      nodesCount: nodes.length,
      edgesCount: edges.length,
      nodeTypes: nodes.map((n: any) => n.data?.type).filter(Boolean)
    })

    if (nodes.length === 0) {
      console.error("No nodes found in workflow")
      return NextResponse.json({ error: "No nodes found in workflow" }, { status: 400 })
    }

    // Find trigger nodes
    const triggerNodes = nodes.filter((node: any) => node.data?.isTrigger)
    console.log("Trigger nodes found:", triggerNodes.length)

    if (triggerNodes.length === 0) {
      console.error("No trigger nodes found")
      return NextResponse.json({ error: "No trigger nodes found" }, { status: 400 })
    }

    // Execute the workflow using the existing function
    console.log("Starting workflow execution with testMode:", testMode)
    
    const results = await executeWorkflowAdvanced(workflow, inputData, user.id, testMode, workflowData)
    
    console.log("Workflow execution completed successfully")

    return NextResponse.json({
      success: true,
      results: results,
      executionTime: new Date().toISOString()
    })

  } catch (error: any) {
    console.error("Workflow execution error:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    
    return NextResponse.json({ 
      error: "Workflow execution failed", 
      details: error.message 
    }, { status: 500 })
  }
}

async function executeWorkflowAdvanced(workflow: any, inputData: any, userId: string, testMode: boolean, workflowData?: any) {
  const supabase = await createSupabaseRouteHandlerClient()
  
  // Use workflowData if provided (current state), otherwise fall back to saved workflow
  const nodes = workflowData?.nodes || workflow.nodes || []
  const connections = workflowData?.connections || workflow.connections || []

  console.log("Executing workflow with:", {
    nodesCount: nodes.length,
    connectionsCount: connections.length,
    usingWorkflowData: !!workflowData,
    nodeTypes: nodes.map((n: any) => n.data?.type).filter(Boolean)
  })

  if (nodes.length === 0) {
    throw new Error("Workflow has no nodes")
  }

  // Find trigger nodes (nodes with no incoming connections)
  const triggerNodes = nodes.filter((node: any) => !connections.some((conn: any) => conn.target === node.id))

  if (triggerNodes.length === 0) {
    throw new Error("Workflow has no trigger nodes")
  }

  // Initialize data flow manager
  const dataFlowManager = createDataFlowManager(`exec_${Date.now()}`, workflow.id, userId)
  
  const executionContext = {
    data: inputData,
    variables: {},
    results: {},
    testMode,
    userId,
    workflowId: workflow.id,
    dataFlowManager
  }

  // Load workflow variables
  const { data: variables } = await supabase.from("workflow_variables").select("*").eq("workflow_id", workflow.id)

  if (variables) {
    variables.forEach((variable: any) => {
      (executionContext.variables as any)[variable.name] = variable.value
    })
  }

  // Execute from each trigger node
  const results = []
  for (const triggerNode of triggerNodes) {
    const result = await executeNodeAdvanced(triggerNode, nodes, connections, executionContext)
    results.push(result)
  }

  return results
}

async function executeNodeAdvanced(node: any, allNodes: any[], connections: any[], context: any): Promise<any> {
  const startTime = Date.now()
  console.log(`Executing node: ${node.id} (${node.data.type})`)

  try {
    // Set current node in data flow manager
    context.dataFlowManager?.setCurrentNode(node.id)
    
    let nodeResult

    switch (node.data.type) {
      // Triggers
      case "webhook":
        nodeResult = await executeWebhookNode(node, context)
        break
      case "schedule":
        nodeResult = await executeScheduleNode(node, context)
        break
      case "manual":
        nodeResult = await executeManualTriggerNode(node, context)
        break
      case "gmail_trigger_new_email":
        nodeResult = await executeGmailTriggerNode(node, context)
        break
      case "gmail_trigger_new_attachment":
        nodeResult = await executeGmailAttachmentTriggerNode(node, context)
        break
      case "gmail_trigger_new_label":
        // TODO: Implement Gmail new label trigger
        nodeResult = { type: "gmail_trigger_new_label", triggered: true }
        break
      case "google_calendar_trigger_new_event":
        // TODO: Implement Google Calendar new event trigger
        nodeResult = { type: "google_calendar_trigger_new_event", triggered: true }
        break
      case "google_calendar_trigger_event_updated":
        // TODO: Implement Google Calendar event updated trigger
        nodeResult = { type: "google_calendar_trigger_event_updated", triggered: true }
        break
      case "google_calendar_trigger_event_canceled":
        // TODO: Implement Google Calendar event canceled trigger
        nodeResult = { type: "google_calendar_trigger_event_canceled", triggered: true }
        break
      case "google-drive:new_file_in_folder":
      case "google-drive:new_folder_in_folder":
      case "google-drive:file_updated":
        // TODO: Implement Google Drive triggers
        nodeResult = { type: node.data.type, triggered: true }
        break

      // Actions
      case "filter":
        nodeResult = await executeFilterNode(node, context)
        break
      case "delay":
        nodeResult = await executeDelayNode(node, context)
        break
      case "conditional":
        // TODO: Implement conditional logic
        nodeResult = { type: "conditional", executed: true }
        break
      case "custom_script":
        // TODO: Implement custom script logic
        nodeResult = { type: "custom_script", executed: true }
        break
      case "loop":
        nodeResult = await executeLoopNode(node, allNodes, connections, context)
        break
      case "gmail_action_send_email":
        nodeResult = await executeGmailSendEmailNode(node, context)
        break
      case "gmail_action_add_label":
        nodeResult = await executeAction({
          node,
          input: context.data,
          userId: context.userId,
          workflowId: context.workflowId
        })
        break
      // AI Data Processing Actions
      case "ai_action_summarize":
      case "ai_action_extract":
      case "ai_action_sentiment":
      case "ai_action_translate":
      case "ai_action_generate":
      case "ai_action_classify":
        // Resolve variable references in config before executing
        const resolvedConfig = context.dataFlowManager.resolveObject(node.data?.config || {})
        const nodeWithResolvedConfig = {
          ...node,
          data: {
            ...node.data,
            config: resolvedConfig
          }
        }
        nodeResult = await executeAction({
          node: nodeWithResolvedConfig,
          input: context.data,
          userId: context.userId,
          workflowId: context.workflowId
        })
        break
      case "ai_agent":
        // Resolve variable references in config before executing
        const aiResolvedConfig = context.dataFlowManager.resolveObject(node.data?.config || {})
        const aiNodeWithResolvedConfig = {
          ...node,
          data: {
            ...node.data,
            config: aiResolvedConfig
          }
        }
        nodeResult = await executeAction({
          node: aiNodeWithResolvedConfig,
          input: context.data,
          userId: context.userId,
          workflowId: context.workflowId
        })
        break
      case "google_calendar_action_create_event":
        nodeResult = await executeCalendarEventNode(node, context)
        break
      case "google-drive:create_file":
        nodeResult = await executeGoogleDriveCreateFileNode(node, context)
        break
      case "google_drive_action_upload_file":
        nodeResult = await executeGoogleDriveUploadFileNode(node, context)
        break
      case "onedrive_action_upload_file_from_url":
        nodeResult = await executeOneDriveUploadFileFromUrlNode(node, context)
        break
      case "dropbox_action_upload_file_from_url":
        nodeResult = await executeDropboxUploadFileFromUrlNode(node, context)
        break
      // Logic & Control
      case "if_condition":
        nodeResult = await executeIfConditionNode(node, context)
        break
      case "switch_case":
        nodeResult = await executeSwitchCaseNode(node, context)
        break
      case "data_transform":
        nodeResult = await executeDataTransformNode(node, context)
        break
      case "template":
        nodeResult = await executeTemplateNode(node, context)
        break
      case "javascript":
        nodeResult = await executeJavaScriptNode(node, context)
        break
      case "variable_set":
        nodeResult = await executeVariableSetNode(node, context)
        break
      case "variable_get":
        nodeResult = await executeVariableGetNode(node, context)
        break
      // Error Handling
      case "try_catch":
        nodeResult = await executeTryCatchNode(node, allNodes, connections, context)
        break
      case "retry":
        nodeResult = await executeRetryNode(node, allNodes, connections, context)
        break
      case "slack_message":
        nodeResult = await executeSlackMessageNode(node, context)
        break
      case "calendar_event":
        nodeResult = await executeCalendarEventNode(node, context)
        break
      case "sheets_append":
        nodeResult = await executeSheetsAppendNode(node, context)
        break
      case "sheets_read":
        nodeResult = await executeSheetsReadNode(node, context)
        break
      case "sheets_update":
        nodeResult = await executeSheetsUpdateNode(node, context)
        break
      case "sheets_create_spreadsheet":
        nodeResult = await executeSheetsCreateSpreadsheetNode(node, context)
        break
      case "google_docs_action_create_document":
        nodeResult = await executeGoogleDocsCreateDocumentNode(node, context)
        break
      case "google_docs_action_read_document":
        nodeResult = await executeGoogleDocsReadDocumentNode(node, context)
        break
      case "google_docs_action_update_document":
        nodeResult = await executeGoogleDocsUpdateDocumentNode(node, context)
        break
      case "google_sheets_unified_action":
        nodeResult = await executeGoogleSheetsUnifiedAction(node, context)
        break
      case "send_email":
        nodeResult = await executeSendEmailNode(node, context)
        break
      case "webhook_call":
        nodeResult = await executeWebhookCallNode(node, context)
        break
      default:
        // Handle any action type that ends with _action_ using the generic executeAction function
        if (node.data.type && node.data.type.includes('_action_')) {
          console.log(`Using generic executeAction for node type: ${node.data.type}`)
          nodeResult = await executeAction({
            node,
            input: context.data,
            userId: context.userId,
            workflowId: context.workflowId
          })
        } else {
          throw new Error(`Unsupported node type: ${node.data.type}`)
        }
        break
    }

    // Store result
    context.results[node.id] = nodeResult
    
    // Store output in data flow manager
    if (context.dataFlowManager) {
      context.dataFlowManager.setNodeOutput(node.id, {
        success: !(nodeResult as any).error,
        data: (nodeResult as any).output || nodeResult,
        metadata: {
          timestamp: new Date(),
          nodeType: node.data.type,
          executionTime: Date.now() - startTime
        }
      })
    }

    // Find and execute connected nodes based on output
    await executeConnectedNodes(node, allNodes, connections, context, nodeResult)

    return nodeResult
  } catch (error: any) {
    console.error(`Error executing node ${node.id}:`, error)

    // Check if this node has error handling
    const errorConnections = connections.filter((conn: any) => conn.source === node.id && conn.sourceHandle === "error")

    if (errorConnections.length > 0) {
      // Execute error path
      context.data = { ...context.data, error: error.message, errorNode: node.id }

      for (const connection of errorConnections) {
        const targetNode = allNodes.find((n: any) => n.id === connection.target)
        if (targetNode) {
          await executeNodeAdvanced(targetNode, allNodes, connections, context)
        }
      }

      return { error: error.message, handled: true }
    }

    throw error
  }
}

async function executeConnectedNodes(sourceNode: any, allNodes: any[], connections: any[], context: any, result: any) {
  const outgoingConnections = connections.filter((conn: any) => conn.source === sourceNode.id)

  for (const connection of outgoingConnections) {
    // Skip if this is a conditional connection that doesn't match
    if (connection.sourceHandle === "true" && !result.condition) continue
    if (connection.sourceHandle === "false" && result.condition) continue
    if (connection.sourceHandle === "error" && !result.error) continue

    const targetNode = allNodes.find((n: any) => n.id === connection.target)
    if (targetNode) {
      // Enhanced data flow: Create a new context that includes the previous node's output
      const newContext = {
        ...context,
        data: {
          ...context.data,
          // Add the current node's result as the main data
          ...result,
          // Keep track of previous nodes' outputs
          previousNodeData: {
            ...context.data.previousNodeData,
            [sourceNode.id]: result
          },
          // Store all node results in a structured way
          nodeOutputs: {
            ...context.nodeOutputs,
            [sourceNode.id]: result
          }
        },
        // Store the immediate previous node for template variables
        previousNode: {
          id: sourceNode.id,
          type: sourceNode.data.type,
          output: result
        }
      }
      
      console.log(`Data flow: ${sourceNode.data.type} -> ${targetNode.data.type}`, {
        sourceOutput: result,
        availableData: Object.keys(newContext.data)
      })
      
      await executeNodeAdvanced(targetNode, allNodes, connections, newContext)
    }
  }
}

// Enhanced node execution functions
async function executeWebhookNode(node: any, context: any) {
  return {
    type: "webhook",
    data: context.data,
    timestamp: new Date().toISOString(),
    config: node.data.config,
  }
}

async function executeScheduleNode(node: any, context: any) {
  return {
    type: "schedule",
    cron_expression: node.data.config?.cron_expression || "0 9 * * 1-5",
    timezone: node.data.config?.timezone || "UTC",
    timestamp: new Date().toISOString(),
  }
}

async function executeManualTriggerNode(node: any, context: any) {
  console.log("Executing manual trigger")
  
  // For manual triggers, we use the input data provided by the user
  const triggerData = {
    type: "manual",
    triggered: true,
    timestamp: new Date().toISOString(),
    triggerId: node.id,
    triggerName: node.data?.label || "Manual Trigger",
    data: context.data || {},
    metadata: {
      executedBy: context.userId,
      executionMode: context.testMode ? "test" : "live"
    }
  }
  
  console.log("Manual trigger data:", triggerData)
  return triggerData
}

async function executeGmailAttachmentTriggerNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "gmail_trigger_new_attachment",
      test: true,
      mock_email: {
        id: "mock_email_with_attachment_" + Date.now(),
        subject: "Test Email with Attachment",
        from: "test@example.com",
        to: context.userId ? `user-${context.userId}@example.com` : "user@example.com",
        body: "This is a test email with an attachment for workflow execution.",
        timestamp: new Date().toISOString(),
        labels: ["INBOX"],
        unread: true,
        attachments: [
          {
            id: "mock_attachment_1",
            filename: "test-document.pdf",
            mimeType: "application/pdf",
            size: 1024000
          }
        ]
      },
      config: node.data.config,
      timestamp: new Date().toISOString(),
    }
  }

  // In production, this would integrate with Gmail API to check for emails with attachments
  return {
    type: "gmail_trigger_new_attachment",
    status: "listening",
    config: {
      label_filter: node.data.config?.label_filter || "INBOX",
      attachment_types: node.data.config?.attachment_types || ["*"],
      min_attachment_size: node.data.config?.min_attachment_size || 0,
      max_attachment_size: node.data.config?.max_attachment_size || 25000000
    },
    message: "Gmail attachment trigger is set up and listening for new emails with attachments",
    timestamp: new Date().toISOString(),
  }
}

async function executeEmailTriggerNode(node: any, context: any) {
  return {
    type: "email_trigger",
    email_address: node.data.config?.email_address,
    subject_filter: node.data.config?.subject_filter,
    sender_filter: node.data.config?.sender_filter,
    timestamp: new Date().toISOString(),
  }
}

async function executeGmailTriggerNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "gmail_trigger_new_email",
      test: true,
      mock_email: {
        id: "mock_email_" + Date.now(),
        subject: "Test Email Subject",
        from: "test@example.com",
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

  // In production, this would integrate with Gmail API to check for new emails
  // For now, return a mock response indicating the trigger is set up
  return {
    type: "gmail_trigger_new_email",
    status: "listening",
    config: {
      label_filter: node.data.config?.label_filter || "INBOX",
      subject_filter: node.data.config?.subject_filter,
      sender_filter: node.data.config?.sender_filter,
      query: node.data.config?.query
    },
    message: "Gmail trigger is set up and listening for new emails",
    timestamp: new Date().toISOString(),
  }
}

async function executeFileUploadNode(node: any, context: any) {
  return {
    type: "file_upload",
    provider: node.data.config?.provider || "dropbox",
    folder_path: node.data.config?.folder_path || "/",
    file_types: node.data.config?.file_types?.split(",") || [],
    timestamp: new Date().toISOString(),
  }
}

async function executeIfConditionNode(node: any, context: any) {
  const condition = node.data.config?.condition || "true"

  try {
    // Simple condition evaluation (in production, use a safer evaluator)
    const result = evaluateCondition(condition, context)

    return {
      type: "if_condition",
      condition: !!result,
      true_path: node.data.config?.true_path || "True",
      false_path: node.data.config?.false_path || "False",
    }
  } catch (error) {
    throw new Error(`IF condition error: ${error}`)
  }
}

async function executeSwitchCaseNode(node: any, context: any) {
  const switchValue = evaluateExpression(node.data.config?.switch_value || "data.type", context)
  const cases = JSON.parse(node.data.config?.cases || "{}")

  const matchedCase = cases[switchValue] || cases.default || "default"

  return {
    type: "switch_case",
    switch_value: switchValue,
    matched_case: matchedCase,
    cases,
  }
}

async function executeDataTransformNode(node: any, context: any) {
  const inputFormat = node.data.config?.input_format || "json"
  const outputFormat = node.data.config?.output_format || "json"
  const transformation = node.data.config?.transformation

  try {
    let transformedData = context.data

    // Apply JSONata transformation if provided
    if (transformation) {
      // In production, use the actual JSONata library
      transformedData = applyTransformation(context.data, transformation)
    }

    return {
      type: "data_transform",
      input_format: inputFormat,
      output_format: outputFormat,
      original_data: context.data,
      transformed_data: transformedData,
    }
  } catch (error) {
    throw new Error(`Data transformation error: ${error}`)
  }
}

async function executeTemplateNode(node: any, context: any) {
  const template = node.data.config?.template || ""
  const engine = node.data.config?.engine || "handlebars"

  try {
    const rendered = renderTemplate(template, context, engine)

    return {
      type: "template",
      template,
      engine,
      rendered,
    }
  } catch (error) {
    throw new Error(`Template rendering error: ${error}`)
  }
}

async function executeJavaScriptNode(node: any, context: any) {
  const code = node.data.config?.code || "return data;"
  const timeout = Number.parseInt(node.data.config?.timeout || "5000")

  if (context.testMode) {
    return {
      type: "javascript",
      code,
      result: { test: true, message: "JavaScript execution skipped in test mode" },
    }
  }

  try {
    // In production, use a secure sandbox like vm2 or isolated-vm
    const result = executeJavaScriptSafely(code, context, timeout)

    return {
      type: "javascript",
      code,
      result,
    }
  } catch (error) {
    throw new Error(`JavaScript execution error: ${error}`)
  }
}

async function executeVariableSetNode(node: any, context: any) {
  const variableName = node.data.config?.variable_name
  const value = evaluateExpression(node.data.config?.value || "", context)
  const scope = node.data.config?.scope || "workflow"

  if (!variableName) {
    throw new Error("Variable name is required")
  }

  // Store in context
  context.variables[variableName] = value

  // Store in database if workflow scope
  if (scope === "workflow") {
    const supabase = await createSupabaseRouteHandlerClient()
    await supabase.from("workflow_variables").upsert({
      workflow_id: context.workflowId,
      name: variableName,
      value,
      type: typeof value,
    })
  }

  return {
    type: "variable_set",
    variable_name: variableName,
    value,
    scope,
  }
}

async function executeVariableGetNode(node: any, context: any) {
  const variableName = node.data.config?.variable_name
  const defaultValue = node.data.config?.default_value

  if (!variableName) {
    throw new Error("Variable name is required")
  }

  const value = context.variables[variableName] || defaultValue

  return {
    type: "variable_get",
    variable_name: variableName,
    value,
    default_value: defaultValue,
  }
}

async function executeLoopNode(node: any, allNodes: any[], connections: any[], context: any) {
  const arrayPath = node.data.config?.array_path || "data.items"
  const itemVariable = node.data.config?.item_variable || "item"
  const maxIterations = Number.parseInt(node.data.config?.max_iterations || "100")

  const array = evaluateExpression(arrayPath, context)

  if (!Array.isArray(array)) {
    throw new Error("Loop target is not an array")
  }

  const results = []
  const loopConnections = connections.filter((conn: any) => conn.source === node.id)

  for (let i = 0; i < Math.min(array.length, maxIterations); i++) {
    const loopContext = {
      ...context,
      data: {
        ...context.data,
        [itemVariable]: array[i],
        index: i,
        total: array.length,
      },
    }

    // Execute connected nodes for each iteration
    for (const connection of loopConnections) {
      const targetNode = allNodes.find((n: any) => n.id === connection.target)
      if (targetNode) {
        const result = await executeNodeAdvanced(targetNode, allNodes, connections, loopContext)
        results.push(result)
      }
    }
  }

  return {
    type: "loop",
    array_path: arrayPath,
    item_variable: itemVariable,
    iterations: results.length,
    results,
  }
}

async function executeTryCatchNode(node: any, allNodes: any[], connections: any[], context: any) {
  const maxRetries = Number.parseInt(node.data.config?.max_retries || "3")
  const retryDelay = Number.parseInt(node.data.config?.retry_delay || "1000")

  try {
    // Execute success path
    const successConnections = connections.filter(
      (conn: any) => conn.source === node.id && conn.sourceHandle === "success",
    )

    for (const connection of successConnections) {
      const targetNode = allNodes.find((n: any) => n.id === connection.target)
      if (targetNode) {
        await executeNodeAdvanced(targetNode, allNodes, connections, context)
      }
    }

    return {
      type: "try_catch",
      status: "success",
    }
  } catch (error: any) {
    // Execute error path
    const errorConnections = connections.filter((conn: any) => conn.source === node.id && conn.sourceHandle === "error")

    context.data = { ...context.data, error: error.message }

    for (const connection of errorConnections) {
      const targetNode = allNodes.find((n: any) => n.id === connection.target)
      if (targetNode) {
        await executeNodeAdvanced(targetNode, allNodes, connections, context)
      }
    }

    return {
      type: "try_catch",
      status: "error",
      error: error.message,
    }
  }
}

async function executeRetryNode(node: any, allNodes: any[], connections: any[], context: any) {
  const maxAttempts = Number.parseInt(node.data.config?.max_attempts || "3")
  const backoffStrategy = node.data.config?.backoff_strategy || "exponential"
  const initialDelay = Number.parseInt(node.data.config?.initial_delay || "1000")
  const maxDelay = Number.parseInt(node.data.config?.max_delay || "30000")

  let attempt = 0
  let lastError

  while (attempt < maxAttempts) {
    try {
      attempt++

      // Execute connected nodes
      const connections_to_retry = connections.filter((conn: any) => conn.source === node.id)

      for (const connection of connections_to_retry) {
        const targetNode = allNodes.find((n: any) => n.id === connection.target)
        if (targetNode) {
          await executeNodeAdvanced(targetNode, allNodes, connections, context)
        }
      }

      return {
        type: "retry",
        attempts: attempt,
        status: "success",
      }
    } catch (error: any) {
      lastError = error

      if (attempt < maxAttempts) {
        const delay = calculateRetryDelay(attempt, backoffStrategy, initialDelay, maxDelay)

        if (!context.testMode) {
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }
  }

  throw new Error(`Retry failed after ${maxAttempts} attempts: ${lastError?.message}`)
}

// Utility functions
function evaluateCondition(condition: string, context: any): boolean {
  try {
    // Simple evaluation - in production, use a safer evaluator
    const func = new Function("data", "variables", "context", `return ${condition}`)
    return func(context.data, context.variables, context)
  } catch (error) {
    throw new Error(`Condition evaluation error: ${error}`)
  }
}

function evaluateExpression(expression: string, context: any): any {
  try {
    // Simple evaluation - in production, use a safer evaluator
    const func = new Function("data", "variables", "context", `return ${expression}`)
    return func(context.data, context.variables, context)
  } catch (error) {
    return expression // Return as literal if evaluation fails
  }
}

function applyTransformation(data: any, transformation: string): any {
  try {
    // Simple JSONata-like transformation
    // In production, use the actual JSONata library
    const func = new Function("$", `return ${transformation}`)
    return func(data)
  } catch (error) {
    throw new Error(`Transformation error: ${error}`)
  }
}

function renderTemplate(template: string, context: any, engine: string): string {
  try {
    // Enhanced template rendering with better data access
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const trimmedPath = path.trim()
      
      try {
        // Create enhanced template context with easy access to data
        const templateContext = {
          // Main data (current or most recent node output)
          data: context.data,
          // Access to specific node outputs by node ID
          nodeOutputs: context.nodeOutputs || {},
          // Previous node data
          previousNode: context.previousNode || {},
          // All previous node data
          previousNodeData: context.data?.previousNodeData || {},
          // Context variables
          variables: context.variables || {},
          // User information
          userId: context.userId,
          workflowId: context.workflowId,
          // Helper functions for common operations
          helpers: {
            formatDate: (date: string | Date) => new Date(date).toLocaleDateString(),
            formatTime: (date: string | Date) => new Date(date).toLocaleTimeString(),
            formatDateTime: (date: string | Date) => new Date(date).toLocaleString(),
            uppercase: (str: string) => String(str).toUpperCase(),
            lowercase: (str: string) => String(str).toLowerCase(),
            length: (arr: any[] | string) => arr?.length || 0
          }
        }
        
        // Enhanced path evaluation with better error handling
        let value
        
        // Support for common template patterns
        if (trimmedPath.startsWith('data.')) {
          // Direct data access: {{data.email}}
          const dataPath = trimmedPath.substring(5)
          value = getNestedValue(context.data, dataPath)
        } else if (trimmedPath.startsWith('previousNode.')) {
          // Previous node access: {{previousNode.output.messageId}}
          const nodePath = trimmedPath.substring(13)
          value = getNestedValue(context.previousNode, nodePath)
        } else if (trimmedPath.startsWith('nodeOutputs.')) {
          // Specific node output access: {{nodeOutputs.node_123.data}}
          const outputPath = trimmedPath.substring(12)
          value = getNestedValue(context.nodeOutputs, outputPath)
        } else if (trimmedPath.startsWith('helpers.')) {
          // Helper function access: {{helpers.formatDate(data.timestamp)}}
          value = evaluateExpression(trimmedPath, templateContext)
        } else {
          // Default evaluation with enhanced context
          value = evaluateExpression(trimmedPath, templateContext)
        }
        
        // Handle different value types
        if (value === null || value === undefined) {
          return ""
        } else if (typeof value === 'object') {
          return JSON.stringify(value)
        } else {
          return String(value)
        }
        
      } catch (error) {
        console.warn(`Template variable evaluation failed for "${trimmedPath}":`, error)
        return match // Return original if evaluation fails
      }
    })
  } catch (error) {
    throw new Error(`Template rendering error: ${error}`)
  }
}

// Helper function to safely access nested object properties
function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined
  
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined
  }, obj)
}

function executeJavaScriptSafely(code: string, context: any, timeout: number): any {
  try {
    // Simple evaluation - in production, use vm2 or isolated-vm for security
    const func = new Function("data", "variables", "context", code)
    return func(context.data, context.variables, context)
  } catch (error) {
    throw new Error(`JavaScript execution error: ${error}`)
  }
}

function calculateRetryDelay(attempt: number, strategy: string, initialDelay: number, maxDelay: number): number {
  let delay = initialDelay

  switch (strategy) {
    case "exponential":
      delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay)
      break
    case "linear":
      delay = Math.min(initialDelay * attempt, maxDelay)
      break
    case "fixed":
    default:
      delay = initialDelay
      break
  }

  return delay
}

async function handleExecutionError(supabase: any, executionId: string, error: any, userId: string): Promise<boolean> {
  // Check if we should retry this execution
  const { data: retries } = await supabase
    .from("execution_retries")
    .select("*")
    .eq("execution_id", executionId)
    .order("attempt_number", { ascending: false })
    .limit(1)

  const lastAttempt = retries?.[0]?.attempt_number || 0
  const maxRetries = 3 // Configure this per workflow

  if (lastAttempt < maxRetries) {
    // Schedule retry
    const nextAttempt = lastAttempt + 1
    const retryDelay = Math.min(1000 * Math.pow(2, nextAttempt - 1), 30000) // Exponential backoff

    await supabase.from("execution_retries").insert({
      execution_id: executionId,
      attempt_number: nextAttempt,
      error_message: error.message,
      retry_at: new Date(Date.now() + retryDelay).toISOString(),
      status: "pending",
    })

    return true // Will retry
  } else {
    // Add to dead letter queue
    await supabase.from("dead_letter_queue").insert({
      execution_id: executionId,
      user_id: userId,
      error_data: {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      },
      retry_count: maxRetries,
      max_retries: maxRetries,
    })

    return false // No more retries
  }
}

// Additional node implementations for actions
async function executeWebhookCallNode(node: any, context: any) {
  const url = node.data.config?.url
  const method = node.data.config?.method || "GET"
  const headers = JSON.parse(node.data.config?.headers || "{}")
  const body = node.data.config?.body

  if (!url) {
    throw new Error("URL is required for webhook call")
  }

  if (context.testMode) {
    return {
      type: "webhook_call",
      url,
      method,
      test: true,
    }
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: method !== "GET" ? body : undefined,
    })

    const responseData = await response.text()

    return {
      type: "webhook_call",
      url,
      method,
      status: response.status,
      response: responseData,
      success: response.ok,
    }
  } catch (error: any) {
    throw new Error(`Webhook call failed: ${error.message}`)
  }
}

// Re-use existing action implementations
async function executeSlackMessageNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "slack_message",
      channel: node.data.config?.channel || "#general",
      message: node.data.config?.message || "Test message",
      test: true,
    }
  }

  // Get Slack integration
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "slack")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("Slack integration not connected")
  }

  // Render message template
  const message = renderTemplate(node.data.config?.message || "Message from ChainReact", context, "handlebars")

  // Send message to Slack
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integration.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: node.data.config?.channel || "#general",
      text: message,
      username: node.data.config?.username || "ChainReact",
    }),
  })

  const result = await response.json()

  if (!result.ok) {
    throw new Error(`Slack API error: ${result.error}`)
  }

  return {
    type: "slack_message",
    channel: node.data.config?.channel,
    message,
    slack_response: result,
  }
}

async function executeCalendarEventNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "calendar_event",
      title: node.data.config?.title || "Test Event",
      duration: node.data.config?.duration || 60,
      test: true,
    }
  }

  // We'll implement the enhanced Google Calendar execution inline
  
  // Get Google Calendar integration
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "google-calendar")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("Google Calendar integration not connected")
  }

  // Render all template values from the node configuration
  const config = node.data.config || {}
  const params: any = {}

  // Basic fields
  if (config.title) params.title = renderTemplate(config.title, context, "handlebars")
  if (config.description) params.description = renderTemplate(config.description, context, "handlebars")
  if (config.location) params.location = renderTemplate(config.location, context, "handlebars")
  
  // Date and Time fields - handle separate date and time fields
  if (config.startDate && config.startTime) {
    // Current format with separate date and time fields
    params.startDate = renderTemplate(config.startDate, context, "handlebars")
    params.startTime = renderTemplate(config.startTime, context, "handlebars")
  } else if (config.startDateTime) {
    // Legacy format with combined datetime field
    params.startDateTime = renderTemplate(config.startDateTime, context, "handlebars")
  } else if (config.startTime) {
    // Legacy format with combined datetime
    params.startTime = renderTemplate(config.startTime, context, "handlebars")
  } else {
    // Default values
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    params.startDate = tomorrow.toISOString().split('T')[0]
    params.startTime = "09:00"
  }
  
  if (config.endDate && config.endTime) {
    // Current format with separate date and time fields
    params.endDate = renderTemplate(config.endDate, context, "handlebars")
    params.endTime = renderTemplate(config.endTime, context, "handlebars")
  } else if (config.endDateTime) {
    // Legacy format with combined datetime field
    params.endDateTime = renderTemplate(config.endDateTime, context, "handlebars")
  } else if (config.endTime) {
    // Legacy format with combined datetime
    params.endTime = renderTemplate(config.endTime, context, "handlebars")
  } else {
    // Default values
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    params.endDate = tomorrow.toISOString().split('T')[0]
    params.endTime = "10:00"
  }
  
  // Copy other configuration values
  if (config.calendarId) params.calendarId = config.calendarId
  if (config.timeZone) params.timeZone = config.timeZone
  if (config.allDay !== undefined) params.allDay = config.allDay
  if (config.attendees) params.attendees = renderTemplate(config.attendees, context, "handlebars")
  if (config.sendNotifications) params.sendNotifications = config.sendNotifications
  if (config.visibility) params.visibility = config.visibility
  if (config.transparency) params.transparency = config.transparency
  if (config.colorId) params.colorId = config.colorId
  if (config.recurrence) params.recurrence = renderTemplate(config.recurrence, context, "handlebars")
  if (config.reminderMinutes) params.reminderMinutes = config.reminderMinutes
  if (config.reminderMethod) params.reminderMethod = config.reminderMethod
  if (config.guestsCanInviteOthers !== undefined) params.guestsCanInviteOthers = config.guestsCanInviteOthers
  if (config.guestsCanModify !== undefined) params.guestsCanModify = config.guestsCanModify
  if (config.guestsCanSeeOtherGuests !== undefined) params.guestsCanSeeOtherGuests = config.guestsCanSeeOtherGuests
  if (config.createMeetLink !== undefined) params.createMeetLink = config.createMeetLink
  if (config.eventType) params.eventType = config.eventType

  // Execute the calendar event creation using enhanced logic
  try {
    // Build the event object with all the enhanced fields
    const eventData: any = {
      summary: params.title || "ChainReact Event",
      description: params.description || "",
      location: params.location || "",
    }

    // Handle time zone and dates
    const timeZone = params.timeZone || "America/New_York"
    
    if (params.allDay) {
      // All-day event uses date format
      const startDate = params.startDate || new Date().toISOString().split('T')[0]
      const endDate = params.endDate || new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0]
      
      eventData.start = { date: startDate }
      eventData.end = { date: endDate }
    } else {
      // Timed event uses dateTime format
      let startDateTime, endDateTime
      
      if (params.startDate && params.startTime) {
        // Current format: combine separate date and time fields
        startDateTime = `${params.startDate}T${params.startTime}:00`
        endDateTime = `${params.endDate}T${params.endTime}:00`
      } else if (params.startDateTime && params.endDateTime) {
        // Legacy format: use combined datetime fields
        startDateTime = params.startDateTime
        endDateTime = params.endDateTime
      } else {
        // Legacy format: use existing datetime strings
        startDateTime = params.startTime || new Date().toISOString()
        endDateTime = params.endTime || new Date(Date.now() + 60*60*1000).toISOString()
      }
      
      eventData.start = {
        dateTime: startDateTime,
        timeZone: timeZone,
      }
      eventData.end = {
        dateTime: endDateTime,
        timeZone: timeZone,
      }
    }

    // Add attendees if provided
    if (params.attendees) {
      const attendeeEmails: string[] = typeof params.attendees === 'string' 
        ? params.attendees.split(',').map((email: string) => email.trim()).filter((email: string) => email)
        : params.attendees
      
      if (attendeeEmails.length > 0) {
        eventData.attendees = attendeeEmails.map((email: string) => ({ 
          email: email,
          responseStatus: "needsAction"
        }))
      }
    }

    // Add recurrence if provided
    if (params.recurrence && params.recurrence.trim() && params.recurrence !== "none") {
      eventData.recurrence = [params.recurrence.trim()]
    }

    // Add reminders
    if (params.reminderMinutes || params.reminderMethod) {
      const minutes = parseInt(params.reminderMinutes) || 15
      const method = params.reminderMethod || "popup"
      
      if (minutes > 0) {
        eventData.reminders = {
          useDefault: false,
          overrides: [{ method: method, minutes: minutes }]
        }
      } else {
        eventData.reminders = { useDefault: false, overrides: [] }
      }
    }

    // Add guest permissions
    if (params.guestsCanInviteOthers !== undefined) {
      eventData.guestsCanInviteOthers = params.guestsCanInviteOthers === true || params.guestsCanInviteOthers === "true"
    }
    if (params.guestsCanModify !== undefined) {
      eventData.guestsCanModify = params.guestsCanModify === true || params.guestsCanModify === "true"
    }
    if (params.guestsCanSeeOtherGuests !== undefined) {
      eventData.guestsCanSeeOtherGuests = params.guestsCanSeeOtherGuests === true || params.guestsCanSeeOtherGuests === "true"
    }

    // Add visibility and transparency
    if (params.visibility) {
      eventData.visibility = params.visibility
    }
    if (params.transparency) {
      eventData.transparency = params.transparency
    }

    // Add color
    if (params.colorId && params.colorId !== "default") {
      eventData.colorId = params.colorId
    }

    // Add event type
    if (params.eventType && params.eventType !== "default") {
      eventData.eventType = params.eventType
    }

    // Add Google Meet conference if requested
    if (params.createMeetLink === true || params.createMeetLink === "true") {
      eventData.conferenceData = {
        createRequest: {
          requestId: `meet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" }
        }
      }
    }

    // Determine calendar and build request URL
    const calendarId = params.calendarId || "primary"
    let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    
    // Add query parameters
    const queryParams = []
    if (params.sendNotifications && params.sendNotifications !== "none") {
      queryParams.push(`sendUpdates=${params.sendNotifications}`)
    }
    if (params.createMeetLink) {
      queryParams.push("conferenceDataVersion=1")
    }
    if (queryParams.length > 0) {
      url += `?${queryParams.join('&')}`
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventData),
    })

    const result = await response.json()
    
    if (!response.ok) {
      throw new Error(`Google Calendar API error: ${result.error?.message || 'Unknown error'}`)
    }
    
    return {
      type: "calendar_event",
      title: params.title || "Calendar Event",
      description: params.description || "",
      location: params.location || "",
      event_id: result.id,
      event_link: result.htmlLink,
      start_time: params.startTime,
      end_time: params.endTime,
      calendar_id: params.calendarId || "primary",
      attendees_count: params.attendees ? (typeof params.attendees === 'string' ? params.attendees.split(',').length : params.attendees.length) : 0,
      has_meet_link: !!params.createMeetLink,
      result: result
    }
  } catch (error: any) {
    throw new Error(`Google Calendar event creation failed: ${error.message}`)
  }
}

async function executeSheetsAppendNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "sheets_append",
      spreadsheet_id: node.data.config?.spreadsheetId || "test-sheet",
      sheet_name: node.data.config?.sheetName || "Sheet1",
      test: true,
    }
  }

  console.log("Starting Google Sheets append row execution...")

  // Get Google Sheets integration
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "google-sheets")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("Google Sheets integration not connected")
  }

  console.log("Found Google Sheets integration:", {
    id: integration.id,
    hasAccessToken: !!integration.access_token,
    hasRefreshToken: !!integration.refresh_token,
    expiresAt: integration.expires_at
  })

  // Ensure we have a valid access token
  let accessToken = integration.access_token

  // Refresh token if needed
  if (integration.refresh_token) {
    try {
      const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
      
      // Check if token needs refresh
      const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
        accessTokenExpiryThreshold: 5 // Refresh if token expires in 5 minutes
      })
      
      if (shouldRefresh) {
        console.log("Access token needs refresh, refreshing...")
        const refreshResult = await TokenRefreshService.refreshTokenForProvider(
          "google-sheets",
          integration.refresh_token,
          integration.id
        )
        
        if (refreshResult.success && refreshResult.accessToken) {
          accessToken = refreshResult.accessToken
          console.log("Successfully refreshed access token")
        } else {
          console.error("Failed to refresh access token:", refreshResult.error)
          throw new Error("Failed to refresh Google Sheets access token")
        }
      } else {
        console.log("Access token is still valid")
      }
    } catch (error) {
      console.error("Error refreshing token:", error)
      throw new Error("Failed to refresh Google Sheets access token")
    }
  }

  const config = node.data.config || {}
  const spreadsheetId = config.spreadsheetId
  const sheetName = config.sheetName
  const valueInputOption = config.valueInputOption || "RAW"
  const insertDataOption = config.insertDataOption || "INSERT_ROWS"
  const includeTimestamp = config.includeTimestamp || false
  const timestampColumn = config.timestampColumn || "Timestamp"

  if (!spreadsheetId) {
    throw new Error("Spreadsheet ID is required")
  }

  if (!sheetName) {
    throw new Error("Sheet name is required")
  }

  // Parse and evaluate row data
  let rowDataConfig = config.rowData || '["{{data.timestamp}}", "{{data.message}}"]'
  
  try {
    const parsedData = JSON.parse(rowDataConfig)
    if (!Array.isArray(parsedData)) {
      throw new Error("Row data must be a JSON array")
    }
    
    // Render template variables in each value
    const values = parsedData.map((value: string) => renderTemplate(value, context, "handlebars"))
    
    // Add timestamp if requested
    if (includeTimestamp) {
      values.push(new Date().toISOString())
    }

    console.log("Prepared row data:", {
      spreadsheetId,
      sheetName,
      valueInputOption,
      insertDataOption,
      includeTimestamp,
      valuesCount: values.length,
      values
    })

    // Build the API URL with query parameters
    const queryParams = new URLSearchParams({
      valueInputOption,
      insertDataOption
    })

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}:append?${queryParams.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [values],
        }),
      },
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("Google Sheets API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      throw new Error(`Google Sheets API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()

    console.log("Google Sheets API success response:", {
      updatedRange: result.updates?.updatedRange,
      updatedRows: result.updates?.updatedRows,
      updatedColumns: result.updates?.updatedColumns,
      updatedCells: result.updates?.updatedCells
    })

    return {
      type: "sheets_append",
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      values,
      range: result.updates?.updatedRange,
      updated_rows: result.updates?.updatedRows,
      updated_columns: result.updates?.updatedColumns,
      updated_cells: result.updates?.updatedCells,
      timestamp_added: includeTimestamp,
      timestamp_column: includeTimestamp ? timestampColumn : null
    }

  } catch (error: any) {
    if (error.message.includes("JSON")) {
      throw new Error(`Invalid row data format: ${error.message}. Please provide a valid JSON array.`)
    }
    throw error
  }
}

async function executeSheetsReadNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "sheets_read",
      spreadsheet_id: node.data.config?.spreadsheetId || "test-sheet",
      sheet_name: node.data.config?.sheetName || "Sheet1",
      test: true,
      data: [["Test", "Data"], ["Row1", "Value1"], ["Row2", "Value2"]]
    }
  }

  console.log("Starting Google Sheets read data execution...")

  // Get Google Sheets integration
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "google-sheets")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("Google Sheets integration not connected")
  }

  console.log("Found Google Sheets integration:", {
    id: integration.id,
    hasAccessToken: !!integration.access_token,
    hasRefreshToken: !!integration.refresh_token,
    expiresAt: integration.expires_at
  })

  // Ensure we have a valid access token
  let accessToken = integration.access_token

  // Refresh token if needed
  if (integration.refresh_token) {
    try {
      const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
      
      // Check if token needs refresh
      const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
        accessTokenExpiryThreshold: 5 // Refresh if token expires in 5 minutes
      })
      
      if (shouldRefresh) {
        console.log("Access token needs refresh, refreshing...")
        const refreshResult = await TokenRefreshService.refreshTokenForProvider(
          "google-sheets",
          integration.refresh_token,
          integration.id
        )
        
        if (refreshResult.success && refreshResult.accessToken) {
          accessToken = refreshResult.accessToken
          console.log("Successfully refreshed access token")
        } else {
          console.error("Failed to refresh access token:", refreshResult.error)
          throw new Error("Failed to refresh Google Sheets access token")
        }
      } else {
        console.log("Access token is still valid")
      }
    } catch (error) {
      console.error("Error refreshing token:", error)
      throw new Error("Failed to refresh Google Sheets access token")
    }
  }

  const config = node.data.config || {}
  const spreadsheetId = config.spreadsheetId
  const sheetName = config.sheetName
  const range = config.range
  const includeHeaders = config.includeHeaders !== false // Default to true
  const maxRows = config.maxRows || 0
  const outputFormat = config.outputFormat || "array"

  if (!spreadsheetId) {
    throw new Error("Spreadsheet ID is required")
  }

  if (!sheetName) {
    throw new Error("Sheet name is required")
  }

  // Build the range string
  const rangeString = range ? `${sheetName}!${range}` : sheetName

  console.log("Reading Google Sheets data:", {
    spreadsheetId,
    sheetName,
    range: rangeString,
    includeHeaders,
    maxRows,
    outputFormat
  })

  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${rangeString}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("Google Sheets API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      throw new Error(`Google Sheets API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()
    const rawData = result.values || []

    console.log("Raw data from Google Sheets:", {
      range: result.range,
      rows: rawData.length,
      columns: rawData[0]?.length || 0
    })

    // Process the data based on configuration
    let processedData = rawData

    // Apply max rows limit
    if (maxRows > 0 && rawData.length > maxRows) {
      processedData = rawData.slice(0, maxRows)
    }

    // Format the output
    let formattedData
    let headers: string[] | null = null

    if (includeHeaders && processedData.length > 0) {
      headers = processedData[0] as string[]
      const dataRows = processedData.slice(1)
      
      switch (outputFormat) {
        case "objects":
          formattedData = dataRows.map((row: any[]) => {
            const obj: any = {}
            headers!.forEach((header: string, index: number) => {
              obj[header] = row[index] || ""
            })
            return obj
          })
          break
        case "csv":
          const csvRows = [headers, ...dataRows]
          formattedData = csvRows.map((row: any[]) => 
            row.map((cell: any) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")
          ).join("\n")
          break
        default: // array
          formattedData = dataRows
          break
      }
    } else {
      switch (outputFormat) {
        case "csv":
          formattedData = processedData.map((row: any[]) => 
            row.map((cell: any) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")
          ).join("\n")
          break
        default: // array and objects (without headers)
          formattedData = processedData
          break
      }
    }

    console.log("Processed data:", {
      outputFormat,
      includeHeaders,
      dataLength: Array.isArray(formattedData) ? formattedData.length : formattedData.length,
      headers: headers?.length || 0
    })

    return {
      type: "sheets_read",
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      range: result.range,
      data: formattedData,
      headers: headers,
      total_rows: rawData.length,
      processed_rows: processedData.length,
      output_format: outputFormat,
      include_headers: includeHeaders
    }

  } catch (error: any) {
    console.error("Error reading Google Sheets data:", error)
    throw error
  }
}

async function executeSheetsUpdateNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "sheets_update",
      spreadsheet_id: node.data.config?.spreadsheetId || "test-sheet",
      sheet_name: node.data.config?.sheetName || "Sheet1",
      range: node.data.config?.range || "A1:B2",
      test: true,
      updated_cells: 4
    }
  }

  console.log("Starting Google Sheets update data execution...")

  // Get Google Sheets integration
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "google-sheets")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("Google Sheets integration not connected")
  }

  console.log("Found Google Sheets integration:", {
    id: integration.id,
    hasAccessToken: !!integration.access_token,
    hasRefreshToken: !!integration.refresh_token,
    expiresAt: integration.expires_at
  })

  // Ensure we have a valid access token
  let accessToken = integration.access_token

  // Refresh token if needed
  if (integration.refresh_token) {
    try {
      const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
      
      // Check if token needs refresh
      const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
        accessTokenExpiryThreshold: 5 // Refresh if token expires in 5 minutes
      })
      
      if (shouldRefresh) {
        console.log("Access token needs refresh, refreshing...")
        const refreshResult = await TokenRefreshService.refreshTokenForProvider(
          "google-sheets",
          integration.refresh_token,
          integration.id
        )
        
        if (refreshResult.success && refreshResult.accessToken) {
          accessToken = refreshResult.accessToken
          console.log("Successfully refreshed access token")
        } else {
          console.error("Failed to refresh access token:", refreshResult.error)
          throw new Error("Failed to refresh Google Sheets access token")
        }
      } else {
        console.log("Access token is still valid")
      }
    } catch (error) {
      console.error("Error refreshing token:", error)
      throw new Error("Failed to refresh Google Sheets access token")
    }
  }

  const config = node.data.config || {}
  const spreadsheetId = config.spreadsheetId
  const sheetName = config.sheetName
  const range = config.range
  const valueInputOption = config.valueInputOption || "RAW"

  if (!spreadsheetId) {
    throw new Error("Spreadsheet ID is required")
  }

  if (!sheetName) {
    throw new Error("Sheet name is required")
  }

  if (!range) {
    throw new Error("Range is required")
  }

  // Build the range string
  const rangeString = `${sheetName}!${range}`

  // Parse and evaluate update data
  let updateDataConfig = config.updateData || '["{{data.value}}"]'
  
  try {
    const parsedData = JSON.parse(updateDataConfig)
    if (!Array.isArray(parsedData)) {
      throw new Error("Update data must be a JSON array")
    }
    
    // Process the data - handle both single row and multiple rows
    let values: any[]
    if (parsedData.length > 0 && Array.isArray(parsedData[0])) {
      // Multiple rows: [["row1col1", "row1col2"], ["row2col1", "row2col2"]]
      values = parsedData.map((row: any[]) => 
        row.map((value: string) => renderTemplate(value, context, "handlebars"))
      )
    } else {
      // Single row: ["val1", "val2"]
      values = [parsedData.map((value: string) => renderTemplate(value, context, "handlebars"))]
    }

    console.log("Prepared update data:", {
      spreadsheetId,
      sheetName,
      range: rangeString,
      valueInputOption,
      valuesCount: values.length,
      values
    })

    // Build the API URL with query parameters
    const queryParams = new URLSearchParams({
      valueInputOption
    })

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${rangeString}?${queryParams.toString()}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values,
        }),
      },
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("Google Sheets API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      throw new Error(`Google Sheets API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()

    console.log("Google Sheets API success response:", {
      updatedRange: result.updatedRange,
      updatedRows: result.updatedRows,
      updatedColumns: result.updatedColumns,
      updatedCells: result.updatedCells
    })

    return {
      type: "sheets_update",
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      range: result.updatedRange,
      values,
      updated_rows: result.updatedRows,
      updated_columns: result.updatedColumns,
      updated_cells: result.updatedCells
    }

  } catch (error: any) {
    if (error.message.includes("JSON")) {
      throw new Error(`Invalid update data format: ${error.message}. Please provide a valid JSON array.`)
    }
    throw error
  }
}

async function executeSendEmailNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "send_email",
      to: node.data.config?.to || "test@example.com",
      subject: node.data.config?.subject || "Test Email",
      test: true,
    }
  }

  // Render email content
  const to = renderTemplate(node.data.config?.to || "", context, "handlebars")
  const subject = renderTemplate(node.data.config?.subject || "", context, "handlebars")
  const body = renderTemplate(node.data.config?.body || "", context, "handlebars")

  // For now, just return mock data
  // In production, integrate with an email service like SendGrid, Resend, etc.
  return {
    type: "send_email",
    to,
    subject,
    body,
    html: node.data.config?.html === "true",
    sent: true,
    mock: true,
  }
}

async function executeGmailSendEmailNode(node: any, context: any) {
  // Import the Gmail execution logic
  const { executeAction } = await import("@/lib/workflows/executeNode")
  
  try {
    const result = await executeAction({
      node,
      input: context.data,
      userId: context.userId,
      workflowId: context.workflowId
    })

    // Return standardized output that matches the output schema
    return {
      type: "gmail_action_send_email",
      // Core output fields matching the schema
      messageId: result.output?.messageId || `msg_${Date.now()}`,
      to: Array.isArray(node.data.config?.to) ? node.data.config.to : [node.data.config?.to].filter(Boolean),
      subject: renderTemplate(node.data.config?.subject || "", context, "handlebars"),
      timestamp: new Date().toISOString(),
      success: result.success,
      // Additional fields for internal use
      message: result.message,
      output: result.output,
    }
  } catch (error: any) {
    throw new Error(`Gmail send email failed: ${error.message}`)
  }
}

async function executeFilterNode(node: any, context: any) {
  const condition = node.data.config?.condition || "true"
  const operation = node.data.config?.operation || "include"

  try {
    const result = evaluateCondition(condition, context)
    const passed = operation === "include" ? result : !result

    return {
      type: "filter",
      condition,
      operation,
      result: !!result,
      passed,
    }
  } catch (error) {
    throw new Error(`Filter condition error: ${error}`)
  }
}

async function executeDelayNode(node: any, context: any) {
  const duration = node.data.config?.duration || "1s"
  const dynamicDuration = node.data.config?.dynamic

  let ms = parseDuration(duration)

  // Check for dynamic duration
  if (dynamicDuration) {
    const dynamicMs = evaluateExpression(dynamicDuration, context)
    if (typeof dynamicMs === "number") {
      ms = dynamicMs * 1000 // Convert seconds to milliseconds
    }
  }

  if (!context.testMode) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  return {
    type: "delay",
    duration,
    dynamic_duration: dynamicDuration,
    ms,
    test: context.testMode,
  }
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h)$/)
  if (!match) return 1000

  const value = Number.parseInt(match[1])
  const unit = match[2]

  switch (unit) {
    case "s":
      return value * 1000
    case "m":
      return value * 60 * 1000
    case "h":
      return value * 60 * 60 * 1000
    default:
      return 1000
  }
}

async function executeGoogleDriveCreateFileNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "google-drive:create_file",
      fileName: node.data.config?.fileName || "test-file.txt",
      test: true,
      message: "Test mode: File creation simulated"
    }
  }

  console.log("Starting Google Drive create file execution...")

  // Get Google Drive integration
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "google-drive")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("Google Drive integration not connected")
  }

  console.log("Found Google Drive integration:", {
    id: integration.id,
    hasAccessToken: !!integration.access_token,
    hasRefreshToken: !!integration.refresh_token,
    expiresAt: integration.expires_at
  })

  // Ensure we have a valid access token
  let accessToken = integration.access_token
  if (integration.refresh_token) {
    try {
      const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
      
      // Check if token needs refresh
      const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
        accessTokenExpiryThreshold: 5 // Refresh if token expires in 5 minutes
      })
      
      if (shouldRefresh) {
        console.log("Access token needs refresh, refreshing...")
        const refreshResult = await TokenRefreshService.refreshTokenForProvider(
          "google-drive",
          integration.refresh_token,
          integration.id
        )
        
        if (refreshResult.success && refreshResult.accessToken) {
          accessToken = refreshResult.accessToken
          console.log("Successfully refreshed access token")
        } else {
          console.error("Failed to refresh access token:", refreshResult.error)
          throw new Error("Failed to refresh Google Drive access token")
        }
      } else {
        console.log("Access token is still valid")
      }
    } catch (error) {
      console.error("Error refreshing token:", error)
      throw new Error("Failed to refresh Google Drive access token")
    }
  }

  const config = node.data.config || {}
  const fileName = config.fileName
  const fileContent = config.fileContent
  const uploadedFileIds = config.uploadedFiles || []
  const folderId = config.folderId

  console.log("Google Drive create file config:", {
    fileName,
    hasFileContent: !!fileContent,
    uploadedFileIds: uploadedFileIds.length,
    folderId: folderId || 'root'
  })

  if (!fileName) {
    throw new Error("File name is required")
  }

  // Check if we have either content or uploaded files
  if (!fileContent && (!uploadedFileIds || uploadedFileIds.length === 0)) {
    throw new Error("Either file content or uploaded files are required")
  }

  try {
    // Use googleapis library for better Node.js compatibility
    const { google } = await import("googleapis")
    const { Readable } = require("stream")
    
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const drive = google.drive({ version: "v3", auth: oauth2Client })
    
    const results = []

    // Handle uploaded files if any
    if (uploadedFileIds && uploadedFileIds.length > 0) {
      console.log(`Processing ${uploadedFileIds.length} uploaded files...`)
      
      const { FileStorageService } = await import("@/lib/storage/fileStorage")
      
      // Get the uploaded files
      const uploadedFiles = await FileStorageService.getFilesFromReferences(uploadedFileIds, context.userId)
      console.log(`Retrieved ${uploadedFiles.length} files from storage`)
      
      for (const file of uploadedFiles) {
        if (!file.content) {
          throw new Error(`Uploaded file ${file.fileName} has no content`)
        }
        let fileBuffer
        if (file.content instanceof Buffer) {
          fileBuffer = file.content
        } else if (file.content instanceof ArrayBuffer) {
          fileBuffer = Buffer.from(file.content)
        } else if (file.content && typeof file.content === 'object' && 'buffer' in file.content) {
          // ArrayBufferView (e.g. Uint8Array, DataView)
          fileBuffer = Buffer.from((file.content as ArrayBufferView).buffer)
        } else {
          throw new Error(`Unsupported file content type for ${file.fileName}`)
        }
        console.log(`Uploading file: ${file.fileName} (${fileBuffer.length} bytes)`)
        
        // Create file in Google Drive using the googleapis library
        const fileMetadata = {
          name: file.fileName,
          parents: folderId ? [folderId] : undefined
        }

        console.log("Making Google Drive API request for file:", file.fileName)
        
        const response = await drive.files.create({
          requestBody: fileMetadata,
          media: {
            mimeType: file.mimeType || 'application/octet-stream',
            body: Readable.from(fileBuffer)
          }
        })

        console.log("Google Drive API success response:", { fileId: response.data.id, fileName: response.data.name })
        
        results.push({
          fileName: file.fileName,
          fileId: response.data.id!,
          fileUrl: `https://drive.google.com/file/d/${response.data.id}/view`,
          size: fileBuffer.length
        })
      }
    }

    // Handle text content if provided
    if (fileContent) {
      console.log(`Creating text file: ${fileName} (${fileContent.length} characters)`)
      
      const fileMetadata = {
        name: fileName,
        parents: folderId ? [folderId] : undefined
      }

      console.log("Making Google Drive API request for text file:", fileName)
      
      const textBuffer = Buffer.from(fileContent, 'utf8')
      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: {
          mimeType: 'text/plain',
          body: Readable.from(textBuffer)
        }
      })

      console.log("Google Drive API success response for text file:", { fileId: response.data.id, fileName: response.data.name })
      
      results.push({
        fileName: fileName,
        fileId: response.data.id!,
        fileUrl: `https://drive.google.com/file/d/${response.data.id}/view`,
        size: textBuffer.length
      })
    }

    console.log(`Successfully created ${results.length} files in Google Drive:`, results)

    return {
      type: "google-drive:create_file",
      success: true,
      files: results,
      totalFiles: results.length,
      folderId: folderId || 'root',
      message: `Successfully created ${results.length} file(s) in Google Drive`
    }

  } catch (error: any) {
    console.error("Google Drive file creation failed:", error)
    throw new Error(`Google Drive file creation failed: ${error.message}`)
  }
}

async function executeGoogleDriveUploadFileNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "google_drive_action_upload_file",
      fileName: node.data.config?.fileName || "test-file.txt",
      test: true,
      message: "Test mode: File upload simulated"
    }
  }

  console.log("Starting Google Drive upload file execution...")

  const config = node.data.config || {}
  const fileUrl = config.fileUrl
  let fileName = config.fileName
  const folderId = config.folderId

  if (!fileUrl) {
    throw new Error("File URL is required")
  }
  // Don't set fallback filename here - let the logic below handle it properly

  // Get Google Drive integration from database
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "google-drive")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("Google Drive integration not connected")
  }

  console.log("Found Google Drive integration:", {
    id: integration.id,
    hasAccessToken: !!integration.access_token,
    hasRefreshToken: !!integration.refresh_token,
    expiresAt: integration.expires_at
  })

  // Ensure we have a valid access token
  let accessToken = integration.access_token
  if (integration.refresh_token) {
    try {
      const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
      
      // Check if token needs refresh
      const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
        accessTokenExpiryThreshold: 5 // Refresh if token expires in 5 minutes
      })
      
      if (shouldRefresh) {
        console.log("Access token needs refresh, refreshing...")
        const refreshResult = await TokenRefreshService.refreshTokenForProvider(
          "google-drive",
          integration.refresh_token,
          integration.id
        )
        
        if (refreshResult.success && refreshResult.accessToken) {
          accessToken = refreshResult.accessToken
          console.log("Successfully refreshed access token")
        } else {
          console.error("Failed to refresh access token:", refreshResult.error)
          throw new Error("Failed to refresh Google Drive access token")
        }
      } else {
        console.log("Access token is still valid")
      }
    } catch (error) {
      console.error("Error refreshing token:", error)
      throw new Error("Failed to refresh Google Drive access token")
    }
  }

  // Download the file from the URL
  let fileBuffer: Buffer
  let mimeType = "application/octet-stream"
  let actualFileName = fileName
  
  try {
    // Check if this is a Google Drive URL
    const googleDriveMatch = fileUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
    
    if (googleDriveMatch && (fileUrl.includes('drive.google.com') || fileUrl.includes('docs.google.com'))) {
      // This is a Google Drive URL - use the API to download the actual file
      const fileId = googleDriveMatch[1]
      console.log(`Detected Google Drive URL, extracting file ID: ${fileId}`)
      
      // First, get file metadata to determine the correct MIME type and filename
      const { google } = await import("googleapis")
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      const drive = google.drive({ version: "v3", auth: oauth2Client })
      
      // Get file metadata
      const fileMetadata = await drive.files.get({
        fileId: fileId,
        fields: 'id,name,mimeType,size'
      })
      
      const driveFile = fileMetadata.data
      mimeType = driveFile.mimeType || "application/octet-stream"
      actualFileName = driveFile.name || fileName
      
      console.log(`Google Drive file metadata:`, {
        name: driveFile.name,
        mimeType: driveFile.mimeType,
        size: driveFile.size
      })
      
      // Download the actual file content
      // Check if this is a Google Apps file that needs to be exported
      if (mimeType.startsWith('application/vnd.google-apps.')) {
        // This is a Google Apps file (Docs, Sheets, Slides, etc.) - need to export it
        let exportMimeType = 'application/pdf' // Default to PDF
        
        // Map Google Apps MIME types to export formats
        if (mimeType === 'application/vnd.google-apps.spreadsheet') {
          exportMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // Excel format
          actualFileName = actualFileName.replace(/\.[^.]*$/, '') + '.xlsx' // Change extension to .xlsx
        } else if (mimeType === 'application/vnd.google-apps.document') {
          exportMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // Word format
          actualFileName = actualFileName.replace(/\.[^.]*$/, '') + '.docx'
        } else if (mimeType === 'application/vnd.google-apps.presentation') {
          exportMimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' // PowerPoint format
          actualFileName = actualFileName.replace(/\.[^.]*$/, '') + '.pptx'
        } else {
          // For other Google Apps files, export as PDF
          actualFileName = actualFileName.replace(/\.[^.]*$/, '') + '.pdf'
        }
        
        console.log(`Exporting Google Apps file as ${exportMimeType}`)
        
        const exportResponse = await drive.files.export({
          fileId: fileId,
          mimeType: exportMimeType
        }, {
          responseType: 'arraybuffer'
        })
        
        fileBuffer = Buffer.from(exportResponse.data as ArrayBuffer)
        mimeType = exportMimeType // Update MIME type to the exported format
        
      } else {
        // Regular file - download as media
        const fileResponse = await drive.files.get({
          fileId: fileId,
          alt: 'media'
        }, {
          responseType: 'arraybuffer'
        })
        
        fileBuffer = Buffer.from(fileResponse.data as ArrayBuffer)
      }
      
      console.log(`Downloaded Google Drive file: ${actualFileName} (${fileBuffer.length} bytes, ${mimeType})`)
      
    } else {
      // Regular URL - download normally
      const fetch = (await import("node-fetch")).default
      const response = await fetch(fileUrl)
      if (!response.ok) {
        throw new Error(`Failed to download file from URL: ${response.status} ${response.statusText}`)
      }
      mimeType = response.headers.get("content-type") || mimeType
      fileBuffer = Buffer.from(await response.arrayBuffer())
      console.log(`Downloaded file: ${fileName} (${fileBuffer.length} bytes, ${mimeType})`)
    }
  } catch (error: any) {
    throw new Error(`Failed to download file from URL: ${error.message}`)
  }

  // Upload to Google Drive
  try {
    const { google } = await import("googleapis")
    const { Readable } = require("stream")
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: "v3", auth: oauth2Client })
    
    // Use user-provided filename if available, otherwise use original filename from URL
    const finalFileName = (fileName && fileName.trim() !== "") 
      ? fileName 
      : (actualFileName && actualFileName.trim() !== "" ? actualFileName : "downloaded-file")
    
    const fileMetadata = {
      name: finalFileName,
      parents: folderId ? [folderId] : undefined
    }
    const media = {
      mimeType,
      body: Readable.from(fileBuffer)
    }
    console.log("Making Google Drive API request for uploaded file:", finalFileName)
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media
    })
    console.log("Google Drive API success response:", { fileId: response.data.id, fileName: response.data.name })
    return {
      type: "google_drive_action_upload_file",
      success: true,
      fileId: response.data.id,
      fileName: response.data.name,
      fileUrl: `https://drive.google.com/file/d/${response.data.id}/view`,
      size: fileBuffer.length,
      mimeType,
      message: `Successfully uploaded ${finalFileName} to Google Drive`
    }
  } catch (error: any) {
    throw new Error(`Failed to upload file to Google Drive: ${error.message}`)
  }
}

async function executeOneDriveUploadFileFromUrlNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "onedrive_action_upload_file_from_url",
      fileName: node.data.config?.fileName || "test-file.txt",
      test: true,
      message: "Test mode: OneDrive file upload simulated"
    }
  }

  console.log("Starting OneDrive upload file from URL execution...")

  const config = node.data.config || {}
  const fileUrl = config.fileUrl
  let fileName = config.fileName
  const folderId = config.folderId

  if (!fileUrl) {
    throw new Error("File URL is required")
  }

  // Get OneDrive integration from database
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "onedrive")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("OneDrive integration not connected")
  }

  console.log("Found OneDrive integration:", {
    id: integration.id,
    hasAccessToken: !!integration.access_token,
    hasRefreshToken: !!integration.refresh_token,
    expiresAt: integration.expires_at
  })

  // Ensure we have a valid access token
  let accessToken = integration.access_token
  if (integration.refresh_token) {
    try {
      const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
      
      // Check if token needs refresh
      const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
        accessTokenExpiryThreshold: 5 // Refresh if token expires in 5 minutes
      })
      
      if (shouldRefresh) {
        console.log("Access token needs refresh, refreshing...")
        const refreshResult = await TokenRefreshService.refreshTokenForProvider(
          "onedrive",
          integration.refresh_token,
          integration.id
        )
        
        if (refreshResult.success && refreshResult.accessToken) {
          accessToken = refreshResult.accessToken
          console.log("Successfully refreshed access token")
        } else {
          console.error("Failed to refresh access token:", refreshResult.error)
          throw new Error("Failed to refresh OneDrive access token")
        }
      } else {
        console.log("Access token is still valid")
      }
    } catch (error) {
      console.error("Error refreshing token:", error)
      throw new Error("Failed to refresh OneDrive access token")
    }
  }

  // Download the file from the URL
  let fileBuffer: Buffer
  let mimeType = "application/octet-stream"
  let actualFileName = fileName
  
  try {
    const fetch = (await import("node-fetch")).default
    const response = await fetch(fileUrl)
    if (!response.ok) {
      throw new Error(`Failed to download file from URL: ${response.status} ${response.statusText}`)
    }
    mimeType = response.headers.get("content-type") || mimeType
    fileBuffer = Buffer.from(await response.arrayBuffer())
    
    // Extract filename from URL if not provided
    if (!actualFileName) {
      const urlParts = fileUrl.split('/')
      const lastPart = urlParts[urlParts.length - 1]
      if (lastPart && lastPart.includes('.')) {
        actualFileName = lastPart
      } else {
        actualFileName = "downloaded-file"
      }
    }
    
    console.log(`Downloaded file: ${actualFileName} (${fileBuffer.length} bytes, ${mimeType})`)
  } catch (error: any) {
    throw new Error(`Failed to download file from URL: ${error.message}`)
  }

  // Upload to OneDrive
  try {
    const finalFileName = (fileName && fileName.trim() !== "") 
      ? fileName 
      : (actualFileName && actualFileName.trim() !== "" ? actualFileName : "downloaded-file")
    
    const uploadUrl = folderId && folderId !== "root" 
      ? `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}:/${encodeURIComponent(finalFileName)}:/content`
      : `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(finalFileName)}:/content`
    
    console.log("Making OneDrive API request for uploaded file:", finalFileName)
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": mimeType,
      },
      body: fileBuffer
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`OneDrive API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }
    
    const result = await response.json()
    console.log("OneDrive API success response:", { fileId: result.id, fileName: result.name })
    
    return {
      type: "onedrive_action_upload_file_from_url",
      success: true,
      fileId: result.id,
      fileName: result.name,
      fileUrl: result.webUrl,
      size: fileBuffer.length,
      mimeType,
      message: `Successfully uploaded ${finalFileName} to OneDrive`
    }
  } catch (error: any) {
    throw new Error(`Failed to upload file to OneDrive: ${error.message}`)
  }
}

async function executeDropboxUploadFileFromUrlNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "dropbox_action_upload_file_from_url",
      fileName: node.data.config?.fileName || "test-file.txt",
      test: true,
      message: "Test mode: Dropbox file upload simulated"
    }
  }

  console.log("Starting Dropbox upload file from URL execution...")

  const config = node.data.config || {}
  const fileUrl = config.fileUrl
  let fileName = config.fileName
  const path = config.path

  if (!fileUrl) {
    throw new Error("File URL is required")
  }

  // Get Dropbox integration from database
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "dropbox")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("Dropbox integration not connected")
  }

  console.log("Found Dropbox integration:", {
    id: integration.id,
    hasAccessToken: !!integration.access_token,
    hasRefreshToken: !!integration.refresh_token,
    expiresAt: integration.expires_at
  })

  // Ensure we have a valid access token
  let accessToken = integration.access_token
  if (integration.refresh_token) {
    try {
      const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
      
      // Check if token needs refresh
      const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
        accessTokenExpiryThreshold: 5 // Refresh if token expires in 5 minutes
      })
      
      if (shouldRefresh) {
        console.log("Access token needs refresh, refreshing...")
        const refreshResult = await TokenRefreshService.refreshTokenForProvider(
          "dropbox",
          integration.refresh_token,
          integration.id
        )
        
        if (refreshResult.success && refreshResult.accessToken) {
          accessToken = refreshResult.accessToken
          console.log("Successfully refreshed access token")
        } else {
          console.error("Failed to refresh access token:", refreshResult.error)
          throw new Error("Failed to refresh Dropbox access token")
        }
      } else {
        console.log("Access token is still valid")
      }
    } catch (error) {
      console.error("Error refreshing token:", error)
      throw new Error("Failed to refresh Dropbox access token")
    }
  }

  // Download the file from the URL
  let fileBuffer: Buffer
  let mimeType = "application/octet-stream"
  let actualFileName = fileName
  
  try {
    const fetch = (await import("node-fetch")).default
    const response = await fetch(fileUrl)
    if (!response.ok) {
      throw new Error(`Failed to download file from URL: ${response.status} ${response.statusText}`)
    }
    mimeType = response.headers.get("content-type") || mimeType
    fileBuffer = Buffer.from(await response.arrayBuffer())
    
    // Extract filename from URL if not provided
    if (!actualFileName) {
      const urlParts = fileUrl.split('/')
      const lastPart = urlParts[urlParts.length - 1]
      if (lastPart && lastPart.includes('.')) {
        actualFileName = lastPart
      } else {
        actualFileName = "downloaded-file"
      }
    }
    
    console.log(`Downloaded file: ${actualFileName} (${fileBuffer.length} bytes, ${mimeType})`)
  } catch (error: any) {
    throw new Error(`Failed to download file from URL: ${error.message}`)
  }

  // Upload to Dropbox
  try {
    const finalFileName = (fileName && fileName.trim() !== "") 
      ? fileName 
      : (actualFileName && actualFileName.trim() !== "" ? actualFileName : "downloaded-file")
    
    const dropboxPath = path ? `${path}/${finalFileName}` : `/${finalFileName}`
    
    console.log("Making Dropbox API request for uploaded file:", finalFileName)
    const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: dropboxPath,
          mode: "add",
          autorename: true,
          mute: false
        })
      },
      body: fileBuffer
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Dropbox API error: ${response.status} - ${errorData.error_summary || response.statusText}`)
    }
    
    const result = await response.json()
    console.log("Dropbox API success response:", { fileId: result.id, fileName: result.name })
    
    return {
      type: "dropbox_action_upload_file_from_url",
      success: true,
      fileId: result.id,
      fileName: result.name,
      fileUrl: `https://www.dropbox.com/home${dropboxPath}`,
      size: fileBuffer.length,
      mimeType,
      message: `Successfully uploaded ${finalFileName} to Dropbox`
    }
  } catch (error: any) {
    throw new Error(`Failed to upload file to Dropbox: ${error.message}`)
  }
}

async function executeGoogleSheetsUnifiedAction(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "google_sheets_unified",
      action: node.data.config?.action || "add",
      spreadsheet_id: node.data.config?.spreadsheetId || "test-sheet",
      sheet_name: node.data.config?.sheetName || "Sheet1",
      test: true,
    }
  }

  console.log("Starting Google Sheets unified action execution...")

  // Get Google Sheets integration
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "google-sheets")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("Google Sheets integration not connected")
  }

  // Ensure we have a valid access token
  let accessToken = integration.access_token

  // Refresh token if needed
  if (integration.refresh_token) {
    try {
      const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
      
      const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
        accessTokenExpiryThreshold: 5
      })
      
      if (shouldRefresh) {
        const refreshResult = await TokenRefreshService.refreshTokenForProvider(
          "google-sheets",
          integration.refresh_token,
          integration.id
        )
        
        if (refreshResult.success && refreshResult.accessToken) {
          accessToken = refreshResult.accessToken
        } else {
          throw new Error("Failed to refresh Google Sheets access token")
        }
      }
    } catch (error) {
      throw new Error("Failed to refresh Google Sheets access token")
    }
  }

  const config = node.data.config || {}
  const action = config.action || "add"
  const spreadsheetId = config.spreadsheetId
  const sheetName = config.sheetName
  const columnMappings = config.columnMappings || {}
  const valueInputOption = config.valueInputOption || "USER_ENTERED"

  if (!spreadsheetId || !sheetName) {
    throw new Error("Spreadsheet ID and sheet name are required")
  }

  switch (action) {
    case "add":
      return await executeAddRowAction(accessToken, spreadsheetId, sheetName, columnMappings, valueInputOption, context)
    
    case "update":
      const selectedRow = config.selectedRow
      
      if (!selectedRow || !selectedRow.rowIndex) {
        throw new Error("A row must be selected for update operations")
      }
      
      return await executeUpdateRowAction(accessToken, spreadsheetId, sheetName, columnMappings, selectedRow.rowIndex, context)
    
    case "delete":
      const deleteSelectedRow = config.selectedRow
      
      if (!deleteSelectedRow || !deleteSelectedRow.rowIndex) {
        throw new Error("A row must be selected for delete operations")
      }
      
      return await executeDeleteRowAction(accessToken, spreadsheetId, sheetName, deleteSelectedRow.rowIndex, context)
    
    default:
      throw new Error(`Unsupported action: ${action}`)
  }
}

async function executeAddRowAction(accessToken: string, spreadsheetId: string, sheetName: string, columnMappings: any, valueInputOption: string, context: any) {
  // Convert column mappings to row values
  const sortedColumns = Object.keys(columnMappings).sort()
  const values = sortedColumns.map(column => {
    const value = columnMappings[column]
    return renderTemplate(value || "", context, "handlebars")
  })

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}:append?valueInputOption=${valueInputOption}&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [values],
      }),
    },
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Google Sheets API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
  }

  const result = await response.json()

  return {
    type: "google_sheets_unified",
    action: "add",
    spreadsheet_id: spreadsheetId,
    sheet_name: sheetName,
    values,
    range: result.updates?.updatedRange,
    updated_rows: result.updates?.updatedRows,
    updated_cells: result.updates?.updatedCells
  }
}

async function executeUpdateRowAction(accessToken: string, spreadsheetId: string, sheetName: string, columnMappings: any, rowIndex: number, context: any) {
  // Update the specific cells in the selected row
  const updatePromises = Object.entries(columnMappings).map(async ([column, value]) => {
    const cellValue = renderTemplate(value as string || "", context, "handlebars")
    const range = `${sheetName}!${column}${rowIndex}`
    
    return fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [[cellValue]],
        }),
      },
    )
  })

  const updateResponses = await Promise.all(updatePromises)
  
  // Check if all updates were successful
  for (const response of updateResponses) {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to update row: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }
  }

  return {
    type: "google_sheets_unified",
    action: "update",
    spreadsheet_id: spreadsheetId,
    sheet_name: sheetName,
    row_number: rowIndex,
    updated_columns: Object.keys(columnMappings)
  }
}

async function executeDeleteRowAction(accessToken: string, spreadsheetId: string, sheetName: string, rowIndex: number, context: any) {
  // First, get the sheet ID
  const sheetResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  if (!sheetResponse.ok) {
    throw new Error("Failed to get sheet information")
  }

  const sheetData = await sheetResponse.json()
  const sheet = sheetData.sheets.find((s: any) => s.properties.title === sheetName)
  
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`)
  }

  const sheetId = sheet.properties.sheetId

  // Delete the row using batchUpdate (convert to 0-based index for API)
  const deleteResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: "ROWS",
                startIndex: rowIndex - 1, // Convert to 0-based index
                endIndex: rowIndex // endIndex is exclusive
              }
            }
          }
        ]
      }),
    },
  )

  if (!deleteResponse.ok) {
    const errorData = await deleteResponse.json().catch(() => ({}))
    throw new Error(`Failed to delete row: ${deleteResponse.status} - ${errorData.error?.message || deleteResponse.statusText}`)
  }

  return {
    type: "google_sheets_unified",
    action: "delete",
    spreadsheet_id: spreadsheetId,
    sheet_name: sheetName,
    deleted_row: rowIndex
  }
}

async function executeSheetsCreateSpreadsheetNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "sheets_create_spreadsheet",
      title: node.data.config?.title || "Test Spreadsheet",
      test: true,
      spreadsheet_id: "test-spreadsheet-id",
      spreadsheet_url: "https://docs.google.com/spreadsheets/d/test-spreadsheet-id"
    }
  }

  console.log("Starting Google Sheets create spreadsheet execution...")

  // Get Google Sheets integration
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "google-sheets")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("Google Sheets integration not connected")
  }

  console.log("Found Google Sheets integration:", {
    id: integration.id,
    hasAccessToken: !!integration.access_token,
    hasRefreshToken: !!integration.refresh_token,
    expiresAt: integration.expires_at
  })

  // Ensure we have a valid access token
  let accessToken = integration.access_token

  // Refresh token if needed
  if (integration.refresh_token) {
    try {
      const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
      
      // Check if token needs refresh
      const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
        accessTokenExpiryThreshold: 5 // Refresh if token expires in 5 minutes
      })
      
      if (shouldRefresh) {
        console.log("Access token needs refresh, refreshing...")
        const refreshResult = await TokenRefreshService.refreshTokenForProvider(
          "google-sheets",
          integration.refresh_token,
          integration.id
        )
        
        if (refreshResult.success && refreshResult.accessToken) {
          accessToken = refreshResult.accessToken
          console.log("Successfully refreshed access token")
        } else {
          console.error("Failed to refresh access token:", refreshResult.error)
          throw new Error("Failed to refresh Google Sheets access token")
        }
      } else {
        console.log("Access token is still valid")
      }
    } catch (error) {
      console.error("Error refreshing token:", error)
      throw new Error("Failed to refresh Google Sheets access token")
    }
  }

  const config = node.data.config || {}
  const title = renderTemplate(config.title || "New Spreadsheet", context, "handlebars")
  const description = config.description ? renderTemplate(config.description, context, "handlebars") : undefined
  const sheets = config.sheets || [{ name: "Sheet1", columns: 5, columnNames: ["Column 1", "Column 2", "Column 3", "Column 4", "Column 5"] }]
  const locale = config.locale || "en_US"
  
  // Auto-detect user's timezone if not specified
  let timeZone = config.timeZone
  if (!timeZone) {
    try {
      // Get user's timezone from the request context or default to UTC
      timeZone = context.userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    } catch (error) {
      console.warn("Could not detect user timezone, using UTC:", error)
      timeZone = "UTC"
    }
  }

  if (!title) {
    throw new Error("Spreadsheet title is required")
  }

  console.log("Creating Google Sheets spreadsheet:", {
    title,
    description,
    sheets: sheets.map((s: any) => ({ name: s.name, columns: s.columns })),
    locale,
    timeZone
  })

  try {
    // Create the spreadsheet with multiple sheets
    const createResponse = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            title,
            locale,
            timeZone,
            ...(description && { description })
          },
          sheets: sheets.map((sheet: any) => ({
            properties: {
              title: renderTemplate(sheet.name, context, "handlebars"),
              gridProperties: {
                rowCount: 1000,
                columnCount: Math.max(sheet.columns, 1)
              }
            }
          }))
        }),
      },
    )

    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => ({}))
      console.error("Google Sheets API error:", {
        status: createResponse.status,
        statusText: createResponse.statusText,
        error: errorData
      })
      throw new Error(`Google Sheets API error: ${createResponse.status} - ${errorData.error?.message || createResponse.statusText}`)
    }

    const createResult = await createResponse.json()
    const spreadsheetId = createResult.spreadsheetId
    const spreadsheetUrl = createResult.spreadsheets?.properties?.title ? 
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : undefined

    console.log("Created Google Sheets spreadsheet:", {
      spreadsheetId,
      title: createResult.spreadsheets?.properties?.title,
      url: spreadsheetUrl
    })

    // Add headers with custom column names to each sheet if addHeaders is enabled
    if (config.addHeaders !== false) {
      try {
        for (let i = 0; i < sheets.length; i++) {
          const sheet = sheets[i]
          const columnNames = sheet.columnNames || []
          
          if (columnNames.length > 0) {
            const processedColumnNames = columnNames.map((name: string) => 
              renderTemplate(name, context, "handlebars")
            )
            
            const endColumn = String.fromCharCode(65 + processedColumnNames.length - 1)
            const range = `${sheet.name}!A1:${endColumn}1`
            
            console.log(`Adding headers to sheet ${sheet.name}:`, processedColumnNames)
            
            const headerResponse = await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
              {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  values: [processedColumnNames],
                }),
              },
            )
            
            if (headerResponse.ok) {
              console.log(`Successfully added headers to sheet ${sheet.name}`)
            } else {
              console.warn(`Failed to add headers to sheet ${sheet.name}:`, headerResponse.statusText)
            }
          }
        }
      } catch (error) {
        console.warn("Error adding headers to sheets:", error)
      }
    }



    return {
      type: "sheets_create_spreadsheet",
      spreadsheet_id: spreadsheetId,
      title: createResult.spreadsheets?.properties?.title,
      description: createResult.spreadsheets?.properties?.description,
      spreadsheet_url: spreadsheetUrl,
      sheets: sheets.map((s: any) => ({ 
        name: s.name, 
        columns: s.columns, 
        columnNames: s.columnNames || []
      })),
      locale,
      time_zone: timeZone
    }

  } catch (error: any) {
    console.error("Error creating Google Sheets spreadsheet:", error)
    throw error
  }
}

// Google Docs Execution Functions
async function executeGoogleDocsCreateDocumentNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "google_docs_create_document",
      title: node.data.config?.title || "Test Document",
      test: true,
      document_id: "test-document-id",
      document_url: "https://docs.google.com/document/d/test-document-id/edit"
    }
  }

  console.log("Starting Google Docs create document execution...")

  // Get Google Docs integration
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "google-docs")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("Google Docs integration not connected")
  }

  console.log("Found Google Docs integration:", {
    id: integration.id,
    hasAccessToken: !!integration.access_token,
    hasRefreshToken: !!integration.refresh_token,
    expiresAt: integration.expires_at
  })

  // Ensure we have a valid access token
  let accessToken = integration.access_token
  if (integration.refresh_token) {
    try {
      const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
      
      const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
        accessTokenExpiryThreshold: 5
      })
      
      if (shouldRefresh) {
        console.log("Access token needs refresh, refreshing...")
        const refreshResult = await TokenRefreshService.refreshTokenForProvider(
          "google-docs",
          integration.refresh_token,
          integration.id
        )
        
        if (refreshResult.success && refreshResult.accessToken) {
          accessToken = refreshResult.accessToken
          console.log("Successfully refreshed access token")
        } else {
          console.error("Failed to refresh access token:", refreshResult.error)
          throw new Error("Failed to refresh Google Docs access token")
        }
      } else {
        console.log("Access token is still valid")
      }
    } catch (error) {
      console.error("Error refreshing token:", error)
      throw new Error("Failed to refresh Google Docs access token")
    }
  }

  const config = node.data.config || {}
  const title = renderTemplate(config.title || "New Document", context, "handlebars")
  const content = config.content ? renderTemplate(config.content, context, "handlebars") : ""
  const templateId = config.templateId
  const folderId = config.folderId
  const shareWith = config.shareWith
  const permission = config.permission || "writer"

  if (!title) {
    throw new Error("Document title is required")
  }

  console.log("Creating Google Docs document:", {
    title,
    hasContent: !!content,
    templateId,
    folderId,
    shareWith
  })

  try {
    // Create the document
    const createResponse = await fetch(
      "https://docs.googleapis.com/v1/documents",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
        }),
      },
    )

    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => ({}))
      console.error("Google Docs API error:", {
        status: createResponse.status,
        statusText: createResponse.statusText,
        error: errorData
      })
      throw new Error(`Google Docs API error: ${createResponse.status} - ${errorData.error?.message || createResponse.statusText}`)
    }

    const createResult = await createResponse.json()
    const documentId = createResult.documentId
    const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`

    console.log("Created Google Docs document:", {
      documentId,
      title: createResult.title,
      url: documentUrl
    })

    // Add content if provided
    if (content) {
      const contentResponse = await fetch(
        `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [
              {
                insertText: {
                  location: {
                    index: 1
                  },
                  text: content
                }
              }
            ]
          }),
        },
      )

      if (!contentResponse.ok) {
        console.warn("Failed to add content to document:", contentResponse.statusText)
      } else {
        console.log("Successfully added content to document")
      }
    }

    // Move to folder if specified
    if (folderId && folderId !== "root") {
      try {
        const moveResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${documentId}?addParents=${folderId}&removeParents=root`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          },
        )

        if (!moveResponse.ok) {
          console.warn("Failed to move document to folder:", moveResponse.statusText)
        } else {
          console.log("Successfully moved document to folder")
        }
      } catch (error) {
        console.warn("Error moving document to folder:", error)
      }
    }

    // Share document if specified
    if (shareWith) {
      try {
        const emails = shareWith.split(",").map((email: string) => email.trim())
        
        for (const email of emails) {
          const shareResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${documentId}/permissions`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                type: "user",
                role: permission,
                emailAddress: email,
                sendNotificationEmail: true
              }),
            },
          )

          if (!shareResponse.ok) {
            console.warn(`Failed to share document with ${email}:`, shareResponse.statusText)
          } else {
            console.log(`Successfully shared document with ${email}`)
          }
        }
      } catch (error) {
        console.warn("Error sharing document:", error)
      }
    }

    return {
      type: "google_docs_create_document",
      success: true,
      document_id: documentId,
      title: createResult.title,
      document_url: documentUrl,
      content_length: content ? content.length : 0,
      shared_with: shareWith ? shareWith.split(",").length : 0,
      message: `Successfully created document "${title}"`
    }
  } catch (error: any) {
    throw new Error(`Failed to create Google Docs document: ${error.message}`)
  }
}

async function executeGoogleDocsReadDocumentNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "google_docs_read_document",
      document_id: node.data.config?.documentId || "test-document-id",
      test: true,
      content: "Test document content",
      content_length: 25
    }
  }

  console.log("Starting Google Docs read document execution...")

  // Get Google Docs integration
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "google-docs")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("Google Docs integration not connected")
  }

  // Ensure we have a valid access token
  let accessToken = integration.access_token
  if (integration.refresh_token) {
    try {
      const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
      
      const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
        accessTokenExpiryThreshold: 5
      })
      
      if (shouldRefresh) {
        console.log("Access token needs refresh, refreshing...")
        const refreshResult = await TokenRefreshService.refreshTokenForProvider(
          "google-docs",
          integration.refresh_token,
          integration.id
        )
        
        if (refreshResult.success && refreshResult.accessToken) {
          accessToken = refreshResult.accessToken
          console.log("Successfully refreshed access token")
        } else {
          console.error("Failed to refresh access token:", refreshResult.error)
          throw new Error("Failed to refresh Google Docs access token")
        }
      } else {
        console.log("Access token is still valid")
      }
    } catch (error) {
      console.error("Error refreshing token:", error)
      throw new Error("Failed to refresh Google Docs access token")
    }
  }

  const config = node.data.config || {}
  const documentId = config.documentId
  const includeFormatting = config.includeFormatting || false
  const includeComments = config.includeComments || false
  const outputFormat = config.outputFormat || "text"

  if (!documentId) {
    throw new Error("Document ID is required")
  }

  console.log("Reading Google Docs document:", {
    documentId,
    includeFormatting,
    includeComments,
    outputFormat
  })

  try {
    // Read the document
    const readResponse = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    if (!readResponse.ok) {
      const errorData = await readResponse.json().catch(() => ({}))
      console.error("Google Docs API error:", {
        status: readResponse.status,
        statusText: readResponse.statusText,
        error: errorData
      })
      throw new Error(`Google Docs API error: ${readResponse.status} - ${errorData.error?.message || readResponse.statusText}`)
    }

    const document = await readResponse.json()
    const title = document.title
    const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`

    // Extract content based on output format
    let content = ""
    let formattedContent = null

    if (outputFormat === "json") {
      formattedContent = document
    } else {
      // Extract plain text content
      if (document.body && document.body.content) {
        content = extractTextFromDocument(document.body.content)
      }
    }

    console.log("Successfully read Google Docs document:", {
      documentId,
      title,
      contentLength: content.length,
      outputFormat
    })

    return {
      type: "google_docs_read_document",
      success: true,
      document_id: documentId,
      title,
      document_url: documentUrl,
      content: outputFormat === "json" ? null : content,
      formatted_content: outputFormat === "json" ? formattedContent : null,
      content_length: content.length,
      output_format: outputFormat,
      message: `Successfully read document "${title}"`
    }
  } catch (error: any) {
    throw new Error(`Failed to read Google Docs document: ${error.message}`)
  }
}

// Helper function to extract text from document content
function extractTextFromDocument(content: any[]): string {
  let text = ""
  
  for (const element of content) {
    if (element.paragraph) {
      for (const element2 of element.paragraph.elements || []) {
        if (element2.textRun) {
          text += element2.textRun.content || ""
        }
      }
      text += "\n"
    }
  }
  
  return text.trim()
}

async function executeGoogleDocsUpdateDocumentNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "google_docs_update_document",
      document_id: node.data.config?.documentId || "test-document-id",
      test: true,
      operation: "insert",
      content_length: 25
    }
  }

  console.log("Starting Google Docs update document execution...")

  // Get Google Docs integration
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", context.userId)
    .eq("provider", "google-docs")
    .eq("status", "connected")
    .single()

  if (!integration) {
    throw new Error("Google Docs integration not connected")
  }

  // Ensure we have a valid access token
  let accessToken = integration.access_token
  if (integration.refresh_token) {
    try {
      const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
      
      const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
        accessTokenExpiryThreshold: 5
      })
      
      if (shouldRefresh) {
        console.log("Access token needs refresh, refreshing...")
        const refreshResult = await TokenRefreshService.refreshTokenForProvider(
          "google-docs",
          integration.refresh_token,
          integration.id
        )
        
        if (refreshResult.success && refreshResult.accessToken) {
          accessToken = refreshResult.accessToken
          console.log("Successfully refreshed access token")
        } else {
          console.error("Failed to refresh access token:", refreshResult.error)
          throw new Error("Failed to refresh Google Docs access token")
        }
      } else {
        console.log("Access token is still valid")
      }
    } catch (error) {
      console.error("Error refreshing token:", error)
      throw new Error("Failed to refresh Google Docs access token")
    }
  }

  const config = node.data.config || {}
  const documentId = config.documentId
  const operation = config.operation || "insert"
  const content = renderTemplate(config.content || "", context, "handlebars")
  const location = config.location
  const formatting = config.formatting || "none"

  if (!documentId) {
    throw new Error("Document ID is required")
  }

  if (!content) {
    throw new Error("Content is required")
  }

  console.log("Updating Google Docs document:", {
    documentId,
    operation,
    contentLength: content.length,
    location,
    formatting
  })

  try {
    // Build the update request based on operation type
    let requests = []

    if (operation === "append") {
      // Get document length first
      const readResponse = await fetch(
        `https://docs.googleapis.com/v1/documents/${documentId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!readResponse.ok) {
        throw new Error("Failed to read document for append operation")
      }

      const document = await readResponse.json()
      const endIndex = document.body.content ? document.body.content.length : 1

      requests.push({
        insertText: {
          location: {
            index: endIndex
          },
          text: content
        }
      })
    } else if (operation === "insert") {
      const insertIndex = location ? parseInt(location) : 1
      requests.push({
        insertText: {
          location: {
            index: insertIndex
          },
          text: content
        }
      })
    } else if (operation === "replace") {
      // Find text to replace
      const readResponse = await fetch(
        `https://docs.googleapis.com/v1/documents/${documentId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!readResponse.ok) {
        throw new Error("Failed to read document for replace operation")
      }

      const document = await readResponse.json()
      const documentText = extractTextFromDocument(document.body.content || [])
      
      if (location && documentText.includes(location)) {
        const startIndex = documentText.indexOf(location)
        const endIndex = startIndex + location.length
        
        requests.push({
          deleteContentRange: {
            range: {
              startIndex,
              endIndex
            }
          }
        })
        
        requests.push({
          insertText: {
            location: {
              index: startIndex
            },
            text: content
          }
        })
      } else {
        // If text not found, append instead
        requests.push({
          insertText: {
            location: {
              index: documentText.length + 1
            },
            text: content
          }
        })
      }
    } else if (operation === "delete") {
      if (location) {
        const readResponse = await fetch(
          `https://docs.googleapis.com/v1/documents/${documentId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          },
        )

        if (!readResponse.ok) {
          throw new Error("Failed to read document for delete operation")
        }

        const document = await readResponse.json()
        const documentText = extractTextFromDocument(document.body.content || [])
        
        if (documentText.includes(location)) {
          const startIndex = documentText.indexOf(location)
          const endIndex = startIndex + location.length
          
          requests.push({
            deleteContentRange: {
              range: {
                startIndex,
                endIndex
              }
            }
          })
        }
      }
    }

    // Apply formatting if specified
    if (formatting !== "none" && requests.length > 0) {
      const formattingRequest = buildFormattingRequest(formatting, requests[0])
      if (formattingRequest) {
        requests.push(formattingRequest)
      }
    }

    // Execute the update
    const updateResponse = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests
        }),
      },
    )

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json().catch(() => ({}))
      console.error("Google Docs API error:", {
        status: updateResponse.status,
        statusText: updateResponse.statusText,
        error: errorData
      })
      throw new Error(`Google Docs API error: ${updateResponse.status} - ${errorData.error?.message || updateResponse.statusText}`)
    }

    console.log("Successfully updated Google Docs document")

    return {
      type: "google_docs_update_document",
      success: true,
      document_id: documentId,
      operation,
      content_length: content.length,
      formatting_applied: formatting !== "none",
      message: `Successfully ${operation}ed content in document`
    }
  } catch (error: any) {
    throw new Error(`Failed to update Google Docs document: ${error.message}`)
  }
}

// Helper function to build formatting requests
function buildFormattingRequest(formatting: string, insertRequest: any) {
  const formatMap: Record<string, any> = {
    bold: { bold: true },
    italic: { italic: true },
    underline: { underline: true },
    heading1: { paragraphStyle: { namedStyleType: "HEADING_1" } },
    heading2: { paragraphStyle: { namedStyleType: "HEADING_2" } },
    heading3: { paragraphStyle: { namedStyleType: "HEADING_3" } }
  }

  const format = formatMap[formatting]
  if (!format) return null

  return {
    updateTextStyle: {
      textStyle: format,
      range: {
        startIndex: insertRequest.insertText.location.index,
        endIndex: insertRequest.insertText.location.index + insertRequest.insertText.text.length
      },
      fields: Object.keys(format).join(",")
    }
  }
}
