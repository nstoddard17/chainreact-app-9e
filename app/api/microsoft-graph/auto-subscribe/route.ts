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
    const errors: {resource: string, error: string}[] = []

    // Core resources - OneDrive
    try {
      const sub = await manager.createSubscription({
        resource: manager.buildOneDriveRootResource(),
        changeType: 'updated,created,deleted',
        userId,
        accessToken: token
      })
      created.push(sub.id)
    } catch (e: any) {
      errors.push({
        resource: 'onedrive_root',
        error: e.message || 'Unknown error'
      })
    }

    // Mail
    try {
      const sub = await manager.createSubscription({
        resource: manager.buildOutlookMailResource(),
        changeType: 'created,updated',
        userId,
        accessToken: token
      })
      created.push(sub.id)
    } catch (e: any) {
      errors.push({
        resource: 'outlook_mail',
        error: e.message || 'Unknown error'
      })
    }

    // Calendar
    try {
      const sub = await manager.createSubscription({
        resource: manager.buildOutlookCalendarResource(),
        changeType: 'created,updated,deleted',
        userId,
        accessToken: token
      })
      created.push(sub.id)
    } catch (e: any) {
      errors.push({
        resource: 'outlook_calendar',
        error: e.message || 'Unknown error'
      })
    }

    // Teams selections
    if (selections?.teams) {
      for (const t of selections.teams) {
        if (t.teamId && t.channelId) {
          try {
            const sub = await manager.createSubscription({
              resource: manager.buildTeamsChannelMessagesResource(t.teamId, t.channelId),
              changeType: 'created,updated,deleted',
              userId,
              accessToken: token
            })
            created.push(sub.id)
          } catch (e: any) {
            errors.push({
              resource: `teams_channel_${t.teamId}_${t.channelId}`,
              error: e.message || 'Unknown error'
            })
          }
        }
      }
    }

    // Chats selections
    if (selections?.chats) {
      for (const chat of selections.chats) {
        if (chat.chatId) {
          try {
            const sub = await manager.createSubscription({
              resource: manager.buildChatMessagesResource(chat.chatId),
              changeType: 'created,updated,deleted',
              userId,
              accessToken: token
            })
            created.push(sub.id)
          } catch (e: any) {
            errors.push({
              resource: `chat_${chat.chatId}`,
              error: e.message || 'Unknown error'
            })
          }
        }
      }
    }

    // Schedule self-heal check
    await scheduleSelfHealCheck(userId)

    return NextResponse.json({ 
      success: true, 
      created,
      errors: errors.length > 0 ? errors : undefined,
      subscriptionCount: created.length
    })
  } catch (e: any) {
    console.error('Auto-subscribe error:', e)
    return NextResponse.json({ error: e.message || 'auto-subscribe failed' }, { status: 500 })
  }
}

// Schedule a background job to check subscription health
async function scheduleSelfHealCheck(userId: string): Promise<void> {
  try {
    // Schedule a check in 10 minutes to verify subscriptions are working
    await supabase.from('scheduled_tasks').insert({
      task_type: 'microsoft_subscription_health_check',
      user_id: userId,
      scheduled_for: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      status: 'pending',
      payload: { userId },
      created_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to schedule self-heal check:', error)
  }
}

// Health check endpoint
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 })
    }
    
    // Get all subscriptions for user
    const subs = await manager.getUserSubscriptions(userId)
    
    // Check if any subscriptions are expired or need renewal
    const now = new Date()
    const expiring = subs.filter(sub => {
      const expirationDate = new Date(sub.expirationDateTime)
      // Consider subscriptions expiring in the next 12 hours as needing renewal
      return (expirationDate.getTime() - now.getTime()) < 12 * 60 * 60 * 1000
    })
    
    // Get user token
    const { data: integ } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'microsoft')
      .single()
      
    if (!integ) {
      return NextResponse.json({ 
        status: 'error', 
        error: 'No Microsoft integration found for user',
        activeSubscriptions: subs.length,
        expiringSubscriptions: expiring.length
      })
    }
    
    // Renew any expiring subscriptions
    const renewResults = []
    for (const sub of expiring) {
      try {
        await manager.renewSubscription(sub.id, integ.access_token)
        renewResults.push({ id: sub.id, success: true })
      } catch (e: any) {
        renewResults.push({ id: sub.id, success: false, error: e.message })
      }
    }
    
    return NextResponse.json({
      status: 'ok',
      activeSubscriptions: subs.length,
      expiringSubscriptions: expiring.length,
      renewals: renewResults
    })
  } catch (e: any) {
    return NextResponse.json({ 
      status: 'error', 
      error: e.message || 'Health check failed' 
    }, { status: 500 })
  }
}