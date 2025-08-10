import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const manager = new MicrosoftGraphSubscriptionManager()

export async function POST(req: NextRequest) {
  try {
    const { userId, selections } = await req.json()
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    // Get user MS token (refresh outside scope here)
    const { data: integ } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'microsoft')
      .single()
    if (!integ) return NextResponse.json({ error: 'Microsoft integration not found' }, { status: 404 })
    const token = integ.access_token

    const created: string[] = []

    // Core resources
    try {
      const sub = await manager.createSubscription({
        resource: manager.buildOneDriveRootResource(),
        changeType: 'updated,created,deleted',
        userId,
        accessToken: token
      })
      created.push(sub.id)
    } catch {}

    try {
      const sub = await manager.createSubscription({
        resource: manager.buildOutlookMailResource(),
        changeType: 'created,updated',
        userId,
        accessToken: token
      })
      created.push(sub.id)
    } catch {}

    try {
      const sub = await manager.createSubscription({
        resource: manager.buildOutlookCalendarResource(),
        changeType: 'created,updated,deleted',
        userId,
        accessToken: token
      })
      created.push(sub.id)
    } catch {}

    // Teams selections
    if (selections?.teams) {
      for (const t of selections.teams) {
        if (t.channelId) {
          try {
            const sub = await manager.createSubscription({
              resource: manager.buildTeamsChannelMessagesResource(t.teamId, t.channelId),
              changeType: 'created,updated,deleted',
              userId,
              accessToken: token
            })
            created.push(sub.id)
          } catch {}
        }
      }
    }

    // Chats selections
    if (selections?.chats) {
      for (const chat of selections.chats) {
        try {
          const sub = await manager.createSubscription({
            resource: manager.buildChatMessagesResource(chat.chatId),
            changeType: 'created,updated,deleted',
            userId,
            accessToken: token
          })
          created.push(sub.id)
        } catch {}
      }
    }

    return NextResponse.json({ success: true, created })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'auto-subscribe failed' }, { status: 500 })
  }
}


