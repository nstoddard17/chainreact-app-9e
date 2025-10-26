export interface AutoMappingParams {
  workflowData: {
    nodes?: any[]
    edges?: any[]
  }
  currentNodeId: string | undefined
  configSchema: any[]
  currentConfig: Record<string, any>
}

export interface AutoMappingEntry {
  fieldKey: string
  fieldLabel: string
  value: string
}

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

  const incomingEdge = (workflowData.edges || []).find((edge: any) => edge.target === currentNodeId)
  if (!incomingEdge) return []

  const sourceNode = (workflowData.nodes || []).find((node: any) => node.id === incomingEdge.source)
  if (!sourceNode) return []

  const outputs = extractNodeOutputs(sourceNode)
  if (outputs.length === 0) return []

  const alias = sanitizeAlias(
    (sourceNode.data?.isTrigger && 'trigger') ||
    sourceNode.data?.label ||
    sourceNode.data?.title ||
    sourceNode.data?.type ||
    sourceNode.id
  )

  const entries: AutoMappingEntry[] = []

  configSchema.forEach((field) => {
    if (!field?.name || field.dynamic) return
    if (String(field.name).startsWith('__')) return

    const existingValue = currentConfig[field.name]
    const hasValue = existingValue !== undefined && existingValue !== null && String(existingValue).trim() !== ''
    if (hasValue) return

    const suggestion = computeAutoMappingSuggestion(field, outputs, alias)
    if (suggestion) {
      entries.push({
        fieldKey: field.name,
        fieldLabel: field.label || field.name,
        value: suggestion
      })
    }
  })

  return entries
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

  const direct = normalizedOutputs.find(output => output.name.toLowerCase() === lowerName)
  if (direct) {
    return `{{${alias}.${direct.name}}}`
  }

  const contains = (value: string, keyword: string) => value.includes(keyword)

  if (contains(lowerName, 'email') || fieldType === 'email') {
    const match = normalizedOutputs.find(output =>
      contains(output.name.toLowerCase(), 'email') ||
      output.type === 'email' ||
      contains(output.label, 'email')
    )
    if (match) return `{{${alias}.${match.name}}}`
  }

  if (contains(lowerName, 'name')) {
    const match = normalizedOutputs.find(output =>
      contains(output.name.toLowerCase(), 'name') ||
      contains(output.label, 'name')
    )
    if (match) return `{{${alias}.${match.name}}}`
  }

  if (contains(lowerName, 'title') || contains(lowerName, 'subject')) {
    const match = normalizedOutputs.find(output =>
      contains(output.name.toLowerCase(), 'title') ||
      contains(output.name.toLowerCase(), 'subject') ||
      contains(output.label, 'title') ||
      contains(output.label, 'subject')
    )
    if (match) return `{{${alias}.${match.name}}}`
  }

  if (contains(lowerName, 'description') || contains(lowerName, 'body') || contains(lowerName, 'content') || contains(lowerName, 'message')) {
    const match = normalizedOutputs.find(output =>
      contains(output.name.toLowerCase(), 'description') ||
      contains(output.name.toLowerCase(), 'body') ||
      contains(output.name.toLowerCase(), 'content') ||
      contains(output.name.toLowerCase(), 'message') ||
      contains(output.label, 'description') ||
      contains(output.label, 'content')
    )
    if (match) return `{{${alias}.${match.name}}}`
  }

  if (contains(lowerName, 'id') && !contains(lowerName, '_id')) {
    const match = normalizedOutputs.find(output =>
      contains(output.name.toLowerCase(), 'id') && !contains(output.name.toLowerCase(), '_id')
    )
    if (match) return `{{${alias}.${match.name}}}`
  }

  if (contains(lowerName, 'date') || contains(lowerName, 'time')) {
    const match = normalizedOutputs.find(output =>
      contains(output.name.toLowerCase(), 'date') ||
      contains(output.name.toLowerCase(), 'time') ||
      contains(output.name.toLowerCase(), 'created') ||
      contains(output.name.toLowerCase(), 'updated')
    )
    if (match) return `{{${alias}.${match.name}}}`
  }

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
