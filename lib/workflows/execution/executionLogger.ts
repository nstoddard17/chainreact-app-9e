/**
 * Execution Logger - Formats workflow execution data in human-readable format
 * Captures inputs, outputs, and context for all workflow nodes
 */

import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"

export interface ExecutionLogEntry {
  nodeId: string
  nodeType: string
  nodeTitle: string
  timestamp: string
  executionTime?: number
  status: 'started' | 'completed' | 'error'
  trigger?: TriggerLog
  input?: InputLog
  output?: OutputLog
  error?: ErrorLog
}

export interface TriggerLog {
  type: string
  source: string
  data: Record<string, any>
  formattedData?: string[]
}

export interface InputLog {
  raw: Record<string, any>
  formatted: string[]
}

export interface OutputLog {
  raw: Record<string, any>
  formatted: string[]
}

export interface ErrorLog {
  message: string
  details?: string
  stack?: string
}

/**
 * Format a value for human-readable display
 */
function formatValue(value: any, indent: number = 0): string {
  const spaces = ' '.repeat(indent)
  
  if (value === null || value === undefined) {
    return `${spaces}(empty)`
  }
  
  if (typeof value === 'boolean') {
    return `${spaces}${value ? 'Yes' : 'No'}`
  }
  
  if (typeof value === 'string') {
    // Truncate very long strings
    if (value.length > 500) {
      return `${spaces}"${value.substring(0, 497)}..." (truncated)`
    }
    return `${spaces}"${value}"`
  }
  
  if (typeof value === 'number') {
    return `${spaces}${value}`
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${spaces}(empty list)`
    }
    return value.map((item, i) => 
      `${spaces}[${i + 1}] ${formatValue(item, 0)}`
    ).join('\n')
  }
  
  if (typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return `${spaces}(empty object)`
    }
    return entries
      .filter(([key]) => !key.startsWith('_')) // Filter out internal fields
      .map(([key, val]) => {
        const formattedKey = formatFieldName(key)
        return `${spaces}${formattedKey}: ${formatValue(val, 0)}`
      })
      .join('\n')
  }
  
  return `${spaces}${JSON.stringify(value)}`
}

/**
 * Convert field names to human-readable format
 */
function formatFieldName(fieldName: string): string {
  // Special cases for common field names
  const specialCases: Record<string, string> = {
    'to': 'To',
    'from': 'From',
    'cc': 'CC',
    'bcc': 'BCC',
    'subject': 'Subject',
    'body': 'Message Body',
    'html': 'HTML Content',
    'attachments': 'Attachments',
    'guildId': 'Discord Server',
    'channelId': 'Channel',
    'userId': 'User',
    'messageId': 'Message ID',
    'recordId': 'Record ID',
    'baseId': 'Base/Database',
    'tableName': 'Table',
    'spreadsheetId': 'Spreadsheet',
    'sheetName': 'Sheet',
    'url': 'URL',
    'method': 'HTTP Method',
    'headers': 'Headers',
    'params': 'Parameters',
    'query': 'Query',
    'content': 'Content',
    'message': 'Message',
    'text': 'Text',
    'title': 'Title',
    'description': 'Description',
    'status': 'Status',
    'priority': 'Priority',
    'dueDate': 'Due Date',
    'assignee': 'Assigned To',
    'labels': 'Labels',
    'tags': 'Tags',
    'fields': 'Fields',
    'data': 'Data',
    'result': 'Result',
    'response': 'Response',
    'output': 'Output',
    'value': 'Value',
    'success': 'Success',
    'error': 'Error',
    'errorMessage': 'Error Message',
    'timestamp': 'Time',
    'createdAt': 'Created At',
    'updatedAt': 'Updated At',
    'completedAt': 'Completed At',
    'startedAt': 'Started At'
  }
  
  if (specialCases[fieldName]) {
    return specialCases[fieldName]
  }
  
  // Convert camelCase or snake_case to Title Case
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim()
}

/**
 * Format trigger data based on trigger type
 */
export function formatTriggerData(triggerType: string, data: any): string[] {
  const formatted: string[] = []
  
  switch (triggerType) {
    case 'webhook':
      formatted.push('🔗 Webhook Triggered')
      if (data.method) formatted.push(`Method: ${data.method}`)
      if (data.url) formatted.push(`URL: ${data.url}`)
      if (data.headers) formatted.push(`Headers: ${Object.keys(data.headers).length} headers`)
      if (data.body) {
        formatted.push('Body Content:')
        formatted.push(formatValue(data.body, 2))
      }
      break
      
    case 'schedule':
      formatted.push('⏰ Scheduled Trigger')
      if (data.schedule) formatted.push(`Schedule: ${data.schedule}`)
      if (data.lastRun) formatted.push(`Last Run: ${new Date(data.lastRun).toLocaleString()}`)
      break
      
    case 'manual':
      formatted.push('👤 Manual Trigger')
      if (data.triggeredBy) formatted.push(`Triggered By: ${data.triggeredBy}`)
      if (data.reason) formatted.push(`Reason: ${data.reason}`)
      break
      
    case 'gmail_new_email':
      formatted.push('📧 New Gmail Email')
      if (data.from) formatted.push(`From: ${data.from}`)
      if (data.to) formatted.push(`To: ${data.to}`)
      if (data.subject) formatted.push(`Subject: ${data.subject}`)
      if (data.snippet) formatted.push(`Preview: ${data.snippet}`)
      break
      
    case 'discord_trigger_new_message':
      formatted.push('💬 New Discord Message')
      if (data.authorName) formatted.push(`Author: ${data.authorName}`)
      if (data.channelName) formatted.push(`Channel: #${data.channelName}`)
      if (data.content) formatted.push(`Message: "${data.content}"`)
      break
      
    case 'slack_new_message':
      formatted.push('💬 New Slack Message')
      if (data.user) formatted.push(`User: ${data.user}`)
      if (data.channel) formatted.push(`Channel: #${data.channel}`)
      if (data.text) formatted.push(`Message: "${data.text}"`)
      break
      
    case 'airtable_record_created':
    case 'airtable_record_updated':
      const action = triggerType.includes('created') ? 'Created' : 'Updated'
      formatted.push(`📊 Airtable Record ${action}`)
      if (data.tableName) formatted.push(`Table: ${data.tableName}`)
      if (data.recordId) formatted.push(`Record ID: ${data.recordId}`)
      if (data.fields) {
        formatted.push('Fields:')
        Object.entries(data.fields).forEach(([key, value]) => {
          formatted.push(`  ${formatFieldName(key)}: ${formatValue(value)}`)
        })
      }
      break
      
    case 'google_sheets_row_added':
    case 'google_sheets_row_updated':
      const sheetAction = triggerType.includes('added') ? 'Added' : 'Updated'
      formatted.push(`📊 Google Sheets Row ${sheetAction}`)
      if (data.spreadsheetName) formatted.push(`Spreadsheet: ${data.spreadsheetName}`)
      if (data.sheetName) formatted.push(`Sheet: ${data.sheetName}`)
      if (data.row) formatted.push(`Row: ${data.row}`)
      if (data.values) {
        formatted.push('Values:')
        data.values.forEach((value: any, i: number) => {
          formatted.push(`  Column ${String.fromCharCode(65 + i)}: ${formatValue(value)}`)
        })
      }
      break
      
    default:
      formatted.push(`🔔 ${formatFieldName(triggerType)} Triggered`)
      if (data) {
        formatted.push('Data:')
        formatted.push(formatValue(data, 2))
      }
  }
  
  return formatted
}

