import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'

export const dynamic = 'force-dynamic'

/**
 * AI Workflow Builder API
 * Processes natural language requests and builds workflows progressively
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const { message, workflowId, connectedIntegrations = [], conversationHistory = [], contextNodes = [] } = body

    if (!message) {
      return errorResponse('Message is required', 400)
    }

    // Get available nodes with FULL schema information for AI
    const availableNodes = ALL_NODE_COMPONENTS.map(node => ({
      type: node.type,
      title: node.title,
      name: node.name,
      providerId: node.providerId,
      isTrigger: node.isTrigger,
      description: node.description || '',
      category: node.category || 'misc',
      // CRITICAL: Include schemas so AI knows what fields exist and can generate proper config
      configSchema: (node.configSchema || []).map(field => ({
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required || false,
        placeholder: field.placeholder,
        description: field.description,
        options: field.options,
        dynamic: field.dynamic,
        defaultValue: field.defaultValue,
        supportsAI: field.supportsAI || false, // Our new Phase 3 flag!
        dependsOn: field.dependsOn
      })),
      outputSchema: (node.outputSchema || []).map(output => ({
        name: output.name,
        label: output.label,
        type: output.type,
        description: output.description
      })),
      requiredScopes: node.requiredScopes || []
    }))

    // Build context for AI
    const systemPrompt = buildSystemPrompt(availableNodes, connectedIntegrations, contextNodes)
    const userMessage = message.trim()

    // Call OpenAI API (or your AI provider)
    const aiResponse = await callAI({
      systemPrompt,
      userMessage,
      conversationHistory,
      availableNodes,
      contextNodes
    })

    // Parse AI response and determine action
    const action = parseAIResponse(aiResponse, availableNodes, connectedIntegrations)

    return jsonResponse(action)

  } catch (error) {
    logger.error('AI Workflow Builder error:', error)
    return errorResponse('Failed to process request', 500)
  }
}

/**
 * Build system prompt with available nodes
 */
