/**
 * Field Classifier
 *
 * Automatically classifies workflow node fields into three modes:
 * - deterministic: fixed config values (IDs, dropdowns, booleans)
 * - mappable: should map from upstream outputSchema via variable references
 * - generative: should use {{AI_FIELD:fieldName}} for runtime AI generation
 *
 * Hard rule: NO text-based field should ever be left blank.
 * If no mapping exists, text fields default to generative (AI_FIELD).
 */

import type { ConfigField, NodeComponent, NodeOutputField } from '../../../../../lib/workflows/nodes/types'
import type { FieldClassification, FieldMode, ConfigConfidence } from './types'
import { logger } from '../../../../../lib/utils/logger'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Fields that should NEVER use AI mode (user must select manually) */
const DETERMINISTIC_FIELD_NAMES = new Set([
  // Airtable selectors
  'baseId', 'tableName', 'viewName',
  // Google Sheets selectors
  'spreadsheetId', 'sheetName',
  // Microsoft Excel selectors
  'workbookId', 'worksheetName',
  // Discord selectors
  'guildId', 'channelId',
  // Slack selectors
  'channel', 'workspace', 'asUser',
  // Notion selectors
  'databaseId', 'pageId', 'database',
  // Trello selectors
  'boardId', 'listId',
  // HubSpot selectors
  'objectType',
  // Generic selectors
  'recordId', 'id',
])

/** Field types that are inherently deterministic (user picks from options) */
const DETERMINISTIC_FIELD_TYPES = new Set([
  'select', 'combobox', 'boolean', 'button-toggle', 'multi-select',
])

/** Field types that are text-based and can be generative */
const TEXT_FIELD_TYPES = new Set([
  'text', 'textarea', 'rich-text', 'email-rich-text', 'discord-rich-text',
  'json', 'email',
])

/** Content-oriented field name keywords — strong signal for generative mode */
const CONTENT_KEYWORDS = [
  'message', 'body', 'content', 'description', 'summary', 'subject',
  'text', 'note', 'comment', 'reply', 'response', 'title', 'name',
  'caption', 'bio', 'about', 'greeting', 'template', 'html',
]

/** Semantic field groups for smarter mapping */
const SEMANTIC_GROUPS: Record<string, string[]> = {
  email: ['email', 'emailAddress', 'from', 'sender', 'to', 'recipient', 'replyTo'],
  content: ['message', 'body', 'content', 'text', 'description', 'note'],
  identity: ['name', 'fullName', 'displayName', 'username', 'author'],
  reference: ['url', 'link', 'href', 'permalink', 'website'],
  subject: ['subject', 'title', 'heading', 'topic'],
  date: ['date', 'time', 'created', 'updated', 'timestamp', 'deadline', 'due'],
  id: ['id', 'recordId', 'userId', 'threadId', 'channelId'],
}

// ============================================================================
// FIELD CLASSIFICATION
// ============================================================================

/**
 * Classify a single field into deterministic / mappable / generative
 */
export function classifyField(
  field: ConfigField,
  upstreamOutputs: Array<{ nodeId: string; alias: string; outputs: NodeOutputField[] }> = []
): FieldClassification {
  const fieldName = field.name
  const fieldType = field.type?.toLowerCase() || 'text'

  // --- Rule 1: Explicit fieldCategory takes priority ---
  if (field.fieldCategory === 'identifier') {
    return makeClassification(fieldName, 'deterministic', 'high', 'Field marked as identifier')
  }
  if (field.fieldCategory === 'content') {
    return makeClassification(fieldName, 'generative', 'high', 'Field marked as content', `{{AI_FIELD:${fieldName}}}`)
  }

  // --- Rule 2: Deterministic by name ---
  if (DETERMINISTIC_FIELD_NAMES.has(fieldName)) {
    return makeClassification(fieldName, 'deterministic', 'high', 'Known selector field')
  }

  // --- Rule 3: Deterministic by type ---
  if (DETERMINISTIC_FIELD_TYPES.has(fieldType)) {
    return makeClassification(fieldName, 'deterministic', 'high', `Field type ${fieldType} is deterministic`)
  }

  // --- Rule 4: Dynamic fields are deterministic (need API to load options) ---
  if (field.dynamic) {
    return makeClassification(fieldName, 'deterministic', 'high', 'Dynamic field requires API-loaded options')
  }

  // --- Rule 5: Check for mappable (upstream output match) ---
  if (TEXT_FIELD_TYPES.has(fieldType) && upstreamOutputs.length > 0) {
    const mapping = findBestMapping(fieldName, fieldType, upstreamOutputs)
    if (mapping) {
      return makeClassification(
        fieldName, 'mappable', mapping.confidence,
        `Matches upstream output ${mapping.alias}.${mapping.outputField}`,
        `{{${mapping.alias}.${mapping.outputField}}}`,
        mapping.nodeId, mapping.outputField
      )
    }
  }

  // --- Rule 6: Generative by content keyword ---
  if (TEXT_FIELD_TYPES.has(fieldType)) {
    const lowerName = fieldName.toLowerCase()
    const hasContentKeyword = CONTENT_KEYWORDS.some(kw => lowerName.includes(kw))

    if (hasContentKeyword) {
      return makeClassification(fieldName, 'generative', 'high',
        'Text field with content keyword', `{{AI_FIELD:${fieldName}}}`)
    }

    // --- Rule 7: HARD RULE — any text field without mapping defaults to generative ---
    return makeClassification(fieldName, 'generative', 'medium',
      'Text field with no mapping — defaulting to AI generation', `{{AI_FIELD:${fieldName}}}`)
  }

  // --- Fallback: non-text fields ---
  if (field.required) {
    return makeClassification(fieldName, 'deterministic', 'low', 'Required non-text field — user must configure')
  }

  return makeClassification(fieldName, 'deterministic', 'medium',
    'Optional non-text field', field.defaultValue !== undefined ? String(field.defaultValue) : undefined)
}

