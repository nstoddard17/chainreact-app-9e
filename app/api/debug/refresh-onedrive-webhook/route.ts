import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphClient } from '@/lib/microsoft-graph/client'
import { safeDecrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    logger.debug('\n🔄 REFRESHING ONEDRIVE WEBHOOK SUBSCRIPTION')

    // Get the user's workflow
    const { data: workflows } = await supabase
      .from('workflows')
      .select('id, name, user_id, status')
      .eq('status', 'active')
      .eq('user_id', 'a3e3a51a-175c-4b59-ad03-227ba12a18b0')

    if (!workflows || workflows.length === 0) {
      return NextResponse.json({ error: 'No active workflow found' }, { status: 400 })
    }

    const workflow = workflows[0]
    logger.debug(`Found workflow: ${workflow.name}`)

    // Toggle the workflow off
    await supabase
      .from('workflows')
      .update({ status: 'inactive' })
      .eq('id', workflow.id)

    logger.debug('✅ Workflow deactivated')

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Toggle the workflow back on
    await supabase
      .from('workflows')
      .update({ status: 'active' })
      .eq('id', workflow.id)

    logger.debug('✅ Workflow reactivated - this should trigger webhook re-registration')

    // Check the new subscription
    await new Promise(resolve => setTimeout(resolve, 3000))

    const { data: newSubs } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('id, notification_url, expiration_date_time, created_at')
      .eq('status', 'active')
      .eq('user_id', workflow.user_id)
      .order('created_at', { ascending: false })
      .limit(1)

    const newSub = newSubs?.[0]

    // Test if we can reach Microsoft Graph
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', workflow.user_id)
      .eq('provider', 'onedrive')
      .eq('status', 'connected')
      .single()

    let graphTest = null
    if (integration?.access_token) {
      try {
        const token = safeDecrypt(integration.access_token)
        const client = new MicrosoftGraphClient({ accessToken: token })
        const driveInfo = await client.request('/me/drive')
        graphTest = {
          success: true,
          driveName: driveInfo.name,
          driveType: driveInfo.driveType
        }
      } catch (e: any) {
        graphTest = {
          success: false,
          error: e.message
        }
      }
    }

    return NextResponse.json({
      success: true,
      workflow: workflow.name,
      newSubscription: newSub ? {
        id: newSub.id,
        url: newSub.notification_url,
        expires: newSub.expiration_date_time,
        created: newSub.created_at
      } : null,
      graphApiTest: graphTest,
      message: 'Webhook subscription refreshed. Try making a change in OneDrive now.'
    })

  } catch (error) {
    logger.error('Error refreshing webhook:', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to refresh OneDrive webhook subscription by toggling the workflow'
  })
}