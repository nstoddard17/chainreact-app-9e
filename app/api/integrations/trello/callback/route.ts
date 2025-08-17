import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

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
    // Persist Trello integration (store key in external_key, token in access_token)
    const { error } = await supabase
      .from('integrations')
      .upsert({
        user_id: userId,
        provider: 'trello',
        provider_user_id: null,
        external_key: key,
        access_token: token,
        status: 'connected',
        updated_at: new Date().toISOString()
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
      }).catch(e => console.warn('Failed to register Trello webhooks', e))
    })

    return successResponse
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Trello callback error' }, { status: 500 })
  }
}
