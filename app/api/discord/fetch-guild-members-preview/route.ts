import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { fetchDiscordGuildMembers } from '@/lib/workflows/actions/discord'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const { config } = await request.json()
    
    if (!config) {
      return errorResponse('Config is required' , 400)
    }

    // Get user from session
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    // Call the Discord action function to get preview data
    const result = await fetchDiscordGuildMembers(config, user.id, {})
    
    if (!result.success) {
      return errorResponse(result.message , 400)
    }

    return jsonResponse({ 
      success: true, 
      data: result.output,
      message: result.message 
    })

  } catch (error: any) {
    logger.error('Error in fetch guild members preview:', error)
    return errorResponse(error.message || 'Failed to fetch guild members preview' , 500)
  }
} 