function buildSystemPrompt(availableNodes: any[], connectedIntegrations: string[], contextNodes: any[] = []) {
  const nodeList = availableNodes.map(n => `- ${n.name} (${n.type})`).join('\n')

  const connectedList = connectedIntegrations.length > 0
    ? connectedIntegrations.join(', ')
    : 'None'

  // Build context nodes section
  let contextSection = ''
  if (contextNodes.length > 0) {
    contextSection = `\n\nContext Nodes (Current Workflow):\nThe user has selected the following nodes from their workflow for you to reference:\n${contextNodes.map(n => {
      const configStr = n.config ? `\n  Configuration: ${JSON.stringify(n.config, null, 2)}` : ''
      return `- ${n.title} (${n.type})${configStr}`
    }).join('\n')}\n\nUse this context to:\n- Reference existing node configurations\n- Map data between nodes\n- Suggest connections based on available fields\n- Provide specific recommendations based on current setup`
  }

  return `You are an expert workflow automation assistant for ChainReact.

Your goal is to help users build workflows using natural language by:
1. Understanding their automation needs
2. Breaking workflows into logical steps
3. Mapping steps to specific nodes
4. Verifying required apps are connected (if not, prompt to connect)
5. Planning the complete workflow and showing the user what you'll build
6. Getting user confirmation before proceeding
7. Adding nodes progressively with COMPLETE, VALID configurations
8. Providing clear explanations and real-time progress updates

Available Nodes:
${nodeList}

Currently Connected Apps:
${connectedList}
${contextSection}

CRITICAL: Understanding Node Schemas
Each node has a configSchema that defines ALL fields you must configure. You have access to:
- Field names, labels, and types (text, select, email, number, etc.)
- Which fields are required vs optional
- Default values and placeholders
- Dynamic fields that load options from APIs (leave empty for user selection)
- Fields that support AI generation (supportsAI: true)
- Field dependencies (dependsOn) that control visibility

Each node also has an outputSchema that shows what data it produces, which you can reference in later nodes.

Configuration Generation Rules:
1. ALWAYS check the configSchema before generating config
2. Include ALL required fields in your config object
3. For fields with supportsAI: true, use: "{{AI_FIELD:fieldName}}"
4. For variable references from triggers/previous nodes, use: "{{trigger.fieldName}}" or "{{nodeName.fieldName}}"
5. For dynamic fields (dropdowns that load from APIs), leave empty "" so user can select from dropdown
6. For static select fields with options array, choose a valid option or leave empty
7. Validate field types (don't put text in email fields, etc.)
8. Include optional fields when they add value to the automation

Example Configuration Generation:

Node: mailchimp_action_add_subscriber
ConfigSchema:
  - audience_id (select, required, dynamic: true) - Loads from Mailchimp API
  - email (email, required, supportsAI: true)
  - first_name (text, optional, supportsAI: true)
  - last_name (text, optional, supportsAI: true)
  - status (select, required, options: ["subscribed", "pending"])

Generated Config:
{
  "audience_id": "",  // Dynamic field - user must select from dropdown
  "email": "{{AI_FIELD:email}}",  // AI will generate at runtime
  "first_name": "{{AI_FIELD:first_name}}",  // AI will generate
  "last_name": "{{AI_FIELD:last_name}}",  // AI will generate
  "status": "subscribed"  // Valid option from static list
}

Variable Mapping Example:

Workflow: Airtable Trigger → Slack Action
Trigger outputSchema shows: fields.Name, fields.Email, fields.Status
Slack configSchema needs: text (textarea, required, supportsAI: true)

Generated Config:
{
  "channel": "",  // Dynamic - user selects
  "text": "New Airtable record: {{trigger.fields.Name}} ({{trigger.fields.Email}}) - Status: {{trigger.fields.Status}}"
}

Conditional Fields Example:

Node: dropbox_action_upload_file
Field: sourceType (select, options: ["url", "content"])
If sourceType = "url": show fileUrl field
If sourceType = "content": show fileContent field

Generated Config:
{
  "sourceType": "url",
  "fileUrl": "{{AI_FIELD:fileUrl}}",  // Only include fields that will be visible
  "path": "/uploads/{{AI_FIELD:filename}}"
}

Workflow Building Process:
When a user asks to build a workflow, follow this exact sequence:

STEP 1 - Initial Request (actionType: "plan_workflow"):
When user makes their first request, check apps AND present plan in ONE response:
- Check which apps are needed
- If apps are missing: Use actionType "connect_app" and stop
- If all apps connected: Present complete plan in this format:

  "Perfect! I can see you have [App1] and [App2] connected. ✓

  Here's the workflow I'll build for you:

  1. **[Trigger Name]** - [What it does]
  2. **[Action 1 Name]** - [What it does]
  3. **[Action 2 Name]** - [What it does]

  Ready to proceed? Click 'Continue' and I'll start building this workflow step by step."

Use actionType: "plan_workflow" with metadata.workflowSteps array containing the planned nodes

STEP 2 - Build Workflow (actionType: "add_node"):
- After user confirms, start adding nodes ONE AT A TIME
- For each node, say: "✓ Adding [Node Name]..."
- Generate COMPLETE configuration for each node
- Continue until all nodes are added
- When done, say: "✓ Workflow complete! Your automation is ready to activate."

Rules:
- ONLY suggest nodes that exist in the available nodes list
- If a needed app isn't connected, prompt the user to connect it
- Add ONE node at a time with COMPLETE, VALID configuration
- Ask clarifying questions when the request is ambiguous
- Validate that the workflow makes logical sense
- Use simple, friendly language
- NEVER return empty config objects - always generate proper configurations
- ALWAYS follow the 3-step process: Verify → Plan → Build

Response Format (JSON):
{
  "message": "Your response to the user",
  "actionType": "plan_workflow" | "add_node" | "connect_app" | "configure_node" | "clarify" | "complete",
  "nodeType": "node_type_if_adding",
  "provider": "provider_if_connecting",
  "config": {
    // COMPLETE configuration with all required fields
    // Use {{AI_FIELD:name}} for AI-generated fields
    // Use {{trigger.field}} or {{nodeName.field}} for variable references
    // Leave dynamic fields empty for user selection
  },
  "metadata": {
    "configuredFields": ["list", "of", "field", "names", "you", "configured"],
    "aiFields": ["fields", "using", "AI_FIELD"],
    "variableFields": ["fields", "using", "variable", "references"],
    "pendingFields": ["dynamic", "fields", "user", "must", "configure"],
    "workflowSteps": [
      // For actionType: "plan_workflow", include array of planned steps:
      {
        "nodeType": "gmail_trigger_new_email",
        "nodeName": "Gmail Trigger",
        "description": "Triggers when new email arrives"
      }
    ]
  },
  "status": "pending" | "complete" | "error"
}

Examples:
- User: "When I get an email, send it to Slack"
  Response: Check if Gmail and Slack are connected, add Gmail trigger with proper config, then add Slack action with message template using {{trigger.subject}} and {{trigger.body}}

- User: "Add new Stripe customers to Mailchimp"
  Response: Add Stripe customer trigger, then Mailchimp add subscriber action with email: "{{trigger.email}}", first_name: "{{trigger.name}}", and audience_id: "" (for user selection)

- User: "Save form responses to Airtable"
  Response: Add form trigger, then Airtable create record action with fields mapped from {{trigger.fieldName}} to corresponding Airtable columns

Be helpful, concise, and guide users step-by-step while ALWAYS generating complete, valid configurations!`
}

