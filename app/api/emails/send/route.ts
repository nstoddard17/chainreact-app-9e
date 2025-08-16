import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { sendCustomEmail, validateEmail } from '@/lib/services/resend'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { to, subject, html, text, attachments } = body

    // Validate required fields
    if (!to || !subject) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject' },
        { status: 400 }
      )
    }

    // Validate email addresses
    const recipients = Array.isArray(to) ? to : [to]
    for (const email of recipients) {
      if (!validateEmail(email)) {
        return NextResponse.json(
          { error: `Invalid email address: ${email}` },
          { status: 400 }
        )
      }
    }

    // Send email
    const result = await sendCustomEmail({
      to: recipients,
      subject,
      html,
      text,
      attachments,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    // Log email activity to database
    const { error: logError } = await supabase
      .from('email_logs')
      .insert({
        user_id: user.id,
        recipient: recipients.join(', '),
        subject,
        email_id: result.id,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })

    if (logError) {
      console.error('Error logging email activity:', logError)
      // Don't fail the request, just log the error
    }

    return NextResponse.json({
      success: true,
      emailId: result.id,
      message: 'Email sent successfully'
    })

  } catch (error) {
    console.error('Error in email send API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}