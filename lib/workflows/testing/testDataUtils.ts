/**
 * Test Data Utilities
 *
 * Utilities for detecting upstream variable dependencies,
 * determining data sources, and generating sample data for node testing.
 */

import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'

/**
 * Pattern to match variable references like {{trigger.field}} or {{nodeId.field}}
 */
const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g

/**
 * Actions that have side effects (send, create, update, delete external data)
 * These require confirmation when testing with sample/old data
 */
export const SIDE_EFFECT_ACTION_PATTERNS = [
  // Email/Messaging
  'send_email',
  'send_message',
  'reply',
  'forward',
  'post_message',
  'create_message',
  'update_message',
  'delete_message',

  // Social Media
  'post_tweet',
  'create_post',
  'publish',
  'share',

  // CRUD Operations
  'create_record',
  'update_record',
  'delete_record',
  'add_row',
  'append_row',
  'update_row',
  'delete_row',
  'insert',
  'upsert',

  // Database/Storage
  'create_page',
  'update_page',
  'delete_page',
  'create_item',
  'update_item',
  'delete_item',
  'archive',

  // Cards/Tasks
  'create_card',
  'update_card',
  'delete_card',
  'move_card',
  'create_task',
  'update_task',
  'complete_task',
  'create_issue',
  'update_issue',
  'close_issue',

  // Contacts/CRM
  'create_contact',
  'update_contact',
  'delete_contact',
  'create_deal',
  'update_deal',
  'create_company',
  'update_company',

  // Files
  'upload_file',
  'delete_file',
  'move_file',
  'copy_file',
  'create_folder',
  'delete_folder',

  // Webhooks/API
  'send_webhook',
  'trigger_webhook',
  'http_request', // Only POST/PUT/DELETE

  // Calendar
  'create_event',
  'update_event',
  'delete_event',
  'cancel_event',

  // Subscriptions/Payments
  'create_subscription',
  'cancel_subscription',
  'create_invoice',
  'send_invoice',
  'create_charge',
  'refund',
]

/**
 * Read-only actions that are safe to test without confirmation
 */
export const SAFE_ACTION_PATTERNS = [
  'get_',
  'fetch_',
  'list_',
  'search_',
  'find_',
  'read_',
  'lookup_',
  'query_',
  'retrieve_',
  'check_',
  'verify_',
  'validate_',
]

export interface VariableReference {
  fullMatch: string       // e.g., "{{trigger.email}}"
  source: string          // e.g., "trigger" or node ID
  path: string[]          // e.g., ["email"] or ["data", "subject"]
  sourceType: 'trigger' | 'node' | 'special'
}

export interface UpstreamDependency {
  variable: VariableReference
  fieldName: string           // The config field that uses this variable
  currentValue?: any          // The current value in config
  sampleValue?: string        // Sample value that will be used
  hasExecutionData: boolean   // Whether we have real data from previous execution
  executionDataTimestamp?: string  // When the execution data was captured
}

export interface TestDataAnalysis {
  hasUpstreamDependencies: boolean
  dependencies: UpstreamDependency[]
  dataSource: 'live' | 'previous_execution' | 'sample'
  isSideEffectAction: boolean
  actionType: string
  requiresConfirmation: boolean
  warningMessage?: string
}

/**
 * Extract all variable references from a string value
 */
export function extractVariableReferences(value: string): VariableReference[] {
  if (typeof value !== 'string') return []

  const references: VariableReference[] = []
  let match: RegExpExecArray | null

  // Reset regex state
  VARIABLE_PATTERN.lastIndex = 0

  while ((match = VARIABLE_PATTERN.exec(value)) !== null) {
    const fullMatch = match[0]
    const innerContent = match[1].trim()

    // Skip special variables
    if (['NOW', 'TODAY', 'TIMESTAMP', '*'].includes(innerContent)) {
      references.push({
        fullMatch,
        source: innerContent,
        path: [],
        sourceType: 'special'
      })
      continue
    }

    // Parse the variable path
    const parts = innerContent.split('.')
    const source = parts[0]
    const path = parts.slice(1)

    references.push({
      fullMatch,
      source,
      path,
      sourceType: source === 'trigger' ? 'trigger' : 'node'
    })
  }

  return references
}

