/**
 * Action Test Service
 *
 * Executes REAL API calls to test actions during workflow configuration.
 * Sends actual test messages with special metadata to distinguish from production.
 *
 * Based on industry standards (Zapier, Make.com):
 * - Actions are tested with real API calls
 * - Test messages include metadata/badges
 * - Test data is returned for verification
 */

import { logger } from '@/lib/utils/logger'

export interface ActionTestContext {
  userId: string
  workflowId: string
  nodeId: string
  nodeType: string
  providerId: string
  config: Record<string, any>
  integrationId: string
}

export interface ActionTestResult {
  success: boolean
  message: string
  testData?: Record<string, any>
  error?: {
    code: string
    message: string
    details?: any
  }
}

export class ActionTestService {

  /**
   * Test an action by executing it with real API calls
   */
  async testAction(context: ActionTestContext): Promise<ActionTestResult> {
    const { providerId, nodeType, config, integrationId } = context

    logger.info(`🧪 Testing action: ${nodeType}`, { providerId, nodeId: context.nodeId })

    try {
      // Validate configuration
      this.validateConfig(nodeType, config)

      // Route to appropriate test handler
      switch (providerId) {
        case 'slack':
          return await this.testSlackAction(context)

        case 'gmail':
          return await this.testGmailAction(context)

        case 'discord':
          return await this.testDiscordAction(context)

        case 'notion':
          return await this.testNotionAction(context)

        default:
          // For unsupported providers, just validate config
          return {
            success: true,
            message: `Configuration validated for ${providerId}`,
            testData: { validated: true }
          }
      }
    } catch (error: any) {
      logger.error(`❌ Action test failed:`, error)

      return {
        success: false,
        message: error.message || 'Test failed',
        error: {
          code: error.code || 'TEST_FAILED',
          message: error.message,
          details: error.response?.data || error
        }
      }
    }
  }

  /**
   * Test Slack action (send message)
   */
  private async testSlackAction(context: ActionTestContext): Promise<ActionTestResult> {
    const { config, integrationId, nodeType } = context

    // Only test send_message action
    if (!nodeType.includes('send_message')) {
      return {
        success: true,
        message: 'Configuration validated',
        testData: { validated: true }
      }
    }

    // Validate required fields
    if (!config.channel) {
      throw new Error('No channel selected')
    }
    if (!config.message) {
      throw new Error('No message specified')
    }

    // Replace variables with realistic placeholder values for testing
    const testMessage = ActionTestService.replaceVariablesWithPlaceholders(config.message)

    // Call test API endpoint
    const response = await fetch('/api/workflows/test/slack/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        integrationId,
        channel: config.channel,
        message: testMessage,
        attachments: config.attachments,
        isTest: true
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to send test message')
    }

    const data = await response.json()

    return {
      success: true,
      message: '✅ Test message sent to Slack!',
      testData: {
        ts: data.ts,
        channel: data.channel,
        messagePreview: testMessage.substring(0, 50) + '...'
      }
    }
  }

  /**
   * Test Gmail action (send email)
   */
  private async testGmailAction(context: ActionTestContext): Promise<ActionTestResult> {
    const { config, integrationId, nodeType } = context

    if (!nodeType.includes('send_email')) {
      return {
        success: true,
        message: 'Configuration validated',
        testData: { validated: true }
      }
    }

    // Validate required fields
    if (!config.to) {
      throw new Error('No recipient specified')
    }
    if (!config.subject) {
      throw new Error('No subject specified')
    }

    // Call test API endpoint
    const response = await fetch('/api/workflows/test/gmail/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        integrationId,
        to: config.to,
        subject: config.subject,
        body: config.body,
        isTest: true
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to send test email')
    }

    const data = await response.json()

    return {
      success: true,
      message: '✅ Test email sent!',
      testData: {
        messageId: data.id,
        to: config.to,
        subject: config.subject
      }
    }
  }

  /**
   * Test Discord action
   */
  private async testDiscordAction(context: ActionTestContext): Promise<ActionTestResult> {
    const { config, integrationId, nodeType } = context

    if (!nodeType.includes('send_message')) {
      return {
        success: true,
        message: 'Configuration validated',
        testData: { validated: true }
      }
    }

    if (!config.channelId && !config.webhookUrl) {
      throw new Error('No channel or webhook specified')
    }
    if (!config.content && !config.message) {
      throw new Error('No message content specified')
    }

    const response = await fetch('/api/workflows/test/discord/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        integrationId,
        channelId: config.channelId,
        webhookUrl: config.webhookUrl,
        content: config.content || config.message,
        isTest: true
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to send test message')
    }

    const data = await response.json()

    return {
      success: true,
      message: '✅ Test message sent to Discord!',
      testData: {
        messageId: data.id,
        channelId: config.channelId
      }
    }
  }

