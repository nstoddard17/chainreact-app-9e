/**
 * Microsoft Excel Integration Data API Route
 * Handles Excel data requests using Microsoft Graph API
 */

import { NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { microsoftExcelHandlers } from './handlers'
import { MicrosoftExcelIntegration } from './types'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function POST(req: NextRequest) {
  let dataType: string | undefined;
  let options: any = {};

  try {
    const body = await req.json()
    dataType = body.dataType;
    options = body.options || {};
    const { integrationId } = body

    // Validate required parameters
    if (!dataType) {
      return errorResponse('Missing required parameter: dataType'
      , 400)
    }

    // If integrationId is provided, first get that integration to find the user
    let userId: string | null = null
    if (integrationId) {
      const { data: requestingIntegration, error: requestingError } = await getSupabase()
        .from('integrations')
        .select('user_id')
        .eq('id', integrationId)
        .single()

      if (!requestingError && requestingIntegration) {
        userId = requestingIntegration.user_id
      }
    }

    // Fetch the Microsoft Excel integration
    let query = getSupabase()
      .from('integrations')
      .select('*')
      .eq('provider', 'microsoft-excel')

    // Filter by user if we have the userId
    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data: integrations, error: integrationError } = await query

    if (integrationError || !integrations || integrations.length === 0) {
      return errorResponse('Microsoft Excel is not connected. Please connect your Microsoft Excel account first.'
      , 404)
    }

    // Use the first connected Excel integration
    const integration = integrations.find(i => i.status === 'connected')

    if (!integration) {
      return errorResponse('Microsoft Excel requires an active connection. Please connect your Microsoft account.', 400, { needsReconnection: true
       })
    }


    // Normalize the dataType by removing the provider prefix if present
    // The dataType may come in as "microsoft-excel_columns" or just "columns"
    const normalizedDataType = dataType.replace(/^microsoft-excel[_-]/, '');

    // Get the appropriate handler
    const handler = microsoftExcelHandlers[normalizedDataType]
    if (!handler) {
      return jsonResponse({
        error: `Unknown Microsoft Excel data type: ${dataType}`,
        availableTypes: Object.keys(microsoftExcelHandlers)
      }, { status: 400 })
    }

    // Execute the handler
    const data = await handler(integration as MicrosoftExcelIntegration, options)

    return jsonResponse({
      data,
      success: true,
      dataType
    })

  } catch (error: any) {
    console.error('❌ [Microsoft Excel API] Error:', {
      message: error.message,
      stack: error.stack,
      dataType,
      options
    });

    // Handle authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      return errorResponse(error.message, 401, { needsReconnection: true
       })
    }

    // Handle rate limit errors
    if (error.message?.includes('rate limit')) {
      return errorResponse('Microsoft Graph API rate limit exceeded. Please try again later.'
      , 429)
    }

    return errorResponse(error.message || 'Failed to fetch Excel data', 500, {
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      dataType,
      hasOptions: !!options
     })
  }
}