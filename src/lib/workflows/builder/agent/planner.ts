import { Flow, Node, Edge, FlowInterface } from "../schema"
import { NODES } from "../nodes"
import { isSecretPlaceholder } from "../secrets"
import { createHash } from "crypto"
// Import the full node catalog for integration-specific nodes
import { ALL_NODE_COMPONENTS } from "../../../../../lib/workflows/nodes"
import type { NodeComponent } from "../../../../../lib/workflows/nodes/types"
import OpenAI from "openai"

export interface PlannerInput {
  prompt: string
  flow: Flow
}

export type Edit =
  | { op: "addNode"; node: Node }
  | { op: "connect"; edge: Edge }
  | { op: "setConfig"; nodeId: string; patch: Record<string, any> }
  | { op: "setInterface"; inputs: FlowInterface["inputs"]; outputs: FlowInterface["outputs"] }

export interface PlannerResult {
  edits: Edit[]
  prerequisites: string[]
  rationale: string
  deterministicHash: string
  workflowName?: string
}

// Initialize OpenAI client for workflow name generation
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Create a lookup map for quick node access
const NODE_CATALOG_MAP = new Map<string, NodeComponent>(
  ALL_NODE_COMPONENTS.map((node) => [node.type, node])
)

// Helper to find node in catalog by type
function findNodeInCatalog(type: string): NodeComponent | undefined {
  return NODE_CATALOG_MAP.get(type)
}

// Helper to find node in catalog by provider and action/trigger type
function findNodeByProvider(providerId: string, action: string, isTrigger: boolean = false): NodeComponent | undefined {
  return ALL_NODE_COMPONENTS.find((node) =>
    node.providerId === providerId &&
    node.isTrigger === isTrigger &&
    (node.title.toLowerCase().includes(action.toLowerCase()) || node.type.includes(action.toLowerCase()))
  )
}

// Legacy allow-list kept for backward compatibility with generic nodes
const ALLOWED_NODE_TYPES = [
  "http.trigger",
  "http.request",
  "ai.generate",
  "mapper.node",
  "logic.ifSwitch",
  "notify.dispatch",
] as const

type AllowedNodeType = typeof ALLOWED_NODE_TYPES[number]

interface ValidationResult {
  ok: boolean
  errors: string[]
}

// Get node schema from catalog
function getNodeSchema(type: string) {
  return NODES[type]
}

