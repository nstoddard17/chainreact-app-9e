/**
 * Gmail Data API Route
 * Handles all Gmail-specific data fetching operations
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { gmailHandlers, isGmailDataTypeSupported, getAvailableGmailDataTypes } from './handlers'
import { GmailIntegration } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Handle Gmail data requests
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { integrationId, dataType, options = {} } = body

    console.log('🔍 [Gmail Data API] Request:', { integrationId, dataType, options })

    // Validate required parameters
    if (!integrationId || !dataType) {
      console.log('❌ [Gmail Data API] Missing required parameters')
      return NextResponse.json({ error: 'Missing required parameters: integrationId and dataType' }, { status: 400 })
    }

    // Check if data type is supported
    if (!isGmailDataTypeSupported(dataType)) {
      console.log('❌ [Gmail Data API] Unsupported data type:', dataType)
      return NextResponse.json({ 
        error: `Data type '${dataType}' not supported. Available types: ${getAvailableGmailDataTypes().join(', ')}` 
      }, { status: 400 })
    }

    // Get Gmail integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'gmail')
      .single()

    if (integrationError || !integration) {
      console.error('❌ [Gmail Data API] Integration not found:', integrationError)
      return NextResponse.json({ error: 'Gmail integration not found' }, { status: 404 })
    }

    // Validate integration status - allow 'connected' status
    if (integration.status !== 'connected' && integration.status !== 'active') {
      console.log('⚠️ [Gmail Data API] Integration not connected:', integration.status)
      return NextResponse.json({ 
        error: 'Gmail integration is not connected. Please reconnect your account.',
        needsReconnection: true,
        currentStatus: integration.status
      }, { status: 400 })
    }

    // Get the appropriate handler
    const handler = gmailHandlers[dataType]
    if (!handler) {
      console.error('❌ [Gmail Data API] Handler not found for:', dataType)
      return NextResponse.json({ error: `Handler not implemented for data type: ${dataType}` }, { status: 500 })
    }

    // Execute the handler
    console.log(`🚀 [Gmail Data API] Executing handler for: ${dataType}`)
    const startTime = Date.now()
    
    const result = await handler(integration as GmailIntegration, options)
    
    const duration = Date.now() - startTime
    console.log(`✅ [Gmail Data API] Handler completed in ${duration}ms, returned ${Array.isArray(result) ? result.length : 'non-array'} items`)

    return NextResponse.json({
      data: result,
      meta: {
        dataType,
        integrationId,
        count: Array.isArray(result) ? result.length : 1,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error: any) {
    console.error('❌ [Gmail Data API] Error:', error)
    
    // Handle specific Gmail API errors
    if (error.status === 401) {
      return NextResponse.json({ 
        error: 'Gmail authentication expired. Please reconnect your account.',
        needsReconnection: true 
      }, { status: 401 })
    }
    
    if (error.status === 403) {
      return NextResponse.json({ 
        error: 'Gmail API access forbidden. Check your permissions.',
        needsReconnection: true 
      }, { status: 403 })
    }
    
    if (error.status === 429) {
      return NextResponse.json({ 
        error: 'Gmail API rate limit exceeded. Please try again later.' 
      }, { status: 429 })
    }

    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}

/**
 * Get available Gmail data types
 */
export async function GET() {
  return NextResponse.json({
    availableDataTypes: getAvailableGmailDataTypes(),
    description: 'Gmail Integration Data API',
    version: '1.0.0'
  })
}