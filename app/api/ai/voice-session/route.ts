import { NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

/**
 * POST /api/ai/voice-session
 * Returns configuration for voice mode
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    // Get OpenAI API key from environment
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      logger.error('OPENAI_API_KEY not configured')
      return errorResponse('Voice mode not configured', 500)
    }

    logger.info('Voice session request', { userId: user.id })

    // For now, return a simple relay token that the client will use
    // to connect to our WebSocket relay endpoint
    return jsonResponse({
      success: true,
      relay_url: `/api/ai/voice-relay`,
      model: 'gpt-4o-realtime-preview-2024-12-17',
      voice: 'alloy',
    })
  } catch (error: any) {
    logger.error('Error creating voice session:', error)
    return errorResponse('Failed to create voice session', 500)
  }
}