// Validate that draft flow only contains valid node types
function validateDraft(flow: Flow): ValidationResult {
  const errors: string[] = []

  for (const node of flow.nodes) {
    // Check if node exists in either legacy allow-list OR full catalog
    const isLegacyNode = ALLOWED_NODE_TYPES.includes(node.type as any)
    const isIntegrationNode = findNodeInCatalog(node.type) !== undefined

    if (!isLegacyNode && !isIntegrationNode) {
      errors.push(`Invalid node type: "${node.type}" (node id: ${node.id}) - not found in catalog`)
    }

    // For legacy nodes, check NODES registry; for integration nodes, check catalog
    const legacySchema = getNodeSchema(node.type)
    const catalogNode = findNodeInCatalog(node.type)

    if (!legacySchema && !catalogNode) {
      errors.push(`No schema found for node type: "${node.type}" (node id: ${node.id})`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  }
}

// Enhanced intent → plan mapping with real integration nodes
interface PlanTemplate {
  nodeTypes: (AllowedNodeType | string)[]  // Now supports both legacy and integration node types
  description: string
  fallbackNote?: string
  // Optional configuration hints for each node
  configHints?: Record<string, Record<string, any>>
}

const INTENT_TO_PLAN: Record<string, PlanTemplate> = {
  // Email → Slack using real integration nodes
  "when i get an email": {
    nodeTypes: ["gmail_trigger_new_email", "slack_action_send_message"],
    description: "Gmail trigger → Slack",
    configHints: {
      "gmail_trigger_new_email": {
        // Trigger all emails by default, user can refine later
      },
      "slack_action_send_message": {
        message: "New email from {{trigger.from}}:\n\n*Subject:* {{trigger.subject}}\n\n{{trigger.snippet}}",
      },
    },
  },

  // Gmail → Slack (alias)
  "when gmail": {
    nodeTypes: ["gmail_trigger_new_email", "slack_action_send_message"],
    description: "Gmail trigger → Slack",
    configHints: {
      "gmail_trigger_new_email": {},
      "slack_action_send_message": {
        message: "New email from {{trigger.from}}:\n\n*Subject:* {{trigger.subject}}\n\n{{trigger.snippet}}",
      },
    },
  },

  // Schedule → Fetch → Summarize → Slack
  "on a schedule": {
    nodeTypes: ["http.trigger", "http.request", "ai.generate", "slack_action_send_message"],
    description: "Schedule trigger → HTTP Request → AI Summarize → Slack",
    fallbackNote: "Using HTTP trigger for scheduling; configure cron externally or set up a schedule trigger service",
    configHints: {
      "slack_action_send_message": {
        message: "{{ai_generate.summary}}",
      },
    },
  },

  // Webhook → Slack
  "when a webhook is received": {
    nodeTypes: ["http.trigger", "slack_action_send_message"],
    description: "HTTP trigger → Slack",
    configHints: {
      "slack_action_send_message": {
        message: "Webhook received:\n```{{trigger.body}}```",
      },
    },
  },

  "when webhook received": {
    nodeTypes: ["http.trigger", "slack_action_send_message"],
    description: "HTTP trigger → Slack",
    configHints: {
      "slack_action_send_message": {
        message: "Webhook received:\n```{{trigger.body}}```",
      },
    },
  },

  // Fetch URL → Summarize → Slack
  "fetch http": {
    nodeTypes: ["http.request", "ai.generate", "slack_action_send_message"],
    description: "HTTP Request → AI Summarize → Slack",
    configHints: {
      "slack_action_send_message": {
        message: "{{ai_generate.summary}}",
      },
    },
  },

  "fetch https": {
    nodeTypes: ["http.request", "ai.generate", "slack_action_send_message"],
    description: "HTTP Request → AI Summarize → Slack",
    configHints: {
      "slack_action_send_message": {
        message: "{{ai_generate.summary}}",
      },
    },
  },

  // Generic AI + Slack
  "summarize and post to slack": {
    nodeTypes: ["http.trigger", "ai.generate", "slack_action_send_message"],
    description: "HTTP trigger → AI Summarize → Slack",
    configHints: {
      "slack_action_send_message": {
        message: "{{ai_generate.summary}}",
      },
    },
  },

  "ai to slack": {
    nodeTypes: ["http.trigger", "ai.generate", "slack_action_send_message"],
    description: "HTTP trigger → AI Generate → Slack",
    configHints: {
      "slack_action_send_message": {
        message: "{{ai_generate.output}}",
      },
    },
  },

  // Discord patterns
  "send to discord": {
    nodeTypes: ["http.trigger", "discord_action_send_message"],
    description: "HTTP trigger → Discord",
    configHints: {
      "discord_action_send_message": {
        content: "{{trigger.body}}",
      },
    },
  },

  // Notion patterns
  "create notion page": {
    nodeTypes: ["http.trigger", "notion_action_create_page"],
    description: "HTTP trigger → Create Notion page",
    configHints: {
      "notion_action_create_page": {
        title: "{{trigger.title || 'New Page'}}",
      },
    },
  },

  // AI Agent + Email patterns
  "summarize and email": {
    nodeTypes: ["http.trigger", "ai_agent", "gmail_action_send_email"],
    description: "HTTP trigger → AI Summarize → Email",
    configHints: {
      "ai_agent": {
        prompt: "Summarize the following data:\n{{trigger.body}}",
      },
      "gmail_action_send_email": {
        subject: "Summary Report",
        body: "{{ai_agent.result}}",
      },
    },
  },

  "create report and email": {
    nodeTypes: ["http.trigger", "ai_agent", "gmail_action_send_email"],
    description: "HTTP trigger → AI Generate Report → Email",
    configHints: {
      "ai_agent": {
        prompt: "Create a report based on:\n{{trigger.body}}",
      },
      "gmail_action_send_email": {
        subject: "Report",
        body: "{{ai_agent.result}}",
      },
    },
  },

  // Transform + AI patterns
  "transform and summarize": {
    nodeTypes: ["http.trigger", "transformer", "ai_agent", "slack_action_send_message"],
    description: "HTTP trigger → Transform → AI Summarize → Slack",
    configHints: {
      "slack_action_send_message": {
        message: "{{ai_agent.result}}",
      },
    },
  },

  // Format transformer + Slack (HTML to Slack markdown)
  "format to slack": {
    nodeTypes: ["http.trigger", "format_transformer", "slack_action_send_message"],
    description: "HTTP trigger → Format Transformer → Slack",
    configHints: {
      "format_transformer": {
        content: "{{trigger.body}}",
        targetFormat: "slack_markdown",
      },
      "slack_action_send_message": {
        message: "{{format_transformer.transformedContent}}",
      },
    },
  },

  // Gmail with formatting
  "email to slack formatted": {
    nodeTypes: ["gmail_trigger_new_email", "format_transformer", "slack_action_send_message"],
    description: "Gmail trigger → Format HTML → Slack",
    configHints: {
      "format_transformer": {
        content: "{{trigger.body}}",
        targetFormat: "slack_markdown",
      },
      "slack_action_send_message": {
        message: "Email from {{trigger.from}}:\n\n*{{trigger.subject}}*\n\n{{format_transformer.transformedContent}}",
      },
    },
  },

}

// Normalize natural language input for deterministic matching
function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Find matching plan template
function matchIntentToPlan(prompt: string): PlanTemplate | null {
  const normalized = normalizePrompt(prompt)

  // Check heuristics FIRST for more specific patterns (schedule + fetch is more specific than just fetch)
  const wantsSchedule = /\b(schedule|cron|every hour|every day|daily|hourly|weekly|every week|every two weeks)\b/.test(normalized)
  const wantsEmail = /\b(email|gmail)\b/.test(normalized)
  const wantsWebhook = /\b(webhook)\b/.test(normalized)
  const wantsFetch = /\b(fetch|get|request)\b/.test(normalized)
  const hasUrl = /\b(https?|url|example\.com)\b/.test(normalized)
  const wantsAi = /\b(ai|summarize|summary|generate|gpt|llm|json|report|analyze)\b/.test(normalized)
  const wantsSlack = /\b(slack|notify|post|send)\b/.test(normalized)
  const wantsTransform = /\b(transform|format|convert|parse)\b/.test(normalized)
  const wantsSendEmail = /\b(send email|email to|mail to|email me)\b/.test(normalized)

  // Priority 1: Schedule patterns
  if (wantsSchedule && (wantsFetch || hasUrl) && wantsAi && wantsSlack) {
    return INTENT_TO_PLAN["on a schedule"]
  }

  // Priority 2: AI + Email patterns (report/summary via email)
  if (wantsAi && wantsSendEmail) {
    return INTENT_TO_PLAN["summarize and email"]
  }

  // Priority 3: Email patterns (Gmail → Slack with formatting)
  if (wantsEmail && wantsSlack && wantsTransform) {
    return INTENT_TO_PLAN["email to slack formatted"]
  }

  if (wantsEmail && wantsSlack) {
    return INTENT_TO_PLAN["when i get an email"]
  }

  // Priority 4: Transform patterns
  if (wantsTransform && wantsAi && wantsSlack) {
    return INTENT_TO_PLAN["transform and summarize"]
  }

  if (wantsTransform && wantsSlack) {
    return INTENT_TO_PLAN["format to slack"]
  }

  // Priority 5: Direct phrase match (for explicit patterns)
  for (const [key, template] of Object.entries(INTENT_TO_PLAN)) {
    if (normalized.includes(key)) {
      return template
    }
  }

  // Priority 6: Heuristic combinations
  if (wantsFetch && hasUrl && wantsAi && wantsSlack) {
    return INTENT_TO_PLAN["fetch http"]
  }

  if (wantsWebhook && wantsSlack) {
    return INTENT_TO_PLAN["when a webhook is received"]
  }

  if (wantsAi && wantsSlack) {
    return INTENT_TO_PLAN["ai to slack"]
  }

  // Default fallback: webhook → slack
  if (wantsSlack || wantsWebhook) {
    return INTENT_TO_PLAN["when a webhook is received"]
  }

  return null
}

// Compute deterministic hash of edits
function computeDeterministicHash(edits: Edit[]): string {
  const canonicalJson = JSON.stringify(edits, Object.keys(edits).sort())
  return createHash("sha256").update(canonicalJson).digest("hex").slice(0, 16)
}

function generateNodeId(_type: string, existing: Set<string>): string {
  // Generate pure UUIDs for database compatibility (workflow_nodes.id is uuid type)
  // The type parameter is kept for backwards compatibility but ignored
  let candidate: string
  do {
    candidate = crypto.randomUUID()
  } while (existing.has(candidate)) // Extremely unlikely collision, but be safe
  existing.add(candidate)
  return candidate
}

function cloneFlow(flow: Flow): Flow {
  return JSON.parse(JSON.stringify(flow))
}

export function checkPrerequisites(flow: Flow): string[] {
  const requirements: string[] = []
  for (const node of flow.nodes) {
    if (node.type === "notify.dispatch") {
      const webhook = (node.config as any)?.webhookUrl
      if (!webhook || webhook === "https://hooks.slack.com/services/REPLACE_ME") {
        requirements.push("secret:SLACK_WEBHOOK")
      } else if (!isSecretPlaceholder(webhook) && webhook.includes("REPLACE_ME")) {
        requirements.push("secret:SLACK_WEBHOOK")
      }
    }
  }
  return Array.from(new Set(requirements))
}

export async function planEdits({ prompt, flow }: PlannerInput): Promise<PlannerResult> {
  const edits: Edit[] = []
  const prerequisites: string[] = []
  const rationaleParts: string[] = []

  // Match prompt to plan template
  const planTemplate = matchIntentToPlan(prompt)

  if (!planTemplate) {
    return {
      edits: [],
      prerequisites: [],
      rationale: "Could not determine workflow intent from prompt. Try: 'when webhook received, post to Slack' or 'fetch https://example.com and summarize to Slack'",
      deterministicHash: computeDeterministicHash([]),
    }
  }

  const existingNodeIds = new Set(flow.nodes.map((node) => node.id))
  const workingFlow = cloneFlow(flow)

  // Track created nodes for connecting
  const createdNodes: Node[] = []

  // Enhanced ensureNode to support both legacy and integration nodes
  const ensureNode = (type: string, configHints: Record<string, any> = {}) => {
    // Check if existing node of this type exists
    const existing = workingFlow.nodes.find((node) => node.type === type)
    if (existing) {
      return existing
    }

    // Try to find node in legacy registry first, then catalog
    const legacyDefinition = NODES[type]
    const catalogNode = findNodeInCatalog(type)

    if (!legacyDefinition && !catalogNode) {
      console.warn(`Node definition not found for type: ${type}`)
      return null
    }

    // Populate default config based on node schema
    let defaultConfig: Record<string, any> = {}

    if (catalogNode) {
      // Integration node - populate fields from configSchema
      if (catalogNode.configSchema && Array.isArray(catalogNode.configSchema)) {
        for (const field of catalogNode.configSchema) {
          const fieldName = field.name

          // Priority 1: Use config hint if provided
          if (configHints[fieldName] !== undefined) {
            defaultConfig[fieldName] = configHints[fieldName]
          }
          // Priority 2: Use field default value
          else if (field.defaultValue !== undefined) {
            defaultConfig[fieldName] = field.defaultValue
          }
          // Priority 3: Required fields get placeholder based on type
          else if (field.required) {
            switch (field.type) {
              case "text":
              case "email":
              case "rich-text":
                defaultConfig[fieldName] = field.placeholder || ""
                break
              case "select":
                // Don't set empty value for dynamic selects - let user choose
                if (!field.dynamic) {
                  defaultConfig[fieldName] = field.options?.[0] || ""
                }
                break
              case "boolean":
                defaultConfig[fieldName] = false
                break
              default:
                // Leave undefined for user to fill
                break
            }
          }
        }
      }
    } else if (legacyDefinition) {
      // Legacy node - use provided config hints
      defaultConfig = configHints
    }

    const nodeId = generateNodeId(type.replace(/\W+/g, "-"), existingNodeIds)
    const nodeTitle = catalogNode?.title || legacyDefinition?.title || type
    const nodeCostHint = legacyDefinition?.costHint || 0
    const nodeDescription = catalogNode?.description || legacyDefinition?.description

    // Build preview metadata from outputSchema
    const previewFields = catalogNode?.outputSchema?.slice(0, 3).map(field => ({
      name: field.name,
      label: field.label,
      type: field.type,
      example: field.example,
    })) || []

    const newNode: Node = {
      id: nodeId,
      type,
      label: nodeTitle,
      description: nodeDescription,
      config: defaultConfig,
      inPorts: [],
      outPorts: [],
      io: { inputSchema: undefined, outputSchema: undefined },
      policy: { timeoutMs: 60000, retries: 0 },
      costHint: nodeCostHint,
      metadata: {
        position: { x: workingFlow.nodes.length * 280, y: 120 },
        agentHighlights: Object.keys(defaultConfig),
        ...(catalogNode?.providerId && { providerId: catalogNode.providerId }),
        ...(catalogNode?.isTrigger !== undefined && { isTrigger: catalogNode.isTrigger }),
        // Preview block metadata - top 3 output fields for UI display
        ...(previewFields.length > 0 && { previewFields }),
        // Branch/lane positioning hints
        lane: 0, // Default to main lane, can be overridden for parallel branches
        branchIndex: workingFlow.nodes.length, // Sequential index for ordering
      },
    }
    workingFlow.nodes.push(newNode)
    edits.push({ op: "addNode", node: newNode })
    createdNodes.push(newNode)
    return newNode
  }

  // Build nodes according to plan template
  const nodes: (Node | null)[] = []

  for (const nodeType of planTemplate.nodeTypes) {
    // Get config hints for this specific node from the plan template
    const nodeConfigHints = planTemplate.configHints?.[nodeType] || {}

    // Create the node using ensureNode with config hints
    const node = ensureNode(nodeType, nodeConfigHints)

    if (node) {
      nodes.push(node)

      // Add rationale based on node type
      const catalogNode = findNodeInCatalog(nodeType)
      const legacyNode = NODES[nodeType]

      if (catalogNode) {
        const action = catalogNode.isTrigger ? "triggers when" : "performs"
        rationaleParts.push(`${catalogNode.title} ${action} ${catalogNode.description?.toLowerCase() || "action"}`)

        // Check for required fields that need user input
        if (catalogNode.configSchema) {
          const requiredFields = catalogNode.configSchema.filter(f => f.required && f.dynamic)
          if (requiredFields.length > 0) {
            const fieldNames = requiredFields.map(f => f.label).join(", ")
            prerequisites.push(`config:${nodeType}:${fieldNames}`)
          }
        }

        // Check if integration needs to be connected
        if (catalogNode.providerId && catalogNode.providerId !== "automation" && catalogNode.providerId !== "logic") {
          prerequisites.push(`integration:${catalogNode.providerId}`)
        }
      } else if (legacyNode) {
        rationaleParts.push(`${legacyNode.title}`)
      }

      // Special handling for specific legacy nodes
      if (nodeType === "notify.dispatch") {
        prerequisites.push("secret:SLACK_WEBHOOK")
      }
    }
  }

  // Connect nodes in sequence
  const existingEdgeKeys = new Set(flow.edges.map((edge) => `${edge.from.nodeId}->${edge.to.nodeId}`))

  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i]
    const to = nodes[i + 1]

    if (!from || !to) continue

    const key = `${from.id}->${to.id}`
    if (existingEdgeKeys.has(key)) continue

    const edge: Edge = {
      id: crypto.randomUUID(), // Use UUID for database compatibility (workflow_edges.id is uuid type)
      from: { nodeId: from.id },
      to: { nodeId: to.id },
      mappings: [],
    }
    edits.push({ op: "connect", edge })
    existingEdgeKeys.add(key)
  }

  // Validate draft before returning
  const validation = validateDraft(workingFlow)
  if (!validation.ok) {
    console.error("Planner produced invalid flow:", validation.errors)
    return {
      edits: [],
      prerequisites: [],
      rationale: `Planner error: ${validation.errors.join("; ")}`,
      deterministicHash: computeDeterministicHash([]),
    }
  }

  // Add fallback note to rationale if present
  let finalRationale = rationaleParts.join(" → ") || "No changes suggested"
  if (planTemplate.fallbackNote) {
    finalRationale += ` [Note: ${planTemplate.fallbackNote}]`
  }

  const combinedPrereqs = Array.from(new Set([...prerequisites, ...checkPrerequisites(workingFlow)]))
  const deterministicHash = computeDeterministicHash(edits)

  // Generate workflow name from prompt using AI
  const workflowName = await generateWorkflowNameWithAI(prompt, planTemplate)
  console.log('[Planner] Generated workflow name:', workflowName, 'from prompt:', prompt)

  return {
    edits,
    prerequisites: combinedPrereqs,
    rationale: finalRationale,
    deterministicHash,
    workflowName,
  }
}

