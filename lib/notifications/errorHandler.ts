/**
 * Workflow Error Notification Orchestrator
 *
 * This module handles sending error notifications through multiple channels
 * (Email, SMS, Slack, Discord) based on workflow settings.
 */

import { logger } from '@/lib/utils/logger'
import { sendWorkflowErrorEmail } from './email'
import { sendWorkflowErrorSlack } from './slack'
import { sendWorkflowErrorDiscord } from './discord'

interface WorkflowSettings {
  error_notifications_enabled?: boolean
  error_notification_email?: boolean
  error_notification_slack?: boolean
  error_notification_discord?: boolean
  error_notification_sms?: boolean
  error_notification_channels?: {
    email?: string
    slack_channel?: string
    discord_channel?: string
    sms_phone?: string
  }
}

interface Workflow {
  id: string
  name: string
  user_id: string
  settings?: WorkflowSettings
}

interface ErrorDetails {
  message: string
  stack?: string
  executionId?: string
}

/**
 * Send error notifications for a failed workflow
 *
 * @param workflow - The workflow that failed
 * @param error - The error details
 * @returns Object with success status for each notification channel
 */
export async function sendWorkflowErrorNotifications(
  workflow: Workflow,
  error: ErrorDetails
): Promise<{
  email: boolean
  sms: boolean
  slack: boolean
  discord: boolean
}> {
  const results = {
    email: false,
    sms: false,
    slack: false,
    discord: false
  }

  // Check if error notifications are enabled
  if (!workflow.settings?.error_notifications_enabled) {
    logger.debug('Error notifications disabled for workflow:', workflow.id)
    return results
  }

  const settings = workflow.settings
  const channels = settings.error_notification_channels || {}

  // Format error message
  const errorMessage = error.message || 'Unknown error occurred'
  const workflowName = workflow.name || 'Untitled Workflow'
  const workflowId = workflow.id
  const userId = workflow.user_id
  const executionId = error.executionId

  logger.info('Sending error notifications for workflow:', {
    workflowId,
    workflowName,
    channels: {
      email: settings.error_notification_email,
      slack: settings.error_notification_slack,
      discord: settings.error_notification_discord,
      sms: settings.error_notification_sms
    }
  })

  // Send Email Notification
  if (settings.error_notification_email && channels.email) {
    try {
      results.email = await sendWorkflowErrorEmail(
        channels.email,
        workflowName,
        workflowId,
        errorMessage,
        executionId
      )

      if (results.email) {
        logger.info('Email notification sent:', channels.email)
      }
    } catch (err: any) {
      logger.error('Email notification failed:', err.message)
    }
  }

  // Send SMS Notification
  if (settings.error_notification_sms && channels.sms_phone) {
    try {
      // Dynamically import SMS functions only when needed (Twilio is optional dependency)
      const { sendSMS, formatPhoneNumber } = await import('./sms')
      const formattedPhone = formatPhoneNumber(channels.sms_phone)
      const smsMessage = `ChainReact Alert: Workflow "${workflowName}" failed. Error: ${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}`

      results.sms = await sendSMS(formattedPhone, smsMessage)

      if (results.sms) {
        logger.info('SMS notification sent:', formattedPhone)
      }
    } catch (err: any) {
      logger.error('SMS notification failed:', err.message)
    }
  }

  // Send Slack Notification
  if (settings.error_notification_slack && channels.slack_channel) {
    try {
      results.slack = await sendWorkflowErrorSlack(
        channels.slack_channel,
        workflowName,
        workflowId,
        errorMessage,
        userId,
        executionId
      )

      if (results.slack) {
        logger.info('Slack notification sent:', channels.slack_channel)
      }
    } catch (err: any) {
      logger.error('Slack notification failed:', err.message)
    }
  }

  // Send Discord Notification
  if (settings.error_notification_discord && channels.discord_channel) {
    try {
      results.discord = await sendWorkflowErrorDiscord(
        channels.discord_channel,
        workflowName,
        workflowId,
        errorMessage,
        userId,
        executionId
      )

      if (results.discord) {
        logger.info('Discord notification sent:', channels.discord_channel)
      }
    } catch (err: any) {
      logger.error('Discord notification failed:', err.message)
    }
  }

  // Log summary
  const successCount = Object.values(results).filter(r => r).length
  const totalEnabled = Object.values(results).length

  logger.info('Error notification summary:', {
    workflowId,
    successCount,
    totalEnabled,
    results
  })

  return results
}

/**
 * Helper function to extract error message from various error types
 */
export function extractErrorMessage(error: any): string {
  if (typeof error === 'string') {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  if (error?.message) {
    return error.message
  }

  return 'Unknown error occurred'
}
