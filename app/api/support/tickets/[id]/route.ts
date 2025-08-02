import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get ticket with responses
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select(`
        *,
        support_ticket_responses(
          id,
          message,
          is_staff_response,
          attachments,
          created_at,
          updated_at
        )
      `)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (ticketError) {
      if (ticketError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
      }
      console.error('Error fetching ticket:', ticketError)
      return NextResponse.json({ error: 'Failed to fetch ticket' }, { status: 500 })
    }

    return NextResponse.json({ ticket })
  } catch (error) {
    console.error('Error in GET /api/support/tickets/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { subject, description, priority, category, status } = body

    // Only allow users to update certain fields
    const updateData: any = {}
    if (subject) updateData.subject = subject
    if (description) updateData.description = description
    if (priority) updateData.priority = priority
    if (category) updateData.category = category
    if (status) updateData.status = status

    // Update ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .update(updateData)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (ticketError) {
      if (ticketError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
      }
      console.error('Error updating ticket:', ticketError)
      return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 })
    }

    return NextResponse.json({ ticket })
  } catch (error) {
    console.error('Error in PUT /api/support/tickets/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete ticket (this will cascade to responses)
    const { error: deleteError } = await supabase
      .from('support_tickets')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Error deleting ticket:', deleteError)
      return NextResponse.json({ error: 'Failed to delete ticket' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Ticket deleted successfully' })
  } catch (error) {
    console.error('Error in DELETE /api/support/tickets/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 