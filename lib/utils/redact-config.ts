/**
 * Centralized config redaction and summarization for LLM-bound data.
 *
 * Two layers:
 * 1. redactSensitiveFields() — safety net that replaces sensitive values with [REDACTED].
 *    Used where raw config values are justified (e.g., generateNodeConfigFix).
 * 2. summarizeConfigForLLM() — primary gate that converts config into structured
 *    metadata (status/type/required) with no raw user-entered values.
 *    Used for all context-injection paths (buildSystemPrompt, Add Context).
 */

// ---------------------------------------------------------------------------
// Sensitive key patterns
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_PATTERNS = [
  'accesstoken',
  'refresh_token',
  'apikey',
  'api_key',
  'secret',
  'password',
  'token',
  'connection',
  'credential',
  'auth',
  'private_key',
  'client_secret',
]

/**
 * Check whether a key name matches a sensitive pattern (case-insensitive substring).
 */
export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern))
}

// ---------------------------------------------------------------------------
// redactSensitiveFields  (WI-1 — safety net)
// ---------------------------------------------------------------------------

/**
 * Recursively replace values whose keys match sensitive patterns with "[REDACTED]".
 * Keys are preserved so the LLM knows the field exists.
 */
export function redactSensitiveFields(
  config: Record<string, any> | undefined
): Record<string, any> | undefined {
  if (!config || typeof config !== 'object') return config

  const result: Record<string, any> = {}

  for (const [key, value] of Object.entries(config)) {
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]'
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === 'object' ? redactSensitiveFields(item) : item
      )
    } else if (value && typeof value === 'object') {
      result[key] = redactSensitiveFields(value)
    } else {
      result[key] = value
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// summarizeConfigForLLM  (WI-2 — primary gate)
// ---------------------------------------------------------------------------

interface SchemaField {
  name: string
  type: string
  label?: string
  required?: boolean
  dynamic?: string | boolean
  options?: Array<{ value: string; label: string } | string>
  supportsAI?: boolean
}

interface FieldSummary {
  status: 'configured' | 'missing' | 'empty'
  type: string
  required: boolean
  value?: string // Only for variable refs, AI placeholders, or static enum selections
}

interface ConfigSummary {
  configured: string[]
  missing: string[]
  fields: Record<string, FieldSummary>
}

/**
 * Returns true if a string is a variable reference like {{trigger.subject}}.
 */
function isVariableRef(val: string): boolean {
  return /^\{\{.+\}\}$/.test(val)
}

/**
 * Returns true if a string is an AI field placeholder like {{AI_FIELD:name}}.
 */
function isAIFieldPlaceholder(val: string): boolean {
  return /^\{\{AI_FIELD:.+\}\}$/.test(val)
}

/**
 * Returns true if a value matches one of the static options in a schema field.
 */
function isStaticEnumValue(value: string, field: SchemaField): boolean {
  if (!field.options || !Array.isArray(field.options)) return false
  return field.options.some((opt) => {
    const optValue = typeof opt === 'string' ? opt : opt.value
    return optValue === value
  })
}

/**
 * Summarize a node config into structured metadata suitable for LLM consumption.
 *
 * No raw user-entered values pass through. Only:
 * - Variable references ({{trigger.x}})
 * - AI field placeholders ({{AI_FIELD:x}})
 * - Static enum selections (value from a bounded options list)
 * - Status metadata (configured / missing / empty)
 */
export function summarizeConfigForLLM(
  config: Record<string, any> | undefined,
  schema?: SchemaField[]
): ConfigSummary {
  const configured: string[] = []
  const missing: string[] = []
  const fields: Record<string, FieldSummary> = {}

  // If we have a schema, use it as the source of truth for field enumeration
  if (schema && schema.length > 0) {
    for (const field of schema) {
      const value = config?.[field.name]
      const hasValue = value !== undefined && value !== null && value !== ''
      const isRequired = field.required ?? false

      const summary: FieldSummary = {
        status: hasValue ? 'configured' : isRequired ? 'missing' : 'empty',
        type: field.type,
        required: isRequired,
      }

      if (hasValue && typeof value === 'string') {
        if (isSensitiveKey(field.name)) {
          summary.value = '[REDACTED]'
        } else if (isVariableRef(value) || isAIFieldPlaceholder(value)) {
          // Preserve — LLM needs these for mapping
          summary.value = value
        } else if (isStaticEnumValue(value, field)) {
          // Safe bounded value from options list
          summary.value = value
        } else if (field.dynamic) {
          summary.value = 'user-selected option'
        }
        // else: free-text user input — suppressed, status alone is enough
      }

      if (hasValue) {
        configured.push(field.name)
      } else if (isRequired) {
        missing.push(field.name)
      }

      fields[field.name] = summary
    }
  } else if (config) {
    // No schema available — fall back to key-level analysis only
    for (const [key, value] of Object.entries(config)) {
      const hasValue = value !== undefined && value !== null && value !== ''

      const summary: FieldSummary = {
        status: hasValue ? 'configured' : 'empty',
        type: 'unknown',
        required: false,
      }

      if (hasValue && typeof value === 'string') {
        if (isSensitiveKey(key)) {
          summary.value = '[REDACTED]'
        } else if (isVariableRef(value) || isAIFieldPlaceholder(value)) {
          summary.value = value
        }
        // else: suppressed
      }

      if (hasValue) {
        configured.push(key)
      }

      fields[key] = summary
    }
  }

  return { configured, missing, fields }
}

// ---------------------------------------------------------------------------
// Prompt formatters  (WI-2 — structured text for LLM injection)
// ---------------------------------------------------------------------------

export type ContextNodeRole = 'trigger' | 'current' | 'upstream' | 'recent'

export interface ContextNodeForPrompt {
  id: string
  type: string
  title?: string
  role: ContextNodeRole
  position: number
  configSummary: ConfigSummary
  outputSchema?: Array<{ name: string; type: string }>
}

/**
 * Format a single node's config summary as a compact text block for LLM prompts.
 */
export function formatConfigSummaryForPrompt(node: ContextNodeForPrompt): string {
  const { id, type, role, position, configSummary, outputSchema } = node
  const lines: string[] = []

  lines.push(`Node: ${type} [id: ${id}, role: ${role}, position: ${position}]`)

  if (configSummary.configured.length > 0) {
    lines.push(`  Configured: ${configSummary.configured.join(', ')}`)
  }
  if (configSummary.missing.length > 0) {
    lines.push(`  Missing (required): ${configSummary.missing.join(', ')}`)
  }
  if (outputSchema && outputSchema.length > 0) {
    lines.push(`  Output schema: ${outputSchema.map(o => `${o.name} (${o.type})`).join(', ')}`)
  }

  // Per-field detail
  const fieldEntries = Object.entries(configSummary.fields)
  if (fieldEntries.length > 0) {
    lines.push('  Fields:')
    for (const [name, field] of fieldEntries) {
      const reqLabel = field.required ? 'required' : 'optional'
      const valueSuffix = field.value ? ` = ${field.value}` : ''
      lines.push(`    ${name}: ${field.status} (${field.type}, ${reqLabel})${valueSuffix}`)
    }
  }

  return lines.join('\n')
}

/**
 * Format a collection of context nodes into a complete WORKFLOW CONTEXT block.
 * Nodes are sorted trigger → downstream by position.
 */
export function formatContextBlockForPrompt(
  nodes: ContextNodeForPrompt[],
  workflowName?: string
): string {
  if (nodes.length === 0) return ''

  // Sort by position (trigger first)
  const sorted = [...nodes].sort((a, b) => a.position - b.position)

  const lines: string[] = ['WORKFLOW CONTEXT:']

  // Natural-language summary
  const nodeNames = sorted.map(n => n.title || n.type)
  const summary = `A ${sorted.length}-node workflow: ${nodeNames.join(' → ')}`
  lines.push(`Summary: ${summary}${workflowName ? ` ("${workflowName}")` : ''}`)
  lines.push('')
  lines.push('Nodes (trigger → downstream):')

  for (const node of sorted) {
    lines.push('')
    lines.push(formatConfigSummaryForPrompt(node))
  }

  lines.push('')
  lines.push('Data flows: trigger (position 1) → upstream nodes → current node.')
  lines.push('Variable references MUST use {{nodeId.field}} only when field exists in that node\'s output schema above.')

  return lines.join('\n')
}