/**
 * Recursively extract all variable references from a config object
 */
export function extractAllVariablesFromConfig(
  config: Record<string, any>,
  prefix: string = ''
): Map<string, VariableReference[]> {
  const result = new Map<string, VariableReference[]>()

  for (const [key, value] of Object.entries(config)) {
    // Skip internal/metadata fields
    if (key.startsWith('__') || key.startsWith('_label_')) continue

    const fieldPath = prefix ? `${prefix}.${key}` : key

    if (typeof value === 'string') {
      const refs = extractVariableReferences(value)
      if (refs.length > 0) {
        result.set(fieldPath, refs)
      }
    } else if (Array.isArray(value)) {
      // Handle arrays (e.g., multiple recipients)
      value.forEach((item, index) => {
        if (typeof item === 'string') {
          const refs = extractVariableReferences(item)
          if (refs.length > 0) {
            result.set(`${fieldPath}[${index}]`, refs)
          }
        } else if (typeof item === 'object' && item !== null) {
          const nested = extractAllVariablesFromConfig(item, `${fieldPath}[${index}]`)
          nested.forEach((v, k) => result.set(k, v))
        }
      })
    } else if (typeof value === 'object' && value !== null) {
      const nested = extractAllVariablesFromConfig(value, fieldPath)
      nested.forEach((v, k) => result.set(k, v))
    }
  }

  return result
}

/**
 * Check if an action type is a side-effect action
 */
export function isSideEffectAction(nodeType: string): boolean {
  const typeLower = nodeType.toLowerCase()

  // Check if it matches any safe pattern (read-only operations)
  for (const pattern of SAFE_ACTION_PATTERNS) {
    if (typeLower.includes(pattern)) {
      return false
    }
  }

  // Check if it matches any side-effect pattern
  for (const pattern of SIDE_EFFECT_ACTION_PATTERNS) {
    if (typeLower.includes(pattern)) {
      return true
    }
  }

  // Default: assume side-effect for unknown actions that aren't explicitly safe
  // Better to be cautious with confirmation
  return !typeLower.includes('trigger')
}

/**
 * Get a human-readable description of what data source will be used
 */
export function getDataSourceDescription(analysis: TestDataAnalysis): string {
  switch (analysis.dataSource) {
    case 'live':
      return 'This node will be tested with live data.'
    case 'previous_execution':
      return 'This node will use data from a previous workflow run.'
    case 'sample':
      return 'This node will use sample/placeholder data for missing upstream values.'
    default:
      return 'Unknown data source.'
  }
}

/**
 * Generate sample values for common field types based on variable path
 */
export function generateSampleValue(variable: VariableReference): string {
  const path = variable.path.join('.').toLowerCase()
  const source = variable.source.toLowerCase()

  // Email-related fields
  if (path.includes('email') || path.includes('from') || path.includes('to')) {
    return 'sample@example.com'
  }
  if (path.includes('subject')) {
    return 'Sample Email Subject'
  }
  if (path.includes('body') || path.includes('content') || path.includes('text') || path.includes('message')) {
    return 'This is sample message content for testing purposes.'
  }

  // User-related fields
  if (path.includes('name') || path.includes('username')) {
    return 'John Doe'
  }
  if (path.includes('user_id') || path.includes('userid')) {
    return 'sample_user_123'
  }

  // ID fields
  if (path.includes('id')) {
    return 'sample_id_12345'
  }

  // URL fields
  if (path.includes('url') || path.includes('link')) {
    return 'https://example.com/sample'
  }

  // Date/time fields
  if (path.includes('date') || path.includes('time') || path.includes('timestamp')) {
    return new Date().toISOString()
  }

  // Number fields
  if (path.includes('count') || path.includes('amount') || path.includes('quantity') || path.includes('number')) {
    return '42'
  }

  // Channel/server fields (Discord, Slack)
  if (path.includes('channel')) {
    return 'general'
  }
  if (path.includes('guild') || path.includes('server')) {
    return 'Sample Server'
  }

  // AI-related
  if (source.includes('ai') || path.includes('output') || path.includes('response')) {
    return 'This is sample AI-generated output for testing.'
  }

  // Default
  return `[Sample: ${variable.fullMatch}]`
}