// Generate a professional, concise workflow name using AI
async function generateWorkflowNameWithAI(prompt: string, planTemplate: PlanTemplate | null): Promise<string> {
  console.log('[generateWorkflowNameWithAI] Input prompt:', prompt)
  const maxLength = 50

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Cheap, fast model
      messages: [
        {
          role: "system",
          content: `You are a professional workflow naming assistant. Create a concise, professional workflow name based on the user's request.

Rules:
- Maximum ${maxLength} characters
- Use title case (e.g., "Send Email to Slack")
- Be descriptive but brief
- Focus on the action/outcome
- No quotes, no periods, no extra punctuation
- Return ONLY the name, nothing else`
        },
        {
          role: "user",
          content: `Create a workflow name for this request: "${prompt}"`
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent names
      max_tokens: 20, // Short response
    })

    let name = response.choices[0]?.message?.content?.trim() || ''
    console.log('[generateWorkflowNameWithAI] AI generated name:', name)

    // Remove any quotes that might have been added
    name = name.replace(/^["']|["']$/g, '')

    // Ensure it's not too long
    if (name.length > maxLength) {
      name = name.substring(0, maxLength).trim() + '...'
      console.log('[generateWorkflowNameWithAI] Truncated to:', name)
    }

    // Fallback if AI returned empty or very short
    if (name.length < 3) {
      const fallback = planTemplate?.description || 'New Workflow'
      console.log('[generateWorkflowNameWithAI] AI name too short, using fallback:', fallback)
      return fallback
    }

    console.log('[generateWorkflowNameWithAI] Final name:', name)
    return name
  } catch (error) {
    console.error('[generateWorkflowNameWithAI] Error generating name with AI:', error)

    // Fallback to simple text manipulation if AI fails
    let name = prompt.trim()
    name = name.replace(/^(create|build|make|setup|set up|i want to|i need to|please|can you|help me)\s+/i, '')
    name = name.replace(/\s+(workflow|automation|flow|please|for me|thanks?)$/i, '')
    name = name.charAt(0).toUpperCase() + name.slice(1)

    if (name.length > maxLength) {
      name = name.substring(0, maxLength).trim() + '...'
    }

    if (name.length < 5) {
      return planTemplate?.description || 'New Workflow'
    }

    console.log('[generateWorkflowNameWithAI] Using fallback name:', name)
    return name
  }
}
