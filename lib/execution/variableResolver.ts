import { parseVariableReference, normalizeVariableReference } from "../workflows/variableReferences"

import { logger } from '@/lib/utils/logger'

/**
 * Variable Resolution Utility
 *
 * Handles template variable replacement and data mapping for workflow execution.
 * Extracted from advancedExecutionEngine to follow Single Responsibility Principle.
 */

/**
 * Map workflow data using a mapping configuration
 * Replaces template variables in the mapping with actual data values
 */
export function mapWorkflowData(data: any, mapping: Record<string, string>): any {
  const mappedData: Record<string, any> = {}

  for (const [targetKey, sourcePath] of Object.entries(mapping)) {
    mappedData[targetKey] = replaceTemplateVariables(sourcePath, data)
  }

  return mappedData
}

/**
 * Replace template variables in a string with actual data values
 * Supports syntax: {{Node Name.Field Name}} or {{path.to.value}}
 */
export function replaceTemplateVariables(template: string, data: any): any {
  if (typeof template !== 'string') return template

  logger.debug(`🔧 Replacing variables in template length: ${template.length}`)
  logger.debug(`🔧 Available data keys:`, Object.keys(data || {}))

  // Special debug for message content
  if (template.includes('Message Content')) {
    logger.debug(`🔧 🚨 MESSAGE CONTENT DEBUG:`)
    logger.debug(`🔧   - template length: ${template.length}`)
    logger.debug(`🔧   - data.message exists: ${!!data?.message}`)
    logger.debug(`🔧   - data.message.content length: ${data?.message?.content?.length || 0}`)
  }

  // Handle template syntax like {{New Message in Channel.Message Content}}
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const trimmedPath = path.trim()
    logger.debug(`🔧 Processing variable path: "${trimmedPath}"`)

    const normalizedPath = normalizeVariableReference(`{{${trimmedPath}}}`)
    const parsed = parseVariableReference(normalizedPath)
    if (parsed && parsed.kind === 'node' && parsed.nodeId) {
      const nodeData = data?.[parsed.nodeId]
      if (nodeData?.output) {
        const resolved = getNestedValue(nodeData.output, parsed.fieldPath.join('.'))
        if (resolved !== undefined && resolved !== null) {
          return resolved
        }
      }
    }

    // Handle "New Message in Channel.Field Name" format
    if (trimmedPath.includes('.')) {
      const parts = trimmedPath.split('.')
      const nodeName = parts[0].trim()
      const fieldName = parts.slice(1).join('.').trim()

      logger.debug(`🔧 Node: "${nodeName}", Field: "${fieldName}"`)

      // Map Discord trigger fields to actual data paths
      if (nodeName === 'New Message in Channel') {
        const discordValue = resolveDiscordMessageField(fieldName, data)
        if (discordValue !== undefined) return discordValue
      }

      // Handle Discord member join trigger fields
      if (nodeName === 'User Joined Server') {
        const joinValue = resolveDiscordJoinField(fieldName, data)
        if (joinValue !== undefined) return joinValue
      }

      // Handle AI Agent variables like {{AI Agent.AI Agent Output}}
      if (nodeName === 'AI Agent' || nodeName.includes('AI')) {
        const aiValue = resolveAIAgentField(fieldName, data)
        if (aiValue !== undefined) return aiValue
      }
    }

    // Fallback to direct path resolution
    const value = getNestedValue(data, trimmedPath)
    logger.debug(`🔧 Direct path result: "${value}"`)
    return value !== undefined ? value : match
  })
}

/**
 * Resolve Discord message trigger fields
 */
function resolveDiscordMessageField(fieldName: string, data: any): any {
  switch (fieldName) {
    case 'Message Content':
      const content = data?.message?.content || ''
      logger.debug(`🔧 Found Message Content length: ${content.length}`)
      return content
    case 'Channel Name':
      const channelName = data?.message?.channelName || data?.message?.channelId || ''
      logger.debug(`🔧 Found Channel Name length: ${channelName.length}`)
      return channelName
    case 'Author Name':
      const authorName = data?.message?.authorName || data?.message?.authorDisplayName || data?.message?.authorId || ''
      logger.debug(`🔧 Found Author Name length: ${authorName.length}`)
      return authorName
    case 'Guild Name':
      const guildName = data?.message?.guildName || data?.message?.guildId || ''
      logger.debug(`🔧 Found Guild Name: "${guildName}"`)
      return guildName
    case 'Message ID':
      const messageId = data?.message?.messageId || ''
      logger.debug(`🔧 Found Message ID: "${messageId}"`)
      return messageId
    case 'Timestamp':
      const timestamp = data?.message?.timestamp || ''
      logger.debug(`🔧 Found Timestamp: "${timestamp}"`)
      return timestamp
    default:
      logger.debug(`🔧 Unknown Discord message field: "${fieldName}"`)
      return undefined
  }
}