/**
 * Analyze a node's configuration to determine test data requirements
 */
export function analyzeTestDataRequirements(
  nodeType: string,
  config: Record<string, any>,
  previousExecutionData?: Record<string, any>,
  workflowNodes?: any[]
): TestDataAnalysis {
  // Extract all variable references from config
  const variablesByField = extractAllVariablesFromConfig(config)

  // Build list of upstream dependencies
  const dependencies: UpstreamDependency[] = []
  let hasExecutionData = false
  let executionTimestamp: string | undefined

  variablesByField.forEach((refs, fieldName) => {
    for (const ref of refs) {
      // Skip special variables (NOW, etc.)
      if (ref.sourceType === 'special') continue

      // Check if we have execution data for this source
      const sourceData = previousExecutionData?.[ref.source]
      const hasDataForSource = sourceData !== undefined && sourceData !== null

      if (hasDataForSource) {
        hasExecutionData = true
        executionTimestamp = previousExecutionData?.__timestamp
      }

      dependencies.push({
        variable: ref,
        fieldName,
        currentValue: config[fieldName.split('.')[0]],
        sampleValue: hasDataForSource ? undefined : generateSampleValue(ref),
        hasExecutionData: hasDataForSource,
        executionDataTimestamp: hasDataForSource ? executionTimestamp : undefined
      })
    }
  })

  // Determine data source
  let dataSource: 'live' | 'previous_execution' | 'sample'
  if (dependencies.length === 0) {
    dataSource = 'live'
  } else if (dependencies.every(d => d.hasExecutionData)) {
    dataSource = 'previous_execution'
  } else {
    dataSource = 'sample'
  }

  // Check if this is a side-effect action
  const isSideEffect = isSideEffectAction(nodeType)

  // Determine if confirmation is required
  // Only require confirmation for side-effect actions using sample or old data
  const requiresConfirmation = isSideEffect &&
    dependencies.length > 0 &&
    dataSource !== 'live'

  // Generate warning message
  let warningMessage: string | undefined
  if (requiresConfirmation) {
    const sampleDeps = dependencies.filter(d => !d.hasExecutionData)
    const oldDataDeps = dependencies.filter(d => d.hasExecutionData)

    if (sampleDeps.length > 0 && oldDataDeps.length > 0) {
      warningMessage = `This action will use a mix of sample data and data from a previous run.`
    } else if (sampleDeps.length > 0) {
      warningMessage = `This action will use sample/placeholder data for ${sampleDeps.length} variable${sampleDeps.length > 1 ? 's' : ''}.`
    } else if (oldDataDeps.length > 0) {
      warningMessage = `This action will use data from a previous workflow run.`
    }
  }

  return {
    hasUpstreamDependencies: dependencies.length > 0,
    dependencies,
    dataSource,
    isSideEffectAction: isSideEffect,
    actionType: nodeType,
    requiresConfirmation,
    warningMessage
  }
}

/**
 * Get a friendly name for a node type
 */
export function getActionFriendlyName(nodeType: string): string {
  const component = ALL_NODE_COMPONENTS.find(c => c.type === nodeType)
  return component?.title || nodeType.replace(/_/g, ' ').replace(/action/i, '').trim()
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`

  return date.toLocaleDateString()
}
