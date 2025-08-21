/**
 * OneNote Integration Data API Route
 * Handles OneNote data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from "@supabase/supabase-js"
import { oneNoteHandlers } from './handlers'
import { OneNoteIntegration } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    const { integrationId, dataType, options = {} } = await req.json()

    // Validate required parameters
    if (!integrationId || !dataType) {
      return NextResponse.json({
        error: 'Missing required parameters: integrationId and dataType'
      }, { status: 400 })
    }

    // Fetch integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .in('provider', ['onenote', 'microsoft-onenote'])
      .single()

    if (integrationError || !integration) {
      console.error('❌ [OneNote API] Integration not found:', { integrationId, error: integrationError })
      return NextResponse.json({
        error: 'OneNote integration not found'
      }, { status: 404 })
    }

    // Validate integration status
    if (integration.status !== 'connected') {
      console.error('❌ [OneNote API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return NextResponse.json({
        error: 'OneNote integration is not connected. Please reconnect your Microsoft account.',
        needsReconnection: true,
        currentStatus: integration.status
      }, { status: 400 })
    }

    // Get the appropriate handler
    const handler = oneNoteHandlers[dataType]
    if (!handler) {
      console.error('❌ [OneNote API] Unknown data type:', dataType)
      return NextResponse.json({
        error: `Unknown OneNote data type: ${dataType}`,
        availableTypes: Object.keys(oneNoteHandlers)
      }, { status: 400 })
    }

    console.log(`🔍 [OneNote API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const result = await handler(integration as OneNoteIntegration, options)

    console.log(`✅ [OneNote API] Successfully processed ${dataType}:`, {
      integrationId,
      resultCount: result.data?.length || 0,
      hasError: !!result.error
    })

    return NextResponse.json({
      data: result.data,
      error: result.error,
      success: !result.error,
      integrationId,
      dataType
    })

  } catch (error: any) {
    console.error('❌ [OneNote API] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })

    // Handle authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      return NextResponse.json({
        error: error.message,
        needsReconnection: true
      }, { status: 401 })
    }

    // Handle rate limit errors
    if (error.message?.includes('rate limit')) {
      return NextResponse.json({
        error: 'Microsoft Graph API rate limit exceeded. Please try again later.',
        retryAfter: 60
      }, { status: 429 })
    }

    return NextResponse.json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}