/**
 * Format action input data
 */
export function formatInputData(nodeType: string, config: any, previousOutputs?: any): string[] {
  const formatted: string[] = []
  
  // Add configuration values
  if (config && Object.keys(config).length > 0) {
    formatted.push('📥 Configuration:')
    Object.entries(config)
      .filter(([key]) => !key.startsWith('_') && key !== 'nodeId')
      .forEach(([key, value]) => {
        const formattedKey = formatFieldName(key)
        const formattedValue = formatValue(value)
        formatted.push(`  ${formattedKey}: ${formattedValue}`)
      })
  }
  
  // Add previous node outputs if used
  if (previousOutputs && Object.keys(previousOutputs).length > 0) {
    formatted.push('')
    formatted.push('🔗 Using outputs from previous nodes:')
    Object.entries(previousOutputs).forEach(([nodeId, output]) => {
      formatted.push(`  From ${nodeId}:`)
      if (typeof output === 'object' && output !== null) {
        Object.entries(output).forEach(([key, value]) => {
          formatted.push(`    ${formatFieldName(key)}: ${formatValue(value)}`)
        })
      } else {
        formatted.push(`    ${formatValue(output)}`)
      }
    })
  }
  
  return formatted
}

/**
 * Format action output data based on node type
 */
export function formatOutputData(nodeType: string, output: any): string[] {
  const formatted: string[] = []
  const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === nodeType)
  
  formatted.push(`✅ ${nodeComponent?.title || nodeType} Completed`)
  formatted.push('')
  
  // Format based on common output patterns
  if (output) {
    // Check for common success/error patterns
    if ('success' in output) {
      formatted.push(`Status: ${output.success ? 'Success ✓' : 'Failed ✗'}`)
    }
    
    if (output.message) {
      formatted.push(`Message: ${output.message}`)
    }
    
    // Format specific output types
    if (output.id || output.recordId) {
      formatted.push(`Created/Updated ID: ${output.id || output.recordId}`)
    }
    
    if (output.url) {
      formatted.push(`URL: ${output.url}`)
    }
    
    if (output.data) {
      formatted.push('Output Data:')
      formatted.push(formatValue(output.data, 2))
    }
    
    // Handle array outputs (like list operations)
    if (Array.isArray(output)) {
      formatted.push(`Found ${output.length} items:`)
      output.slice(0, 5).forEach((item, i) => {
        formatted.push(`  [${i + 1}] ${formatValue(item)}`)
      })
      if (output.length > 5) {
        formatted.push(`  ... and ${output.length - 5} more`)
      }
    }
    
    // Handle remaining fields not covered above
    const handledFields = ['success', 'message', 'id', 'recordId', 'url', 'data']
    Object.entries(output)
      .filter(([key]) => !handledFields.includes(key) && !key.startsWith('_'))
      .forEach(([key, value]) => {
        formatted.push(`${formatFieldName(key)}: ${formatValue(value)}`)
      })
  }
  
  return formatted
}

