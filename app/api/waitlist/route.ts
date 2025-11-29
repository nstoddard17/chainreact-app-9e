import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWaitlistWelcomeEmail } from '@/lib/services/resend'
import { logger } from '@/lib/utils/logger'

// Use service role for anonymous submissions
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

interface WaitlistSubmission {
  name: string
  email: string
  selectedIntegrations: string[]
  customIntegrations: string[]
  wantsAiAssistant: boolean
  wantsAiActions: boolean
  aiActionsImportance: 'not-important' | 'somewhat-important' | 'very-important' | 'critical'
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as WaitlistSubmission

    // Validate required fields
    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (!body.email?.trim()) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Check if email already exists
    const { data: existingEntry } = await supabase
      .from('waitlist')
      .select('id, email')
      .eq('email', body.email.toLowerCase().trim())
      .maybeSingle()

    if (existingEntry) {
      logger.info(`[Waitlist] Duplicate submission attempt for email: ${body.email}`)
      return NextResponse.json(
        { error: 'This email is already on the waitlist' },
        { status: 409 }
      )
    }

    // Insert into database
    const { data, error } = await supabase
      .from('waitlist')
      .insert({
        name: body.name.trim(),
        email: body.email.toLowerCase().trim(),
        selected_integrations: body.selectedIntegrations || [],
        custom_integrations: body.customIntegrations || [],
        wants_ai_assistant: body.wantsAiAssistant ?? true,
        wants_ai_actions: body.wantsAiActions ?? true,
        ai_actions_importance: body.aiActionsImportance || 'very-important',
        welcome_email_sent: false,
      })
      .select()
      .single()

    if (error) {
      logger.error('[Waitlist] Failed to insert into database:', error)
      return NextResponse.json(
        { error: 'Failed to join waitlist. Please try again.' },
        { status: 500 }
      )
    }

    logger.info(`[Waitlist] New signup: ${body.email}`)

    // Send welcome email asynchronously (don't block the response)
    sendWaitlistWelcomeEmail(body.email, body.name)
      .then((result) => {
        if (result.success) {
          // Update the welcome_email_sent flag
          supabase
            .from('waitlist')
            .update({ welcome_email_sent: true })
            .eq('id', data.id)
            .then(() => {
              logger.info(`[Waitlist] Welcome email sent to: ${body.email}`)
            })
            .catch((updateError) => {
              logger.error('[Waitlist] Failed to update welcome_email_sent flag:', updateError)
            })
        } else {
          logger.error(`[Waitlist] Failed to send welcome email to ${body.email}:`, result.error)
        }
      })
      .catch((emailError) => {
        logger.error('[Waitlist] Error sending welcome email:', emailError)
      })

    return NextResponse.json(
      {
        success: true,
        message: 'Successfully joined the waitlist!',
        data: {
          id: data.id,
          email: data.email,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    logger.error('[Waitlist] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
