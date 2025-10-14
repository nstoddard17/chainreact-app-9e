import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { Resend } from 'resend'

import { logger } from '@/lib/utils/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    const body = await request.json()
    const { message, attachments, isStaffResponse = false } = body

    // Validate required fields
    if (!message) {
      return errorResponse('Message is required' , 400)
    }

    // Verify ticket exists and user has access
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (ticketError || !ticket) {
      return errorResponse('Ticket not found' , 404)
    }

    // Create response
    const { data: response, error: responseError } = await supabase
      .from('support_ticket_responses')
      .insert({
        ticket_id: params.id,
        user_id: user.id,
        is_staff_response: isStaffResponse,
        message,
        attachments,
      })
      .select()
      .single()

    if (responseError) {
      logger.error('Error creating response:', responseError)
      return errorResponse('Failed to create response' , 500)
    }

    // Update ticket status if user is responding
    if (!isStaffResponse) {
      await supabase
        .from('support_tickets')
        .update({ status: 'waiting_for_user' })
        .eq('id', params.id)
    }

    // Send email notification to support team if user is responding
    if (!isStaffResponse) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'ChainReact Support <support@chainreact.app>',
          to: process.env.SUPPORT_EMAIL || 'support@chainreact.app',
          subject: `[${ticket.ticket_number}] User Response`,
          html: `
            <h2>User Response to Ticket</h2>
            <p><strong>Ticket Number:</strong> ${ticket.ticket_number}</p>
            <p><strong>Subject:</strong> ${ticket.subject}</p>
            <p><strong>User:</strong> ${user.email}</p>
            <p><strong>Response:</strong></p>
            <p>${message}</p>
            <p><a href="${process.env.NEXT_PUBLIC_BASE_URL}/admin/support/tickets/${ticket.id}">View Ticket in Admin Panel</a></p>
          `,
        })
      } catch (emailError) {
        logger.error('Error sending support email:', emailError)
        // Don't fail the request if email fails
      }
    }

    return jsonResponse({ response })
  } catch (error) {
    logger.error('Error in POST /api/support/tickets/[id]/responses:', error)
    return errorResponse('Internal server error' , 500)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    // Verify ticket exists and user has access
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (ticketError || !ticket) {
      return errorResponse('Ticket not found' , 404)
    }

    // Get responses
    const { data: responses, error: responsesError } = await supabase
      .from('support_ticket_responses')
      .select('*')
      .eq('ticket_id', params.id)
      .order('created_at', { ascending: true })

    if (responsesError) {
      logger.error('Error fetching responses:', responsesError)
      return errorResponse('Failed to fetch responses' , 500)
    }

    return jsonResponse({ responses })
  } catch (error) {
    logger.error('Error in GET /api/support/tickets/[id]/responses:', error)
    return errorResponse('Internal server error' , 500)
  }
} 