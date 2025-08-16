import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWelcomeEmail } from '@/lib/services/resend'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, userId, username } = body

    if (!email || !userId) {
      return NextResponse.json(
        { error: 'Missing email or userId' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Create a simple confirmation token (we'll verify this manually)
    const confirmationToken = Buffer.from(`${userId}:${Date.now()}`).toString('base64')
    
    // Store the token temporarily (you could also use a database table for this)
    const confirmationUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?token=${confirmationToken}&from=email`

    // Send custom welcome email with confirmation link via Resend
    const result = await sendWelcomeEmail(
      {
        to: email,
        subject: 'Welcome to ChainReact - Confirm your email',
      },
      {
        username: username || 'there',
        confirmationUrl: confirmationUrl,
      }
    )

    if (!result.success) {
      console.error('Error sending welcome email:', result.error)
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    console.log('Custom confirmation email sent successfully via Resend:', result.id)
    return NextResponse.json({
      success: true,
      message: 'Confirmation email sent successfully',
      emailId: result.id
    })

  } catch (error) {
    console.error('Error sending confirmation email:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}