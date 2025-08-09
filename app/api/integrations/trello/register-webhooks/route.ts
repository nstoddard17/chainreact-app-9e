import { NextRequest, NextResponse } from 'next/server'
import { registerTrelloWebhooksForUser } from '@/lib/integrations/trello/webhooks'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    await registerTrelloWebhooksForUser(userId)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 })
  }
}