  /**
   * Test Notion action
   */
  private async testNotionAction(context: ActionTestContext): Promise<ActionTestResult> {
    // For now, just validate config
    // TODO: Implement actual Notion API tests
    return {
      success: true,
      message: 'Configuration validated',
      testData: { validated: true }
    }
  }

  /**
   * Validate action configuration
   */
  private validateConfig(nodeType: string, config: Record<string, any>): void {
    // Basic validation - ensure config is not empty
    if (!config || Object.keys(config).length === 0) {
      throw new Error('No configuration provided')
    }

    // Check for connection field
    if (!config.connection && !config.integrationId) {
      logger.warn(`⚠️ No connection ID in config for ${nodeType}`)
    }
  }

  /**
   * Replace variables in test messages with realistic placeholder values
   * Shows users what the actual output will look like during workflow execution
   */
  static replaceVariablesWithPlaceholders(message: string): string {
    // Define realistic sample data for common trigger/action variables
    const sampleData: Record<string, string> = {
      // Gmail trigger variables
      'trigger.from': 'john.doe@example.com',
      'trigger.to': 'you@company.com',
      'trigger.subject': 'Important Project Update',
      'trigger.body': 'Hi team, here\'s the latest update on the Q4 project...',
      'trigger.snippet': 'Hi team, here\'s the latest update on the Q4 project...',
      'trigger.date': new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      'trigger.time': new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      'trigger.id': 'msg_1234567890abcdef',
      'trigger.threadId': 'thread_abcdef1234567890',

      // Slack trigger variables
      'trigger.user': '@johndoe',
      'trigger.username': 'John Doe',
      'trigger.text': 'Can someone review this pull request?',
      'trigger.channel': '#engineering',
      'trigger.channelId': 'C0123456789',
      'trigger.ts': Date.now().toString(),

      // Discord trigger variables
      'trigger.author': 'JohnDoe#1234',
      'trigger.content': 'Hey everyone, check out this new feature!',
      'trigger.channelName': '#general',

      // Generic action outputs
      'action.output': 'Sample action output',
      'action.result': 'Success',
      'action.id': 'action_1234567890',

      // Notion variables
      'trigger.page_title': 'Q4 Planning Document',
      'trigger.database_name': 'Project Tasks',

      // Calendar/event variables
      'trigger.event_title': 'Team Standup',
      'trigger.start_time': '10:00 AM',
      'trigger.attendees': 'John, Sarah, Mike',

      // Form/submission variables
      'trigger.name': 'John Doe',
      'trigger.email': 'john.doe@example.com',
      'trigger.company': 'Acme Inc',
      'trigger.message': 'I\'d like to schedule a demo',
    }

    return message.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
      const trimmed = variable.trim()

      // Check for exact match first
      if (sampleData[trimmed]) {
        return sampleData[trimmed]
      }

      // Check for partial matches (case-insensitive)
      const lowerVariable = trimmed.toLowerCase()

      // Email-related
      if (lowerVariable.includes('email') || (lowerVariable.includes('from') && !sampleData[trimmed])) {
        return 'john.doe@example.com'
      }
      if (lowerVariable.includes('subject')) {
        return 'Important Project Update'
      }
      if (lowerVariable.includes('body') || lowerVariable.includes('content') || lowerVariable.includes('message') || lowerVariable.includes('text')) {
        return 'This is a sample message that would come from your trigger'
      }
      if (lowerVariable.includes('snippet')) {
        return 'Hi team, here\'s the latest update on the Q4 project...'
      }

      // User-related
      if (lowerVariable.includes('user') || lowerVariable.includes('author') || lowerVariable.includes('sender')) {
        return 'John Doe'
      }
      if (lowerVariable.includes('name') && !lowerVariable.includes('channel')) {
        return 'John Doe'
      }

      // Channel/location-related
      if (lowerVariable.includes('channel')) {
        return '#general'
      }

      // Date/time-related
      if (lowerVariable.includes('date')) {
        return new Date().toLocaleDateString()
      }
      if (lowerVariable.includes('time')) {
        return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      }

      // ID-related
      if (lowerVariable.includes('id')) {
        return 'id_1234567890'
      }

      // Title-related
      if (lowerVariable.includes('title')) {
        return 'Sample Title'
      }

      // Fallback: show the variable name in a friendly format
      return `[Sample ${trimmed}]`
    })
  }
}

export const actionTestService = new ActionTestService()
