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

    // Generate confirmation URL using Supabase admin
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?from=email`,
      },
    })

    if (error) {
      console.error('Error generating confirmation link:', error)
      return NextResponse.json(
        { error: 'Failed to generate confirmation link' },
        { status: 500 }
      )
    }

    // Send custom welcome email with confirmation link via Resend
    const result = await sendWelcomeEmail(
      {
        to: email,
        subject: 'Welcome to ChainReact - Confirm your email',
      },
      {
        username: username || 'there',
        confirmationUrl: data.properties?.action_link || '',
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