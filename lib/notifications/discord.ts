/**
 * Discord Notification Service
 */

import { logger } from '@/lib/utils/logger'
import { createSupabaseServerClient } from '@/utils/supabase/server'

interface DiscordEmbed {
  title: string
  description: string
  color: number
  fields: Array<{ name: string; value: string; inline?: boolean }>
  timestamp: string
}

/**
 * Send Discord notification to a channel
 */
export async function sendDiscordMessage(
  channelId: string,
  message: string,
  userId: string
): Promise<boolean> {
  try {
    // Use Discord Bot Token (not user OAuth token)
    const botToken = process.env.DISCORD_BOT_TOKEN

    if (!botToken) {
      logger.error('Discord bot token not configured')
      return false
    }

    // Send message via Discord API
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: message,
        embeds: [formatDiscordEmbed(message)],
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      logger.error('Discord API error:', error)
      return false
    }

    const data = await response.json()

    logger.info('Discord message sent successfully:', {
      channel: channelId,
      id: data.id
    })

    return true
  } catch (error: any) {
    logger.error('Failed to send Discord message:', {
      error: error.message,
      channelId
    })
    return false
  }
}

/**
 * Format message into Discord embed for better formatting
 */
function formatDiscordEmbed(message: string): DiscordEmbed {
  const lines = message.split('\n')
  const workflowName = lines.find(l => l.includes('Workflow'))?.replace(/^.*"(.*)".*$/, '$1') || 'Unknown'
  const errorLine = lines.find(l => l.includes('Error:'))?.split('Error: ')[1] || 'Unknown error'
  const workflowId = lines.find(l => l.includes('Workflow ID:'))?.split(': ')[1]
  const executionId = lines.find(l => l.includes('Execution ID:'))?.split(': ')[1]

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: '🔧 Workflow',
      value: workflowName,
      inline: true
    },
    {
      name: '⏰ Time',
      value: new Date().toLocaleString(),
      inline: true
    }
  ]

  if (workflowId) {
    fields.push({
      name: '🆔 Workflow ID',
      value: `\`${workflowId}\``,
      inline: false
    })
  }

  if (executionId) {
    fields.push({
      name: '📋 Execution ID',
      value: `\`${executionId}\``,
      inline: false
    })
  }

  fields.push({
    name: '❌ Error',
    value: `\`\`\`${errorLine}\`\`\``,
    inline: false
  })

  return {
    title: '⚠️ Workflow Error Alert',
    description: `Workflow **${workflowName}** encountered an error`,
    color: 0xDC3545, // Red color
    fields,
    timestamp: new Date().toISOString()
  }
}

/**
 * Send workflow error to Discord with formatted embed
 */
export async function sendWorkflowErrorDiscord(
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

  return sendDiscordMessage(channelId, message, userId)
}