/**
 * Format error information
 */
export function formatErrorData(error: any): string[] {
  const formatted: string[] = []
  
  formatted.push('❌ Error Occurred')
  if (error.message) {
    formatted.push(`Message: ${error.message}`)
  }
  if (error.code) {
    formatted.push(`Error Code: ${error.code}`)
  }
  if (error.details) {
    formatted.push(`Details: ${error.details}`)
  }
  if (error.suggestion) {
    formatted.push(`💡 Suggestion: ${error.suggestion}`)
  }
  
  return formatted
}

/**
 * Create a formatted execution log entry
 */
export function createExecutionLogEntry(
  node: any,
  status: 'started' | 'completed' | 'error',
  data?: {
    trigger?: any,
    input?: any,
    output?: any,
    error?: any,
    executionTime?: number
  }
): ExecutionLogEntry {
  const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data.type)
  
  const entry: ExecutionLogEntry = {
    nodeId: node.id,
    nodeType: node.data.type,
    nodeTitle: node.data.title || nodeComponent?.title || 'Unknown Node',
    timestamp: new Date().toISOString(),
    status,
    executionTime: data?.executionTime
  }
  
  // Add trigger information if this is a trigger node
  if (node.data.isTrigger && data?.trigger) {
    entry.trigger = {
      type: node.data.type,
      source: data.trigger.source || 'unknown',
      data: data.trigger,
      formattedData: formatTriggerData(node.data.type, data.trigger)
    }
  }
  
  // Add input information
  if (data?.input) {
    entry.input = {
      raw: data.input,
      formatted: formatInputData(node.data.type, node.data.config, data.input.previousOutputs)
    }
  }
  
  // Add output information
  if (data?.output) {
    entry.output = {
      raw: data.output,
      formatted: formatOutputData(node.data.type, data.output)
    }
  }
  
  // Add error information
  if (data?.error) {
    entry.error = {
      message: data.error.message || 'Unknown error',
      details: data.error.details,
      stack: data.error.stack
    }
  }
  
  return entry
}

/**
 * Format an execution log entry for display
 */
export function formatExecutionLogEntry(entry: ExecutionLogEntry): string {
  const lines: string[] = []
  const timestamp = new Date(entry.timestamp).toLocaleTimeString()
  
  // Header
  lines.push('━'.repeat(60))
  lines.push(`🔄 ${entry.nodeTitle} (${entry.nodeType})`)
  lines.push(`⏱️ ${timestamp}${entry.executionTime ? ` • ${entry.executionTime}ms` : ''}`)
  lines.push(`📌 Status: ${entry.status === 'completed' ? '✅ Completed' : entry.status === 'error' ? '❌ Error' : '🔄 Started'}`)
  lines.push('─'.repeat(60))
  
  // Trigger data
  if (entry.trigger?.formattedData) {
    lines.push(...entry.trigger.formattedData)
    lines.push('')
  }
  
  // Input data
  if (entry.input?.formatted && entry.input.formatted.length > 0) {
    lines.push(...entry.input.formatted)
    lines.push('')
  }
  
  // Output data
  if (entry.output?.formatted && entry.output.formatted.length > 0) {
    lines.push(...entry.output.formatted)
    lines.push('')
  }
  
  // Error data
  if (entry.error) {
    lines.push(...formatErrorData(entry.error))
    lines.push('')
  }
  
  return lines.join('\n')
}

/**
 * Store execution logs in localStorage for persistence
 */
export function storeExecutionLog(workflowId: string, entry: ExecutionLogEntry) {
  const key = `workflow_execution_logs_${workflowId}`
  const existing = localStorage.getItem(key)
  const logs = existing ? JSON.parse(existing) : []
  
  // Keep only last 100 entries
  logs.push(entry)
  if (logs.length > 100) {
    logs.shift()
  }
  
  localStorage.setItem(key, JSON.stringify(logs))
}

/**
 * Retrieve execution logs from localStorage
 */
export function getExecutionLogs(workflowId: string): ExecutionLogEntry[] {
  const key = `workflow_execution_logs_${workflowId}`
  const stored = localStorage.getItem(key)
  return stored ? JSON.parse(stored) : []
}

/**
 * Clear execution logs
 */
export function clearExecutionLogs(workflowId: string) {
  const key = `workflow_execution_logs_${workflowId}`
  localStorage.removeItem(key)
}