import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    // Admin-only endpoint - check for admin key
    const adminKey = request.headers.get('x-admin-key')
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request data
    const data = await request.json()
    const { integration_id, provider, user_id } = data

    const admin = createAdminClient()
    let query = admin.from('integrations').update({
      status: 'connected',
      consecutive_failures: 0,
      disconnect_reason: null,
      disconnected_at: null,
      is_active: true,
      updated_at: new Date().toISOString()
    })

    // Filter by integration_id, provider, or user_id
    if (integration_id) {
      query = query.eq('id', integration_id)
    } else if (provider && user_id) {
      query = query.eq('provider', provider).eq('user_id', user_id)
    } else if (provider) {
      query = query.eq('provider', provider)
    } else if (user_id) {
      query = query.eq('user_id', user_id)
    } else {
      return NextResponse.json(
        { error: 'At least one filter (integration_id, provider, or user_id) is required' }, 
        { status: 400 }
      )
    }

    const { error, count } = await query
    
    if (error) {
      console.error('Error resetting integrations:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Successfully reset ${count} integration(s)`,
      count
    })
  } catch (error) {
    console.error('Error in reset integration endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 