/**
 * Classify all fields for a node, given upstream context
 */
export function classifyAllFields(
  node: NodeComponent,
  upstreamNodes: Array<{ nodeId: string; alias: string; node: NodeComponent }> = []
): FieldClassification[] {
  if (!node.configSchema || node.configSchema.length === 0) {
    return []
  }

  // Build upstream outputs list
  const upstreamOutputs = upstreamNodes.map(u => ({
    nodeId: u.nodeId,
    alias: u.alias,
    outputs: (u.node.outputSchema || []) as NodeOutputField[],
  }))

  const classifications = node.configSchema
    .filter(field => !field.hidden && field.name !== 'connection')
    .map(field => {
      const classification = classifyField(field as ConfigField, upstreamOutputs)
      logger.debug('[FieldClassifier]', {
        nodeType: node.type,
        fieldName: classification.fieldName,
        mode: classification.mode,
        confidence: classification.confidence,
        reason: classification.reason,
      })
      return classification
    })

  return classifications
}

/**
 * Format classifications as a prompt section for LLM context
 */
export function formatClassificationsForLLM(classifications: FieldClassification[]): string {
  if (classifications.length === 0) return ''

  const lines = classifications.map(c => {
    let line = `- ${c.fieldName}: ${c.mode}`
    if (c.suggestedValue) {
      line += ` → ${c.suggestedValue}`
    }
    if (c.sourceNodeId && c.sourceField) {
      line += ` [source: ${c.sourceNodeId}, field: ${c.sourceField}]`
    }
    return line
  })

  return `FIELD MODE RECOMMENDATIONS:\n${lines.join('\n')}`
}

// ============================================================================
// HELPERS
// ============================================================================

function makeClassification(
  fieldName: string,
  mode: FieldMode,
  confidence: ConfigConfidence,
  reason: string,
  suggestedValue?: string,
  sourceNodeId?: string,
  sourceField?: string
): FieldClassification {
  return { fieldName, mode, confidence, reason, suggestedValue, sourceNodeId, sourceField }
}

interface MappingMatch {
  nodeId: string
  alias: string
  outputField: string
  confidence: ConfigConfidence
  priority: number
}

/**
 * Find best upstream output to map to a field, using semantic groups and recency weighting
 */
function findBestMapping(
  fieldName: string,
  fieldType: string,
  upstreamOutputs: Array<{ nodeId: string; alias: string; outputs: NodeOutputField[] }>
): MappingMatch | null {
  const lowerName = fieldName.toLowerCase()
  const candidates: MappingMatch[] = []

  // Walk upstream nodes with recency weighting (last = highest priority)
  for (let i = upstreamOutputs.length - 1; i >= 0; i--) {
    const upstream = upstreamOutputs[i]
    // Recency: most recent node = 1.0, one hop back = 0.8, etc.
    const recencyWeight = 1.0 - (upstreamOutputs.length - 1 - i) * 0.2
    const priority = Math.max(recencyWeight, 0.3) // Floor at 0.3

    for (const output of upstream.outputs) {
      const outputName = output.name.toLowerCase()

      // Direct name match — highest confidence
      if (outputName === lowerName) {
        candidates.push({
          nodeId: upstream.nodeId,
          alias: upstream.alias,
          outputField: output.name,
          confidence: 'high',
          priority: priority + 0.5, // bonus for exact match
        })
        continue
      }

      // Semantic group match
      for (const [, group] of Object.entries(SEMANTIC_GROUPS)) {
        const fieldInGroup = group.some(kw => lowerName.includes(kw.toLowerCase()))
        const outputInGroup = group.some(kw => outputName.includes(kw.toLowerCase()))

        if (fieldInGroup && outputInGroup) {
          candidates.push({
            nodeId: upstream.nodeId,
            alias: upstream.alias,
            outputField: output.name,
            confidence: 'medium',
            priority,
          })
          break
        }
      }
    }
  }

  if (candidates.length === 0) return null

  // Sort by priority (highest first), then confidence
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    const confOrder = { high: 3, medium: 2, low: 1 }
    return confOrder[b.confidence] - confOrder[a.confidence]
  })

  return candidates[0]
}
