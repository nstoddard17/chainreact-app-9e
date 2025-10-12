import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    // Admin-only endpoint - check for admin key
    const adminKey = request.headers.get('x-admin-key')
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request data
    const data = await request.json()
    const { integration_id, provider, user_id, reset_failures } = data

    const admin = createAdminClient()
    
    // Prepare update data
    const updateData: any = {
      status: 'connected',
      disconnected_at: null,
      disconnect_reason: null,
      updated_at: new Date().toISOString()
    }
    
    // Reset consecutive failures if requested
    if (reset_failures) {
      updateData.consecutive_failures = 0
    }

    let query = admin.from('integrations').update(updateData)

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
      logger.error('Error reactivating integrations:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // Get the updated integrations for the response
    let selectQuery = admin.from('integrations').select('id, provider, user_id, status, consecutive_failures')
    
    if (integration_id) {
      selectQuery = selectQuery.eq('id', integration_id)
    } else if (provider && user_id) {
      selectQuery = selectQuery.eq('provider', provider).eq('user_id', user_id)
    } else if (provider) {
      selectQuery = selectQuery.eq('provider', provider)
    } else if (user_id) {
      selectQuery = selectQuery.eq('user_id', user_id)
    }
    
    const { data: updatedIntegrations, error: selectError } = await selectQuery
    
    if (selectError) {
      logger.error('Error fetching updated integrations:', selectError)
    }

    return NextResponse.json({
      success: true,
      message: `Successfully reactivated ${count} integration(s)`,
      count,
      integrations: updatedIntegrations || []
    })
  } catch (error) {
    logger.error('Error in reactivate integration endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
