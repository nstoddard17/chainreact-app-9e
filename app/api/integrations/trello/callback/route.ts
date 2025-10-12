import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'

import { logger } from '@/lib/utils/logger'

// Note: Trello auth flow in this app uses return_url to a client page
// (/integrations/trello-auth) where token is in the URL fragment.
// This API callback is a fallback if we ever redirect here with key/token.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const key = url.searchParams.get('key') || process.env.TRELLO_CLIENT_ID || ''
  const token = url.searchParams.get('token')
  const state = url.searchParams.get('state')
  const userId = url.searchParams.get('userId')

  if (!token || !userId) {
    // Redirect to the client handler page so it can capture the token from the fragment if present
    const base = getBaseUrl()
    return NextResponse.redirect(`${base}/integrations/trello-auth${state ? `?state=${encodeURIComponent(state)}` : ''}`)
  }

  try {
    // Persist Trello integration (store token and metadata keyed by provider)
    const { error } = await supabase
      .from('integrations')
      .upsert({
        user_id: userId,
        provider: 'trello',
        provider_user_id: null,
        access_token: token,
        status: 'connected',
        updated_at: new Date().toISOString(),
        metadata: {
          client_key: key || null,
          connected_at: new Date().toISOString(),
        },
      }, { onConflict: 'user_id, provider' })

    if (error) throw error

    // Return success response immediately
    const successResponse = NextResponse.json({ success: true })

    // Register webhooks for user boards in background (best-effort) - DON'T await this call
    const base = getBaseUrl()
    setImmediate(() => {
      fetch(`${base}/api/integrations/trello/register-webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      }).catch(e => logger.warn('Failed to register Trello webhooks', e))
    })

    return successResponse
  } catch (e: any) {
    logger.error("Trello callback error:", e)
    const baseUrl = getBaseUrl()
    return createPopupResponse("error", "Trello", e.message || "An unexpected error occurred.", baseUrl)
  }
}
