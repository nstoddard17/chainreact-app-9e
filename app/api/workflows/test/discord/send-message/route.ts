/**
 * Discord Send Message Test API
 *
 * Sends a REAL test message to Discord with test badge/metadata.
 * Based on industry standards (Zapier, Make.com) - test messages are actually sent.
 *
 * Uses DISCORD_BOT_TOKEN env var (same as production actions and channel listing).
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { channelId, webhookUrl, content, isTest } = body

    logger.info('[Discord Test] Testing send message', { channelId, webhookUrl: !!webhookUrl, isTest })

    // If using webhook URL, send directly
    if (webhookUrl) {
      return await sendViaWebhook(webhookUrl, content, isTest)
    }

    // Otherwise use bot token from environment (same as all other Discord endpoints)
    if (!channelId) {
      return NextResponse.json(
        { error: 'Either webhookUrl or channelId required' },
        { status: 400 }
      )
    }

    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      logger.error('[Discord Test] DISCORD_BOT_TOKEN not configured')
      return NextResponse.json(
        { error: 'Discord bot token not configured' },
        { status: 500 }
      )
    }

    // Prepare message with test badge
    const testContent = isTest
      ? `**ChainReact Test Message**\n\n${content}\n\n_This is a test from ChainReact. Your workflow is configured correctly!_`
      : content

    // Send message to Discord
    const discordResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: testContent,
      })
    })

    if (!discordResponse.ok) {
      const errorData = await discordResponse.json().catch(() => ({}))
      logger.error('[Discord Test] API error:', { status: discordResponse.status, error: errorData })
      return NextResponse.json(
        { error: errorData.message || `Discord API error: ${discordResponse.status}` },
        { status: discordResponse.status }
      )
    }

    const discordData = await discordResponse.json()

    logger.info('[Discord Test] Message sent successfully', {
      id: discordData.id,
      channelId: discordData.channel_id
    })

    return NextResponse.json({
      success: true,
      id: discordData.id,
      channel_id: discordData.channel_id,
      content: discordData.content
    })

  } catch (error: any) {
    logger.error('[Discord Test] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Send message via Discord webhook
 */
async function sendViaWebhook(webhookUrl: string, content: string, isTest: boolean) {
  const testContent = isTest
    ? `**ChainReact Test Message**\n\n${content}\n\n_This is a test from ChainReact. Your workflow is configured correctly!_`
    : content

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: testContent,
      username: 'ChainReact',
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    logger.error('[Discord Test] Webhook error:', { status: response.status, error: errorData })
    return NextResponse.json(
      { error: errorData.message || `Discord webhook error: ${response.status}` },
      { status: response.status }
    )
  }

  // Discord webhooks return 204 No Content on success
  if (response.status === 204) {
    return NextResponse.json({
      success: true,
      message: 'Message sent via webhook'
    })
  }

  const data = await response.json().catch(() => ({}))
  return NextResponse.json({
    success: true,
    id: data.id,
    ...data
  })
}
