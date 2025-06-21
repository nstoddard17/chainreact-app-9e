import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  cookies()
  const supabase = createSupabaseRouteHandlerClient()

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { workflowId, testMode = false, inputData = {} } = await request.json()

    // Get workflow
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .eq("user_id", session.user.id)
      .single()

    if (workflowError || !workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    // Create execution record
    const { data: execution, error: executionError } = await supabase
      .from("workflow_executions")
      .insert({
        workflow_id: workflowId,
        user_id: session.user.id,
        status: "running",
        input_data: inputData,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (executionError) {
      return NextResponse.json({ error: "Failed to create execution" }, { status: 500 })
    }

    try {
      // Execute workflow with enhanced engine
      const result = await executeWorkflowAdvanced(workflow, inputData, session.user.id, testMode)

      // Update execution with success
      await supabase
        .from("workflow_executions")
        .update({
          status: "success",
          output_data: result,
          completed_at: new Date().toISOString(),
          execution_time_ms: Date.now() - new Date(execution.started_at).getTime(),
        })
        .eq("id", execution.id)

      return NextResponse.json({ success: true, executionId: execution.id, result })
    } catch (error: any) {
      // Handle retry logic
      const shouldRetry = await handleExecutionError(supabase, execution.id, error, session.user.id)

      if (!shouldRetry) {
        // Update execution with error
        await supabase
          .from("workflow_executions")
          .update({
            status: "error",
            error_message: error.message,
            completed_at: new Date().toISOString(),
            execution_time_ms: Date.now() - new Date(execution.started_at).getTime(),
          })
          .eq("id", execution.id)
      }

      return NextResponse.json({ success: false, error: error.message, willRetry: shouldRetry }, { status: 500 })
    }
  } catch (error) {
    console.error("Workflow execution error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function executeWorkflowAdvanced(workflow: any, inputData: any, userId: string, testMode: boolean) {
  const nodes = workflow.nodes || []
  const connections = workflow.connections || []

  if (nodes.length === 0) {
    throw new Error("Workflow has no nodes")
  }

  // Find trigger nodes (nodes with no incoming connections)
  const triggerNodes = nodes.filter((node: any) => !connections.some((conn: any) => conn.target === node.id))

  if (triggerNodes.length === 0) {
    throw new Error("Workflow has no trigger nodes")
  }

  const executionContext = {
    data: inputData,
    variables: {},
    results: {},
    testMode,
    userId,
    workflowId: workflow.id,
  }

  // Load workflow variables
  const { data: variables } = await supabase.from("workflow_variables").select("*").eq("workflow_id", workflow.id)

  if (variables) {
    variables.forEach((variable: any) => {
      executionContext.variables[variable.name] = variable.value
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
  console.log(`Executing node: ${node.id} (${node.data.type})`)

  try {
    let nodeResult

    switch (node.data.type) {
      // Triggers
      case "webhook":
        nodeResult = await executeWebhookNode(node, context)
        break
      case "schedule":
        nodeResult = await executeScheduleNode(node, context)
        break
      case "email_trigger":
        nodeResult = await executeEmailTriggerNode(node, context)
        break
      case "file_upload":
        nodeResult = await executeFileUploadNode(node, context)
        break

      // Actions
      case "slack_message":
        nodeResult = await executeSlackMessageNode(node, context)
        break
      case "calendar_event":
        nodeResult = await executeCalendarEventNode(node, context)
        break
      case "sheets_append":
        nodeResult = await executeSheetsAppendNode(node, context)
        break
      case "send_email":
        nodeResult = await executeSendEmailNode(node, context)
        break
      case "webhook_call":
        nodeResult = await executeWebhookCallNode(node, context)
        break

      // Logic & Control
      case "if_condition":
        nodeResult = await executeIfConditionNode(node, context)
        break
      case "switch_case":
        nodeResult = await executeSwitchCaseNode(node, context)
        break
      case "filter":
        nodeResult = await executeFilterNode(node, context)
        break
      case "delay":
        nodeResult = await executeDelayNode(node, context)
        break
      case "loop":
        nodeResult = await executeLoopNode(node, allNodes, connections, context)
        break

      // Data Operations
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

      default:
        throw new Error(`Unsupported node type: ${node.data.type}`)
    }

    // Store result
    context.results[node.id] = nodeResult

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
      // Update context with current node's output
      context.data = { ...context.data, ...result }
      await executeNodeAdvanced(targetNode, allNodes, connections, context)
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

async function executeEmailTriggerNode(node: any, context: any) {
  return {
    type: "email_trigger",
    email_address: node.data.config?.email_address,
    subject_filter: node.data.config?.subject_filter,
    sender_filter: node.data.config?.sender_filter,
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
    const supabase = createSupabaseRouteHandlerClient()
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
    // Simple template rendering - in production, use Handlebars, Mustache, etc.
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = evaluateExpression(path.trim(), context)
      return String(value || "")
    })
  } catch (error) {
    throw new Error(`Template rendering error: ${error}`)
  }
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
  const supabase = createSupabaseRouteHandlerClient()
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

  // Get Google Calendar integration
  const supabase = createSupabaseRouteHandlerClient()
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

  const title = renderTemplate(node.data.config?.title || "ChainReact Event", context, "handlebars")
  const description = renderTemplate(node.data.config?.description || "", context, "handlebars")

  const startTime = new Date()
  const endTime = new Date(startTime.getTime() + (node.data.config?.duration || 60) * 60000)

  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integration.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: title,
      description,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: "UTC",
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: "UTC",
      },
    }),
  })

  const result = await response.json()

  if (result.error) {
    throw new Error(`Google Calendar API error: ${result.error.message}`)
  }

  return {
    type: "calendar_event",
    title,
    description,
    event_id: result.id,
    event_link: result.htmlLink,
  }
}

async function executeSheetsAppendNode(node: any, context: any) {
  if (context.testMode) {
    return {
      type: "sheets_append",
      spreadsheet_id: node.data.config?.spreadsheet_id || "test-sheet",
      sheet_name: node.data.config?.sheet_name || "Sheet1",
      test: true,
    }
  }

  // Get Google Sheets integration
  const supabase = createSupabaseRouteHandlerClient()
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

  // Parse and evaluate values
  const valuesConfig = node.data.config?.values || '["{{data.timestamp}}", "{{data.message}}"]'
  const values = JSON.parse(valuesConfig).map((value: string) => renderTemplate(value, context, "handlebars"))

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${node.data.config?.spreadsheet_id}/values/${node.data.config?.sheet_name}:append?valueInputOption=RAW`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [values],
      }),
    },
  )

  const result = await response.json()

  if (result.error) {
    throw new Error(`Google Sheets API error: ${result.error.message}`)
  }

  return {
    type: "sheets_append",
    spreadsheet_id: node.data.config?.spreadsheet_id,
    sheet_name: node.data.config?.sheet_name,
    values,
    range: result.updates?.updatedRange,
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
