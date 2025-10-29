import { Flow, Node, Edge, FlowInterface } from "../schema"
import { NODES } from "../nodes"
import { isSecretPlaceholder } from "../secrets"
import { createHash } from "crypto"

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
}

// Hard allow-list of node types that exist in our V2 catalog
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

// Validate that draft flow only contains allowed node types
function validateDraft(flow: Flow): ValidationResult {
  const errors: string[] = []

  for (const node of flow.nodes) {
    if (!ALLOWED_NODE_TYPES.includes(node.type as any)) {
      errors.push(`Invalid node type: "${node.type}" (node id: ${node.id})`)
    }

    const schema = getNodeSchema(node.type)
    if (!schema) {
      errors.push(`No schema found for node type: "${node.type}" (node id: ${node.id})`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  }
}

// Deterministic intent → plan mapping
interface PlanTemplate {
  nodeTypes: AllowedNodeType[]
  description: string
  fallbackNote?: string
}

const INTENT_TO_PLAN: Record<string, PlanTemplate> = {
  // Email → Slack (using HTTP trigger as Email trigger not implemented)
  "when i get an email": {
    nodeTypes: ["http.trigger", "mapper.node", "notify.dispatch"],
    description: "Email trigger → Mapper → Slack",
    fallbackNote: "Using HTTP trigger as Email connector not implemented yet",
  },

  // Schedule → Fetch → Summarize → Slack
  "on a schedule": {
    nodeTypes: ["http.trigger", "http.request", "ai.generate", "mapper.node", "notify.dispatch"],
    description: "Schedule trigger → HTTP Request → AI Summarize → Mapper → Slack",
    fallbackNote: "Using HTTP trigger as Schedule trigger not implemented yet; configure cron externally",
  },

  // Webhook → Mapper → Slack
  "when a webhook is received": {
    nodeTypes: ["http.trigger", "mapper.node", "notify.dispatch"],
    description: "HTTP trigger → Mapper → Slack",
  },

  "when webhook received": {
    nodeTypes: ["http.trigger", "mapper.node", "notify.dispatch"],
    description: "HTTP trigger → Mapper → Slack",
  },

  // Fetch URL → Summarize → Slack
  "fetch http": {
    nodeTypes: ["http.request", "ai.generate", "mapper.node", "notify.dispatch"],
    description: "HTTP Request → AI Summarize → Mapper → Slack",
  },

  "fetch https": {
    nodeTypes: ["http.request", "ai.generate", "mapper.node", "notify.dispatch"],
    description: "HTTP Request → AI Summarize → Mapper → Slack",
  },

  // Generic AI + Slack
  "summarize and post to slack": {
    nodeTypes: ["http.trigger", "ai.generate", "mapper.node", "notify.dispatch"],
    description: "HTTP trigger → AI Summarize → Mapper → Slack",
  },

  "ai to slack": {
    nodeTypes: ["http.trigger", "ai.generate", "mapper.node", "notify.dispatch"],
    description: "HTTP trigger → AI Generate → Mapper → Slack",
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
  const wantsSchedule = /\b(schedule|cron|every hour|every day|daily|hourly)\b/.test(normalized)
  const wantsEmail = /\b(email|gmail)\b/.test(normalized)
  const wantsWebhook = /\b(webhook)\b/.test(normalized)
  const wantsFetch = /\b(fetch|get|request)\b/.test(normalized)
  const hasUrl = /\b(https?|url|example\.com)\b/.test(normalized)
  const wantsAi = /\b(ai|summarize|summary|generate|gpt|llm|json)\b/.test(normalized)
  const wantsSlack = /\b(slack|notify|post|send)\b/.test(normalized)

  // Priority 1: Schedule patterns (most specific)
  if (wantsSchedule && (wantsFetch || hasUrl) && wantsAi && wantsSlack) {
    return INTENT_TO_PLAN["on a schedule"]
  }

  // Priority 2: Email patterns
  if (wantsEmail && wantsSlack) {
    return INTENT_TO_PLAN["when i get an email"]
  }

  // Priority 3: Direct phrase match (for explicit patterns)
  for (const [key, template] of Object.entries(INTENT_TO_PLAN)) {
    if (normalized.includes(key)) {
      return template
    }
  }

  // Priority 4: Heuristic combinations
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

function generateNodeId(type: string, existing: Set<string>): string {
  let index = 1
  let candidate = `${type}-${index}`
  while (existing.has(candidate)) {
    index += 1
    candidate = `${type}-${index}`
  }
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

export function planEdits({ prompt, flow }: PlannerInput): PlannerResult {
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

  const ensureNode = (type: AllowedNodeType, defaultConfig: Record<string, any>) => {
    const definition = NODES[type]
    if (!definition) {
      console.warn(`Node definition not found for type: ${type}`)
      return null
    }

    const existing = workingFlow.nodes.find((node) => node.type === type)
    if (existing) {
      return existing
    }

    const nodeId = generateNodeId(type.replace(/\W+/g, "-"), existingNodeIds)
    const newNode: Node = {
      id: nodeId,
      type,
      label: definition.title,
      config: defaultConfig,
      inPorts: [],
      outPorts: [],
      io: { inputSchema: undefined, outputSchema: undefined },
      policy: { timeoutMs: 60000, retries: 0 },
      costHint: definition.costHint ?? 0,
      metadata: {
        position: { x: workingFlow.nodes.length * 280, y: 120 },
        agentHighlights: Object.keys(defaultConfig),
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
    let node: Node | null = null

    switch (nodeType) {
      case "http.trigger":
        node = ensureNode("http.trigger", {})
        rationaleParts.push("HTTP trigger starts the flow")
        break

      case "http.request":
        node = ensureNode("http.request", {
          method: "GET",
          url: "https://example.com/api/data",
          headers: {},
        })
        rationaleParts.push("HTTP Request fetches data from URL")
        break

      case "ai.generate":
        node = ensureNode("ai.generate", {
          model: "gpt-4o-mini",
          system: "You are a helpful assistant that summarizes content.",
          user: '{"summary":"{{upstream.body.title}}","details":"{{upstream.body.content}}"}',
        })
        rationaleParts.push("AI Generate produces structured summary JSON")
        break

      case "mapper.node":
        node = ensureNode("mapper.node", {})
        rationaleParts.push("Mapper prepares downstream payload")
        break

      case "logic.ifSwitch":
        node = ensureNode("logic.ifSwitch", {
          predicateExpr: "upstream.status === 200",
        })
        rationaleParts.push("If Switch routes based on condition")
        break

      case "notify.dispatch":
        node = ensureNode("notify.dispatch", {
          webhookUrl: "https://hooks.slack.com/services/REPLACE_ME",
          text: "{{upstream.json.summary || upstream.payload.title || 'Workflow notification'}}",
        })
        rationaleParts.push("Notify node posts to Slack")
        prerequisites.push("secret:SLACK_WEBHOOK")
        break
    }

    if (node) {
      nodes.push(node)
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
      id: `${from.id}-${to.id}`,
      from: { nodeId: from.id },
      to: { nodeId: to.id },
      mappings: [],
    }
    edits.push({ op: "connect", edge })
    existingEdgeKeys.add(key)
  }

  // Add setConfig patches for key nodes
  const aiNode = nodes.find((n) => n?.type === "ai.generate")
  const notifyNode = nodes.find((n) => n?.type === "notify.dispatch")
  const httpRequestNode = nodes.find((n) => n?.type === "http.request")

  if (aiNode) {
    edits.push({
      op: "setConfig",
      nodeId: aiNode.id,
      patch: {
        model: "gpt-4o-mini",
        system: "You are a helpful assistant that summarizes content.",
        user: '{"summary":"{{upstream.body.title}}","details":"{{upstream.body.content}}"}',
      },
    })
  }

  if (notifyNode) {
    edits.push({
      op: "setConfig",
      nodeId: notifyNode.id,
      patch: {
        webhookUrl: "https://hooks.slack.com/services/REPLACE_ME",
        text: "{{upstream.json.summary || upstream.payload.title || 'Workflow notification'}}",
      },
    })
  }

  if (httpRequestNode) {
    edits.push({
      op: "setConfig",
      nodeId: httpRequestNode.id,
      patch: {
        method: "GET",
        url: "https://example.com/api/data",
      },
    })
  }

  // Validate draft before returning
  const validation = validateDraft(workingFlow)
  if (!validation.ok) {
    console.error("Planner produced invalid flow:", validation.errors)

    // Filter out invalid nodes and retry validation
    const validNodes = workingFlow.nodes.filter((node) =>
      ALLOWED_NODE_TYPES.includes(node.type as any)
    )

    if (validNodes.length < workingFlow.nodes.length) {
      return {
        edits: [],
        prerequisites: [],
        rationale: `Planner error: attempted to create invalid node types. Errors: ${validation.errors.join("; ")}`,
        deterministicHash: computeDeterministicHash([]),
      }
    }
  }

  // Add fallback note to rationale if present
  let finalRationale = rationaleParts.join(" → ") || "No changes suggested"
  if (planTemplate.fallbackNote) {
    finalRationale += ` [Note: ${planTemplate.fallbackNote}]`
  }

  const combinedPrereqs = Array.from(new Set([...prerequisites, ...checkPrerequisites(workingFlow)]))
  const deterministicHash = computeDeterministicHash(edits)

  return {
    edits,
    prerequisites: combinedPrereqs,
    rationale: finalRationale,
    deterministicHash,
  }
}
