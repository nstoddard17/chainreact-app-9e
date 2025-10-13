import { NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { sendDiscordMessage } from '@/lib/workflows/actions/discord'

import { logger } from '@/lib/utils/logger'

export async function POST(request: Request) {
  try {
    const { guildId, channelId, message } = await request.json()

    if (!guildId || !channelId || !message) {
      return errorResponse('Missing required fields: guildId, channelId, message' , 400)
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

    return jsonResponse(result)
  } catch (error: any) {
    logger.error('Discord test error:', error)
    return errorResponse(error.message || 'Failed to send Discord message' , 500)
  }
}

export async function GET() {
  return jsonResponse({
    message: 'Discord test endpoint. Send a POST request with guildId, channelId, and message.',
    example: {
      guildId: '123456789',
      channelId: '987654321',
      message: 'Hello from ChainReact!'
    }
  })
}