import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { sendWelcomeEmail } from '@/lib/services/resend'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, userId } = body

    if (!email || !userId) {
      return NextResponse.json(
        { error: 'Missing email or userId' },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServiceClient()

    // Get user profile for personalization
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('username, full_name, first_name')
      .eq('id', userId)
      .single()

    // Generate confirmation URL
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
      },
    })

    if (error) {
      console.error('Error generating confirmation link:', error)
      return NextResponse.json(
        { error: 'Failed to generate confirmation link' },
        { status: 500 }
      )
    }

    // Send welcome email with confirmation link
    const result = await sendWelcomeEmail(
      {
        to: email,
        subject: 'Welcome to ChainReact - Confirm your email',
      },
      {
        username: profile?.username || profile?.first_name || profile?.full_name || undefined,
        confirmationUrl: data.properties?.action_link || '',
      }
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Confirmation email sent successfully'
    })

  } catch (error) {
    console.error('Error sending confirmation email:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}