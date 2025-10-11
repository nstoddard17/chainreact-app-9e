import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // Get all Microsoft Graph subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('*')
      .eq('status', 'active') // Only show active subscriptions
      .order('created_at', { ascending: false })

    if (subError) {
      return NextResponse.json({ error: subError }, { status: 500 })
    }

    // Get all OneDrive integrations
    const { data: integrations, error: intError } = await supabase
      .from('integrations')
      .select('id, user_id, metadata, status')
      .eq('provider', 'onedrive')
      .eq('status', 'connected')

    if (intError) {
      return NextResponse.json({ error: intError }, { status: 500 })
    }

    // Map subscriptions to their users
    const subscriptionDetails = subscriptions?.map(sub => {
      // Find matching integration
      const matchingIntegration = integrations?.find(int => {
        let metadata = int.metadata || {}
        if (typeof metadata === 'string') {
          try { metadata = JSON.parse(metadata) } catch { metadata = {} }
        }
        return metadata.subscriptionId === sub.id
      })

      return {
        subscriptionId: sub.id,
        subscriptionUserId: sub.user_id,
        integrationUserId: matchingIntegration?.user_id,
        userIdMatch: sub.user_id === matchingIntegration?.user_id,
        resource: sub.resource,
        status: sub.status,
        createdAt: sub.created_at,
        expirationDateTime: sub.expiration_date_time
      }
    })

    // Get workflows with OneDrive triggers
    const { data: workflows, error: wfError } = await supabase
      .from('workflows')
      .select('id, name, user_id, status, nodes')
      .eq('status', 'active')

    if (wfError) {
      return NextResponse.json({ error: wfError }, { status: 500 })
    }

    const onedriveWorkflows = workflows?.filter(w => {
      try {
        const nodes = JSON.parse(w.nodes || '[]')
        return nodes.some((n: any) =>
          n?.data?.type?.includes('onedrive') ||
          n?.data?.providerId === 'onedrive'
        )
      } catch {
        return false
      }
    }).map(w => ({
      id: w.id,
      name: w.name,
      userId: w.user_id,
      status: w.status
    }))

    return NextResponse.json({
      subscriptions: subscriptionDetails,
      onedriveWorkflows,
      summary: {
        totalSubscriptions: subscriptions?.length || 0,
        totalIntegrations: integrations?.length || 0,
        totalWorkflows: onedriveWorkflows?.length || 0,
        userIds: {
          fromSubscriptions: [...new Set(subscriptions?.map(s => s.user_id).filter(Boolean))],
          fromIntegrations: [...new Set(integrations?.map(i => i.user_id).filter(Boolean))],
          fromWorkflows: [...new Set(onedriveWorkflows?.map(w => w.userId).filter(Boolean))]
        }
      }
    })

  } catch (error) {
    console.error('Error in debug endpoint:', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}