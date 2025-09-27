/**
 * Dropbox Integration Data API Route
 * Handles Dropbox data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from "@supabase/supabase-js"
import { dropboxHandlers } from './handlers'
import { DropboxIntegration } from './types'
import { flagIntegrationWorkflows } from '@/lib/integrations/integrationWorkflowManager'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  let integration: any = null

  try {
    const { integrationId, dataType, options = {} } = await req.json()

    // Validate required parameters
    if (!integrationId || !dataType) {
      return NextResponse.json({
        error: 'Missing required parameters: integrationId and dataType'
      }, { status: 400 })
    }

    // Fetch integration from database
    const { data: integrationRecord, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'dropbox')
      .single()

    if (integrationError || !integrationRecord) {
      console.error('❌ [Dropbox API] Integration not found:', { integrationId, error: integrationError })
      return NextResponse.json({
        error: 'Dropbox integration not found'
      }, { status: 404 })
    }

    integration = integrationRecord

    // Validate integration status
    if (integration.status !== 'connected') {
      console.error('❌ [Dropbox API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return NextResponse.json({
        error: 'Dropbox integration is not connected. Please reconnect your account.',
        needsReconnection: true,
        currentStatus: integration.status
      }, { status: 400 })
    }

    // Get the appropriate handler
    const handler = dropboxHandlers[dataType]
    if (!handler) {
      console.error('❌ [Dropbox API] Unknown data type:', dataType)
      return NextResponse.json({
        error: `Unknown Dropbox data type: ${dataType}`,
        availableTypes: Object.keys(dropboxHandlers)
      }, { status: 400 })
    }

    console.log(`🔍 [Dropbox API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const data = await handler(integration as DropboxIntegration, options)

    console.log(`✅ [Dropbox API] Successfully processed ${dataType}:`, {
      integrationId,
      resultCount: data?.length || 0
    })

    return NextResponse.json({
      data,
      success: true,
      integrationId,
      dataType
    })

  } catch (error: any) {
    console.error('❌ [Dropbox API] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })

    // Handle authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      if (integration?.id && integration?.user_id) {
        await flagIntegrationWorkflows({
          integrationId: integration.id,
          provider: 'dropbox',
          userId: integration.user_id,
          reason: error.message,
        })
      }
      return NextResponse.json({
        error: error.message,
        needsReconnection: true
      }, { status: 401 })
    }

    // Handle rate limit errors
    if (error.message?.includes('rate limit')) {
      return NextResponse.json({
        error: 'Dropbox API rate limit exceeded. Please try again later.',
        retryAfter: 60
      }, { status: 429 })
    }

    return NextResponse.json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}
