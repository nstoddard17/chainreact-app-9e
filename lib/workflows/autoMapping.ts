export interface AutoMappingParams {
  workflowData: {
    nodes: any[]
    edges: any[]
    [key: string]: any // Allow additional properties like id, name, etc.
  } | undefined
  currentNodeId: string | undefined
  configSchema: any[]
  currentConfig: Record<string, any>
}

export interface AutoMappingEntry {
  fieldKey: string
  fieldLabel: string
  value: string
  suggestedMode?: 'mapped' | 'ai_generated'
}

/** Text-based field types that can be generative */
const TEXT_FIELD_TYPES = new Set([
  'text', 'textarea', 'rich-text', 'email-rich-text', 'discord-rich-text',
  'json', 'email',
])

export function computeAutoMappingEntries({
  workflowData,
  currentNodeId,
  configSchema,
  currentConfig
}: AutoMappingParams): AutoMappingEntry[] {
  if (
    !workflowData ||
    !currentNodeId ||
    !Array.isArray(configSchema) ||
    !Array.isArray(workflowData.nodes) ||
    !Array.isArray(workflowData.edges)
  ) {
    return []
  }

  // Multi-source: walk ALL upstream nodes with recency weighting
  const upstreamSources = collectUpstreamSources(workflowData, currentNodeId)
  if (upstreamSources.length === 0) return []

  const entries: AutoMappingEntry[] = []

  configSchema.forEach((field) => {
    if (!field?.name || field.dynamic) return
    if (String(field.name).startsWith('__')) return

    const existingValue = currentConfig[field.name]
    const hasValue = existingValue !== undefined && existingValue !== null && String(existingValue).trim() !== ''
    if (hasValue) return

    // Try mapping from upstream sources (most recent first)
    let mapped = false
    for (const source of upstreamSources) {
      const suggestion = computeAutoMappingSuggestion(field, source.outputs, source.alias)
      if (suggestion) {
        entries.push({
          fieldKey: field.name,
          fieldLabel: field.label || field.name,
          value: suggestion,
          suggestedMode: 'mapped',
        })
        mapped = true
        break
      }
    }

    // AI_FIELD fallback: if no mapping found AND field is text-based, suggest AI_FIELD
    if (!mapped && TEXT_FIELD_TYPES.has(String(field.type || '').toLowerCase())) {
      entries.push({
        fieldKey: field.name,
        fieldLabel: field.label || field.name,
        value: `{{AI_FIELD:${field.name}}}`,
        suggestedMode: 'ai_generated',
      })
    }
  })

  return entries
}

/**
 * Collect all upstream nodes with recency weighting.
 * Returns sources ordered by proximity (most recent first).
 */
function collectUpstreamSources(
  workflowData: { nodes: any[]; edges: any[] },
  currentNodeId: string
): Array<{ nodeId: string; alias: string; outputs: any[]; priority: number }> {
  const sources: Array<{ nodeId: string; alias: string; outputs: any[]; priority: number }> = []
  const visited = new Set<string>()
  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: currentNodeId, depth: 0 }]

  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    // Find incoming edges to this node
    const incomingEdges = (workflowData.edges || []).filter((edge: any) => edge.target === nodeId)

    for (const edge of incomingEdges) {
      const sourceNode = (workflowData.nodes || []).find((node: any) => node.id === edge.source)
      if (!sourceNode || visited.has(sourceNode.id)) continue

      const outputs = extractNodeOutputs(sourceNode)
      if (outputs.length > 0) {
        const alias = sanitizeAlias(
          (sourceNode.data?.isTrigger && 'trigger') ||
          sourceNode.data?.label ||
          sourceNode.data?.title ||
          sourceNode.data?.type ||
          sourceNode.id
        )

        // Recency weighting: depth 1 = 1.0, depth 2 = 0.8, depth 3 = 0.6, trigger = 0.5
        const priority = sourceNode.data?.isTrigger ? 0.5 : Math.max(1.0 - (depth * 0.2), 0.3)

        sources.push({ nodeId: sourceNode.id, alias, outputs, priority })
      }

      // Continue walking upstream
      queue.push({ nodeId: sourceNode.id, depth: depth + 1 })
    }
  }

  // Sort by priority (highest first = most recent)
  sources.sort((a, b) => b.priority - a.priority)
  return sources
}

