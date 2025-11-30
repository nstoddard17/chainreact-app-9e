import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

// Trello verifies callbackURL with a HEAD request; respond 200
export async function HEAD() {
  return new NextResponse(null, { status: 200 })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const headers = Object.fromEntries(req.headers.entries())

  try {
    await getSupabase().from('integration_webhook_executions').insert({
      user_id: body?.action?.memberCreator?.id || null,
      provider_id: 'trello',
      trigger_type: 'trello_trigger_event',
      payload: body,
      headers,
      status: 'success'
    })
  } catch {}

  return jsonResponse({ ok: true })
}


