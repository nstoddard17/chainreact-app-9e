import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, token } = body

    if (!userId || !token) {
      return NextResponse.json(
        { error: 'Missing userId or token' },
        { status: 400 }
      )
    }

    // Verify the token
    try {
      const decodedToken = Buffer.from(token, 'base64').toString()
      const [tokenUserId, timestamp] = decodedToken.split(':')
      
      if (tokenUserId !== userId) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 400 }
        )
      }

      // Check if token is not too old (24 hours)
      const tokenAge = Date.now() - parseInt(timestamp)
      if (tokenAge > 24 * 60 * 60 * 1000) {
        return NextResponse.json(
          { error: 'Confirmation link has expired' },
          { status: 400 }
        )
      }
    } catch (tokenError) {
      return NextResponse.json(
        { error: 'Invalid token format' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Manually confirm the user's email
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      email_confirm: true
    })

    if (error) {
      console.error('Error confirming user email:', error)
      return NextResponse.json(
        { error: 'Failed to confirm email' },
        { status: 500 }
      )
    }

    console.log('User email confirmed successfully:', userId)
    return NextResponse.json({
      success: true,
      message: 'Email confirmed successfully'
    })

  } catch (error) {
    console.error('Error in manual confirmation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}