/**
 * Resolve Discord member join trigger fields
 */
function resolveDiscordJoinField(fieldName: string, data: any): any {
  const joinFieldMap: Record<string, string> = {
    'Member ID': 'memberId',
    'Member Tag': 'memberTag',
    'Member Username': 'memberUsername',
    'Member Discriminator': 'memberDiscriminator',
    'Member Avatar': 'memberAvatar',
    'Server ID': 'guildId',
    'Server Name': 'guildName',
    'Guild ID': 'guildId',
    'Guild Name': 'guildName',
    'Join Time': 'joinedAt',
    'Joined At': 'joinedAt',
    'Invite Code': 'inviteCode',
    'Invite URL': 'inviteUrl',
    'Inviter Tag': 'inviterTag',
    'Inviter ID': 'inviterId',
    'Invite Uses': 'inviteUses',
    'Invite Max Uses': 'inviteMaxUses',
    'Timestamp': 'timestamp',
    'Event Time': 'timestamp',
  }

  const joinKey = joinFieldMap[fieldName] || joinFieldMap[fieldName.trim()]

  if (joinKey) {
    const candidatePaths = [
      joinKey,
      `trigger.${joinKey}`,
      `trigger.output.${joinKey}`,
    ]

    for (const candidate of candidatePaths) {
      const resolved = getNestedValue(data, candidate)
      if (resolved !== undefined && resolved !== null) {
        logger.debug(`🔧 Found User Joined Server field "${fieldName}": "${resolved}"`)
        return resolved
      }
    }
  }

  logger.debug(`🔧 User Joined Server output not found for field: "${fieldName}"`)
  return undefined
}

/**
 * Resolve AI Agent output fields
 */
function resolveAIAgentField(fieldName: string, data: any): any {
  logger.debug(`🔧 Looking for AI Agent output in data:`, Object.keys(data))

  // Look for any node result that might be an AI agent
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && (value as any).output) {
      const nodeResult = value as any
      logger.debug(`🔧 Checking node result ${key}:`, JSON.stringify(nodeResult, null, 2))

      // Check if this looks like an AI agent result
      if (nodeResult.output) {
        // Handle specific field requests
        if (fieldName === 'Email Subject' && nodeResult.output.subject) {
          logger.debug(`🔧 Found AI Agent subject: "${nodeResult.output.subject}"`)
          return nodeResult.output.subject
        }
        if (fieldName === 'Email Body' && nodeResult.output.body) {
          logger.debug(`🔧 Found AI Agent body: "${nodeResult.output.body}"`)
          return nodeResult.output.body
        }
        if ((fieldName === 'AI Agent Output' || fieldName === 'output') && nodeResult.output.output) {
          logger.debug(`🔧 Found AI Agent output: "${nodeResult.output.output}"`)
          return nodeResult.output.output
        }
      }
    }
  }

  logger.debug(`🔧 AI Agent output not found for field: "${fieldName}"`)
  return undefined
}

/**
 * Get nested value from object using dot notation path
 */
export function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined
  }, obj)
}

/**
 * Evaluate a JavaScript expression in a safe context
 * WARNING: Uses Function constructor - ensure expression is from trusted source
 */
export function evaluateExpression(expression: string, context: any): any {
  try {
    // Simple evaluation - in production, use a safer evaluator
    const func = new Function("data", "variables", "context", `return ${expression}`)
    return func(context.data, context.variables, context)
  } catch (error) {
    return expression // Return as literal if evaluation fails
  }
}

/**
 * Evaluate a condition expression and return boolean result
 * WARNING: Uses Function constructor - ensure condition is from trusted source
 */
export function evaluateCondition(condition: string, context: any): boolean {
  try {
    const func = new Function("data", "variables", "context", `return ${condition}`)
    return !!func(context.data, context.variables, context)
  } catch (error) {
    return false
  }
}