export function extractNodeOutputs(node: any): any[] {
  if (!node) return []
  const source = node.data || node
  if (!source) return []

  if (Array.isArray(source.outputSchema)) return source.outputSchema
  if (Array.isArray(source.nodeComponent?.outputSchema)) return source.nodeComponent.outputSchema
  if (Array.isArray(source.config?.outputSchema)) return source.config.outputSchema
  return []
}

export function sanitizeAlias(value: string | undefined): string {
  if (!value) return 'step'
  const normalized = value.replace(/[^a-zA-Z0-9_]/g, '_')
  const trimmed = normalized.replace(/^_+/, '')
  return trimmed || 'step'
}

/** Semantic field groups for smarter matching */
const SEMANTIC_GROUPS: Record<string, string[]> = {
  email: ['email', 'emailaddress', 'from', 'sender', 'to', 'recipient', 'replyto'],
  content: ['message', 'body', 'content', 'text', 'description', 'note', 'comment'],
  identity: ['name', 'fullname', 'displayname', 'username', 'author'],
  subject: ['subject', 'title', 'heading', 'topic'],
  reference: ['url', 'link', 'href', 'permalink', 'website'],
  date: ['date', 'time', 'created', 'updated', 'timestamp', 'deadline', 'due'],
  id: ['id', 'recordid', 'userid', 'threadid', 'channelid'],
}

export function computeAutoMappingSuggestion(field: any, outputs: any[], alias: string): string | null {
  if (!field?.name) return null

  const lowerName = String(field.name).toLowerCase()
  const fieldType = typeof field.type === 'string' ? field.type.toLowerCase() : ''

  const normalizedOutputs = outputs
    .map((output) => ({
      name: typeof output?.name === 'string' ? output.name : '',
      type: typeof output?.type === 'string' ? output.type.toLowerCase() : '',
      label: typeof output?.label === 'string' ? output.label.toLowerCase() : ''
    }))
    .filter((output) => output.name)

  // 1. Direct name match (highest confidence)
  const direct = normalizedOutputs.find(output => output.name.toLowerCase() === lowerName)
  if (direct) {
    return `{{${alias}.${direct.name}}}`
  }

  // 2. Type-aware matching (field type matches output type)
  if (fieldType === 'email') {
    const match = normalizedOutputs.find(output => output.type === 'email')
    if (match) return `{{${alias}.${match.name}}}`
  }

  // 3. Semantic group matching
  for (const [, group] of Object.entries(SEMANTIC_GROUPS)) {
    const fieldInGroup = group.some(kw => lowerName.includes(kw))
    if (!fieldInGroup) continue

    const match = normalizedOutputs.find(output => {
      const outputLower = output.name.toLowerCase()
      return group.some(kw => outputLower.includes(kw) || output.label.includes(kw))
    })

    if (match) return `{{${alias}.${match.name}}}`
  }

  // 4. Legacy keyword matching for edge cases
  const contains = (value: string, keyword: string) => value.includes(keyword)

  if (contains(lowerName, 'id') && !contains(lowerName, '_id')) {
    const match = normalizedOutputs.find(output =>
      contains(output.name.toLowerCase(), 'id') && !contains(output.name.toLowerCase(), '_id')
    )
    if (match) return `{{${alias}.${match.name}}}`
  }

  // 5. Single output fallback
  if (normalizedOutputs.length === 1) {
    return `{{${alias}.${normalizedOutputs[0].name}}}`
  }

  return null
}

export function applyAutoMappingSuggestions({
  config,
  entries
}: {
  config: Record<string, any>
  entries?: AutoMappingEntry[]
}): Record<string, any> {
  if (!config || typeof config !== 'object' || !entries || entries.length === 0) {
    return config
  }

  const nextConfig = { ...config }

  entries.forEach((entry) => {
    const currentValue = nextConfig[entry.fieldKey]
    const hasValue = currentValue !== undefined && currentValue !== null && String(currentValue).trim() !== ''
    if (!hasValue) {
      nextConfig[entry.fieldKey] = entry.value
    }
  })

  return nextConfig
}
