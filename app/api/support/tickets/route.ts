import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { subject, description, priority, category, errorDetails, attachments } = body

    // Validate required fields
    if (!subject || !description) {
      return NextResponse.json({ error: 'Subject and description are required' }, { status: 400 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', user.id)
      .single()

    // Collect system information
    const systemInfo = {
      userAgent: request.headers.get('user-agent'),
      referer: request.headers.get('referer'),
      timestamp: new Date().toISOString(),
    }

    // Create ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({
        user_id: user.id,
        subject,
        description,
        priority: priority || 'medium',
        category: category || 'general',
        user_email: user.email,
        user_name: profile?.full_name || profile?.username,
        error_details: errorDetails,
        system_info: systemInfo,
        attachments,
        tags: category ? [category] : [],
      })
      .select()
      .single()

    if (ticketError) {
      console.error('Error creating ticket:', ticketError)
      return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
    }

    // Send email notification to support team
    try {
      await resend.emails.send({
        from: 'ChainReact Support <support@chainreact.app>',
        to: process.env.SUPPORT_EMAIL || 'support@chainreact.app',
        subject: `[${ticket.ticket_number}] ${subject}`,
        html: `
          <h2>New Support Ticket Created</h2>
          <p><strong>Ticket Number:</strong> ${ticket.ticket_number}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Priority:</strong> ${priority || 'medium'}</p>
          <p><strong>Category:</strong> ${category || 'general'}</p>
          <p><strong>User:</strong> ${user.email} (${profile?.full_name || profile?.username || 'N/A'})</p>
          <p><strong>Description:</strong></p>
          <p>${description}</p>
          ${errorDetails ? `<p><strong>Error Details:</strong></p><pre>${JSON.stringify(errorDetails, null, 2)}</pre>` : ''}
          <p><strong>System Info:</strong></p>
          <pre>${JSON.stringify(systemInfo, null, 2)}</pre>
          <p><a href="${process.env.NEXT_PUBLIC_BASE_URL}/admin/support/tickets/${ticket.id}">View Ticket in Admin Panel</a></p>
        `,
      })
    } catch (emailError) {
      console.error('Error sending support email:', emailError)
      // Don't fail the request if email fails
    }

    return NextResponse.json({ ticket })
  } catch (error) {
    console.error('Error in POST /api/support/tickets:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const category = searchParams.get('category')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('support_tickets')
      .select(`
        *,
        support_ticket_responses(count)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (priority) query = query.eq('priority', priority)
    if (category) query = query.eq('category', category)

    const { data: tickets, error, count } = await query
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching tickets:', error)
      return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 })
    }

    return NextResponse.json({ 
      tickets, 
      count,
      pagination: {
        limit,
        offset,
        hasMore: count ? offset + limit < count : false
      }
    })
  } catch (error) {
    console.error('Error in GET /api/support/tickets:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 