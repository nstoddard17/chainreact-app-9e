import { NextResponse } from 'next/server'
import { sendDiscordMessage } from '@/lib/workflows/actions/discord'

import { logger } from '@/lib/utils/logger'

export async function POST(request: Request) {
  try {
    const { guildId, channelId, message } = await request.json()

    if (!guildId || !channelId || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: guildId, channelId, message' },
        { status: 400 }
      )
    }

    // Use a test user ID (you should replace this with actual user authentication)
    const testUserId = 'test-user-id'

    const result = await sendDiscordMessage(
      {
        guildId,
        channelId,
        message
      },
      testUserId,
      {}
    )

    return NextResponse.json(result)
  } catch (error: any) {
    logger.error('Discord test error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send Discord message' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Discord test endpoint. Send a POST request with guildId, channelId, and message.',
    example: {
      guildId: '123456789',
      channelId: '987654321',
      message: 'Hello from ChainReact!'
    }
  })
}