import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/utils/logger'

// Service role client to check user confirmation status (bypasses RLS)
const getServiceClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

/**
 * Check if a user's email has been confirmed
 * This endpoint allows the waiting-confirmation page to poll for confirmation
 * status even when the confirmation happened on a different device
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, email } = await request.json()

    if (!userId && !email) {
      return NextResponse.json(
        { error: 'userId or email is required' },
        { status: 400 }
      )
    }

    const serviceClient = getServiceClient()

    // Query the auth.users table to check email_confirmed_at
    // We use the admin API to get user by ID or email
    let user = null

    if (userId) {
      const { data, error } = await serviceClient.auth.admin.getUserById(userId)
      if (error) {
        logger.error('[check-confirmation] Error fetching user by ID:', error)
        return NextResponse.json(
          { error: 'Failed to check confirmation status' },
          { status: 500 }
        )
      }
      user = data.user
    } else if (email) {
      // List users and find by email (admin API doesn't have getUserByEmail)
      const { data, error } = await serviceClient.auth.admin.listUsers()
      if (error) {
        logger.error('[check-confirmation] Error listing users:', error)
        return NextResponse.json(
          { error: 'Failed to check confirmation status' },
          { status: 500 }
        )
      }
      user = data.users.find(u => u.email === email)
    }

    if (!user) {
      return NextResponse.json(
        { confirmed: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const isConfirmed = !!user.email_confirmed_at

    logger.info('[check-confirmation] Status check:', {
      userId: user.id,
      email: user.email,
      confirmed: isConfirmed,
      confirmedAt: user.email_confirmed_at
    })

    return NextResponse.json({
      confirmed: isConfirmed,
      confirmedAt: user.email_confirmed_at
    })

  } catch (error) {
    logger.error('[check-confirmation] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
