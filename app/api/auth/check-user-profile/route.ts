import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createAdminClient } from '@/lib/supabase/admin'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return errorResponse('User ID is required' , 400)
    }

    const supabase = createAdminClient()

    // Check if user profile exists
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('id, first_name, last_name')
      .eq('id', userId)
      .single()

    if (error) {
      return jsonResponse({
        hasProfile: false,
        error: error.message
      })
    }

    return jsonResponse({
      hasProfile: !!profile,
    })

  } catch (error) {
    logger.error('Error checking user profile:', error)
    return errorResponse('Internal server error', 500, { hasProfile: false })
  }
}
