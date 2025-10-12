import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({
        error: 'Missing userId parameter'
      }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()

    // Check if user has a connected Microsoft Outlook integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'microsoft-outlook')
      .eq('status', 'connected')
      .single()

    if (integrationError || !integration) {
      // Integration not connected - return empty signatures
      return NextResponse.json({
        signatures: [],
        needsConnection: true
      })
    }

    // For now, return empty signatures array
    // TODO: Implement actual Outlook signature fetching via Microsoft Graph API
    // Outlook signatures are complex and require special Graph API permissions
    return NextResponse.json({
      signatures: [],
      needsConnection: false
    })

  } catch (error: any) {
    logger.error('[Outlook Signatures API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch Outlook signatures' },
      { status: 500 }
    )
  }
}