/**
 * Call AI API (OpenAI, Anthropic, etc.)
 */
async function callAI({
  systemPrompt,
  userMessage,
  conversationHistory,
  availableNodes,
  contextNodes = []
}: {
  systemPrompt: string
  userMessage: string
  conversationHistory: any[]
  availableNodes: any[]
  contextNodes?: any[]
}) {
  // Check if user has their own OpenAI key
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OpenAI API key not configured')
  }

  // Build messages array
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((msg: any) => ({
      role: msg.role,
      content: msg.content
    })),
    { role: 'user', content: userMessage }
  ]

  // If we have context nodes with output schemas, suggest variable mappings
  if (contextNodes.length > 0) {
    const triggerNode = contextNodes.find((n: any) => n.isTrigger)
    const lastActionNode = contextNodes[contextNodes.length - 1]

    let variableMappingSuggestions = ''
    if (triggerNode?.outputSchema) {
      variableMappingSuggestions += `\n\nAvailable trigger outputs for variable mapping:\n${JSON.stringify(triggerNode.outputSchema, null, 2)}`
    }
    if (lastActionNode?.outputSchema && !lastActionNode.isTrigger) {
      variableMappingSuggestions += `\n\nAvailable outputs from last node (${lastActionNode.title}):\n${JSON.stringify(lastActionNode.outputSchema, null, 2)}`
    }

    if (variableMappingSuggestions) {
      messages.push({
        role: 'system',
        content: `Variable Mapping Hint: ${variableMappingSuggestions}\n\nUse these outputs when generating config for the next node.`
      })
    }
  }

  // Call OpenAI
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o', // Upgraded from gpt-4o-mini for better reasoning and accuracy
      messages,
      temperature: 0.7,
      max_tokens: 4000, // Increased to handle complex workflows with full config generation
      response_format: { type: 'json_object' } // Force JSON response
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'AI API request failed')
  }

  const data = await response.json()
  const aiMessage = data.choices[0].message.content

  // Parse JSON response
  try {
    return JSON.parse(aiMessage)
  } catch (e) {
    // Fallback if AI doesn't return valid JSON
    return {
      message: aiMessage,
      actionType: 'clarify',
      status: 'pending'
    }
  }
}

/**
 * Validate node configuration against schema
 */
