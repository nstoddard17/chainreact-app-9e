import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { sendCustomEmail, validateEmail } from '@/lib/services/resend'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    const body = await request.json()
    const { to, subject, html, text, attachments } = body

    // Validate required fields
    if (!to || !subject) {
      return errorResponse('Missing required fields: to, subject' , 400)
    }

    // Validate email addresses
    const recipients = Array.isArray(to) ? to : [to]
    for (const email of recipients) {
      if (!validateEmail(email)) {
        return jsonResponse(
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
      return errorResponse(result.error , 500)
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
      logger.error('Error logging email activity:', logError)
      // Don't fail the request, just log the error
    }

    return jsonResponse({
      success: true,
      emailId: result.id,
      message: 'Email sent successfully'
    })

  } catch (error) {
    logger.error('Error in email send API:', error)
    return errorResponse('Internal server error' , 500)
  }
}