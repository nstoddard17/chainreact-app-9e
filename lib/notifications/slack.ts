/**
 * Slack Notification Service
 */

import { logger } from '@/lib/utils/logger'
import { createSupabaseServerClient } from '@/utils/supabase/server'

interface SlackMessage {
  channel: string
  text: string
  blocks?: any[]
}

/**
 * Send Slack notification to a channel
 */
export async function sendSlackMessage(
  channelId: string,
  message: string,
  userId: string
): Promise<boolean> {
  try {
    // Get user's Slack integration
    const supabase = await createSupabaseServerClient()

    const { data: integration, error } = await supabase
      .from('integrations')
      .select('credentials')
      .eq('user_id', userId)
      .eq('provider', 'slack')
      .eq('status', 'connected')
      .single()

    if (error || !integration) {
      logger.error('Slack integration not found for user:', userId)
      return false
    }

    const accessToken = integration.credentials?.access_token

    if (!accessToken) {
      logger.error('Slack access token not found')
      return false
    }

    // Send message via Slack API
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        text: message,
        blocks: formatSlackBlocks(message),
      }),
    })

    const data = await response.json()

    if (!data.ok) {
      logger.error('Slack API error:', data.error)
      return false
    }

    logger.info('Slack message sent successfully:', {
      channel: channelId,
      ts: data.ts
    })

    return true
  } catch (error: any) {
    logger.error('Failed to send Slack message:', {
      error: error.message,
      channelId
    })
    return false
  }
}

/**
 * Format message into Slack blocks for better formatting
 */
function formatSlackBlocks(message: string): any[] {
  const lines = message.split('\n')
  const workflowName = lines.find(l => l.includes('Workflow'))?.replace(/^.*"(.*)".*$/, '$1') || 'Unknown'
  const errorLine = lines.find(l => l.includes('Error:'))
  const workflowId = lines.find(l => l.includes('Workflow ID:'))?.split(': ')[1]

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '⚠️ Workflow Error Alert',
        emoji: true
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Workflow:*\n${workflowName}`
        },
        {
          type: 'mrkdwn',
          text: `*Time:*\n${new Date().toLocaleString()}`
        }
      ]
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Error:*\n\`\`\`${errorLine || message}\`\`\``
      }
    },
    ...(workflowId ? [{
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Workflow',
            emoji: true
          },
          url: `https://chainreact.app/workflows/builder/${workflowId}`,
          style: 'primary'
        }
      ]
    }] : [])
  ]
}

/**
 * Send workflow error to Slack with formatted blocks
 */
export async function sendWorkflowErrorSlack(
  channelId: string,
  workflowName: string,
  workflowId: string,
  error: string,
  userId: string,
  executionId?: string
): Promise<boolean> {
  const message = `
Workflow "${workflowName}" failed

Error: ${error}

Workflow ID: ${workflowId}
${executionId ? `Execution ID: ${executionId}` : ''}
Time: ${new Date().toLocaleString()}
  `.trim()

  return sendSlackMessage(channelId, message, userId)
}
