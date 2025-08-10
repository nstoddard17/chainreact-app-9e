import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

export async function POST(_req: NextRequest) {
  // Simple pull worker: process oldest pending items
  const { data: rows } = await supabase
    .from('microsoft_webhook_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(25)

  if (!rows || rows.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let processed = 0
  for (const row of rows) {
    try {
      await supabase
        .from('microsoft_webhook_queue')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', row.id)

      // TODO: fetch changed entities using stored user/tenant token
      // Placeholder: mark as done
      await supabase
        .from('microsoft_webhook_queue')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', row.id)

      processed++
    } catch (e: any) {
      await supabase
        .from('microsoft_webhook_queue')
        .update({ status: 'error', error_message: e.message, updated_at: new Date().toISOString() })
        .eq('id', row.id)
    }
  }

  return NextResponse.json({ processed })
}


