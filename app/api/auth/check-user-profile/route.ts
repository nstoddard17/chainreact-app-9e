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

    // Check if user profile exists and has username
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('username')
      .eq('id', userId)
      .single()

    if (error) {
      return jsonResponse({
        hasUsername: false,
        error: error.message
      })
    }

    const hasUsername = !!(profile?.username && profile.username.trim() !== '')

    return jsonResponse({
      hasUsername,
      username: profile?.username || null
    })

  } catch (error) {
    logger.error('Error checking user profile:', error)
    return errorResponse('Internal server error', 500, { hasUsername: false  })
  }
}