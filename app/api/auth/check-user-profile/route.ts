import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Check if user profile exists and has username
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('username')
      .eq('id', userId)
      .single()

    if (error) {
      return NextResponse.json({
        hasUsername: false,
        error: error.message
      })
    }

    const hasUsername = !!(profile?.username && profile.username.trim() !== '')

    return NextResponse.json({
      hasUsername,
      username: profile?.username || null
    })

  } catch (error) {
    logger.error('Error checking user profile:', error)
    return NextResponse.json(
      { error: 'Internal server error', hasUsername: false },
      { status: 500 }
    )
  }
}