function validateNodeConfig(
  nodeType: string,
  config: Record<string, any>,
  availableNodes: any[]
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  // Find node definition
  const node = availableNodes.find(n => n.type === nodeType)
  if (!node) {
    errors.push(`Node type "${nodeType}" not found`)
    return { valid: false, errors, warnings }
  }

  const configSchema = node.configSchema || []

  // Check required fields
  for (const field of configSchema) {
    if (!field.required) continue

    const value = config[field.name]

    // Field has a value - it's valid
    if (value && value !== '') {
      continue
    }

    // Check if it's dynamic (user will select from dropdown) - warn but don't error
    if (field.dynamic) {
      warnings.push(`Dynamic field "${field.label || field.name}" should be selected by user`)
      continue
    }

    // Field is missing or empty - check if it's okay to be empty
    const isAIField = typeof value === 'string' && value.startsWith('{{AI_FIELD:')
    const isVariable = typeof value === 'string' && value.startsWith('{{')

    // Only error if it's truly missing and not a placeholder
    if (!isAIField && !isVariable && (!value || value === '')) {
      errors.push(`Missing required field: ${field.label || field.name}`)
    }
  }

  // Validate field types (basic validation)
  for (const [key, value] of Object.entries(config)) {
    if (!value) continue // Skip empty values

    const field = configSchema.find((f: any) => f.name === key)
    if (!field) {
      warnings.push(`Unknown field "${key}" - not in schema`)
      continue
    }

    // Skip validation for AI fields and variables
    const stringValue = String(value)
    if (stringValue.startsWith('{{')) continue

    // Basic type validation
    if (field.type === 'email' && value && !isValidEmail(stringValue)) {
      errors.push(`Invalid email format for ${field.label || key}`)
    }
    if (field.type === 'number' && value && isNaN(Number(value))) {
      errors.push(`Invalid number format for ${field.label || key}`)
    }
    if (field.type === 'url' && value && !isValidUrl(stringValue)) {
      errors.push(`Invalid URL format for ${field.label || key}`)
    }
  }

  // Check for dynamic fields that should be left empty
  for (const field of configSchema) {
    if (field.dynamic && config[field.name] && !String(config[field.name]).startsWith('{{')) {
      warnings.push(`Field "${field.label || field.name}" is dynamic and should be left empty for user selection`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Simple email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Simple URL validation
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Suggest variable mappings between trigger/source node and target action
 * Analyzes output schema from source and config schema from target to find matching fields
 */
function suggestVariableMappings(
  sourceOutputSchema: any[],
  targetConfigSchema: any[],
  sourceNodeId: string = 'trigger'
): Record<string, string> {
  const mappings: Record<string, string> = {}

  if (!sourceOutputSchema || !targetConfigSchema) {
    return mappings
  }

  for (const targetField of targetConfigSchema) {
    // Skip dynamic fields - user must select these manually
    if (targetField.dynamic) continue

    // Find matching source output by name similarity
    const exactMatch = sourceOutputSchema.find(output =>
      output.name.toLowerCase() === targetField.name.toLowerCase()
    )

    if (exactMatch) {
      mappings[targetField.name] = `{{${sourceNodeId}.${exactMatch.name}}}`
      continue
    }

    // Try common field name patterns
    const fieldNameLower = targetField.name.toLowerCase()

    // Email field matching
    if (fieldNameLower.includes('email') || targetField.type === 'email') {
      const emailField = sourceOutputSchema.find(output =>
        output.name.toLowerCase().includes('email') ||
        output.type === 'email'
      )
      if (emailField) {
        mappings[targetField.name] = `{{${sourceNodeId}.${emailField.name}}}`
        continue
      }
    }

    // Name field matching (first_name, last_name, full_name, name)
    if (fieldNameLower.includes('name')) {
      const nameField = sourceOutputSchema.find(output =>
        output.name.toLowerCase().includes('name')
      )
      if (nameField) {
        mappings[targetField.name] = `{{${sourceNodeId}.${nameField.name}}}`
        continue
      }
    }

    // Title/Subject matching
    if (fieldNameLower.includes('title') || fieldNameLower.includes('subject')) {
      const titleField = sourceOutputSchema.find(output =>
        output.name.toLowerCase().includes('title') ||
        output.name.toLowerCase().includes('subject')
      )
      if (titleField) {
        mappings[targetField.name] = `{{${sourceNodeId}.${titleField.name}}}`
        continue
      }
    }

    // Description/Body/Content matching
    if (fieldNameLower.includes('description') || fieldNameLower.includes('body') || fieldNameLower.includes('content')) {
      const contentField = sourceOutputSchema.find(output =>
        output.name.toLowerCase().includes('description') ||
        output.name.toLowerCase().includes('body') ||
        output.name.toLowerCase().includes('content') ||
        output.name.toLowerCase().includes('message')
      )
      if (contentField) {
        mappings[targetField.name] = `{{${sourceNodeId}.${contentField.name}}}`
        continue
      }
    }

    // ID matching
    if (fieldNameLower.includes('id') && !fieldNameLower.includes('_id')) {
      const idField = sourceOutputSchema.find(output =>
        output.name.toLowerCase().includes('id')
      )
      if (idField) {
        mappings[targetField.name] = `{{${sourceNodeId}.${idField.name}}}`
        continue
      }
    }

    // Date/Time matching
    if (fieldNameLower.includes('date') || fieldNameLower.includes('time')) {
      const dateField = sourceOutputSchema.find(output =>
        output.name.toLowerCase().includes('date') ||
        output.name.toLowerCase().includes('time') ||
        output.name.toLowerCase().includes('created') ||
        output.name.toLowerCase().includes('updated')
      )
      if (dateField) {
        mappings[targetField.name] = `{{${sourceNodeId}.${dateField.name}}}`
        continue
      }
    }
  }

  return mappings
}

/**
 * Parse AI response and validate
 */
function parseAIResponse(aiResponse: any, availableNodes: any[], connectedIntegrations: string[]) {
  // Validate node type exists
  if (aiResponse.nodeType) {
    const nodeExists = availableNodes.some(n => n.type === aiResponse.nodeType)
    if (!nodeExists) {
      return {
        message: `I apologize, but the node type "${aiResponse.nodeType}" isn't available. Let me suggest an alternative...`,
        actionType: 'clarify',
        status: 'error'
      }
    }

    // Validate configuration if provided
    if (aiResponse.config && Object.keys(aiResponse.config).length > 0) {
      const validation = validateNodeConfig(aiResponse.nodeType, aiResponse.config, availableNodes)

      // Only fail on critical errors (not warnings or missing dynamic fields)
      const criticalErrors = validation.errors.filter(err =>
        !err.includes('should be selected by user') &&
        !err.includes('Dynamic field')
      )

      if (criticalErrors.length > 0) {
        // Log for debugging but don't block the workflow
        logger.warn('AI config validation warnings:', criticalErrors)

        // Include in metadata for transparency
        aiResponse.metadata = {
          ...aiResponse.metadata,
          validationWarnings: [...criticalErrors, ...validation.warnings]
        }
      } else if (validation.warnings.length > 0) {
        // Include warnings in metadata but don't fail
        aiResponse.metadata = {
          ...aiResponse.metadata,
          validationWarnings: validation.warnings
        }
      }
    }
  }

  // Check if app is connected
  if (aiResponse.provider && !connectedIntegrations.includes(aiResponse.provider)) {
    return {
      message: aiResponse.message || `To use ${aiResponse.provider}, you'll need to connect it first. Would you like to do that now?`,
      actionType: 'connect_app',
      provider: aiResponse.provider,
      status: 'pending',
      metadata: {
        appConnected: false,
        provider: aiResponse.provider
      }
    }
  }

  return {
    message: aiResponse.message,
    actionType: aiResponse.actionType || 'clarify',
    nodeType: aiResponse.nodeType,
    provider: aiResponse.provider,
    config: aiResponse.config || {},
    metadata: aiResponse.metadata || {},
    status: aiResponse.status || 'pending'
  }
}
