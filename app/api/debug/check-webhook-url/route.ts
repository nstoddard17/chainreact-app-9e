import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // Get the webhook URL that would be used
    const baseUrl = getWebhookBaseUrl()
    const microsoftWebhookUrl = `${baseUrl}/api/webhooks/microsoft`

    // Get current subscriptions to see their registered URLs
    const { data: subscriptions } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('id, notification_url, status, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(3)

    // Check environment variables
    const envVars = {
      NEXT_PUBLIC_WEBHOOK_HTTPS_URL: process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL || 'NOT SET',
      NEXT_PUBLIC_WEBHOOK_BASE_URL: process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL || 'NOT SET',
      PUBLIC_WEBHOOK_BASE_URL: process.env.PUBLIC_WEBHOOK_BASE_URL || 'NOT SET',
      NODE_ENV: process.env.NODE_ENV
    }

    // Compare URLs
    const analysis = subscriptions?.map(sub => ({
      subscriptionId: `${sub.id.substring(0, 8) }...`,
      registeredUrl: sub.notification_url,
      currentUrl: microsoftWebhookUrl,
      urlsMatch: sub.notification_url === microsoftWebhookUrl,
      createdAt: sub.created_at
    }))

    const needsReRegistration = analysis?.some(a => !a.urlsMatch) || false

    return NextResponse.json({
      currentWebhookUrl: microsoftWebhookUrl,
      envVars,
      subscriptions: analysis,
      needsReRegistration,
      recommendation: needsReRegistration
        ? 'URLs do not match! You need to re-register webhooks. Toggle your workflow off and on to re-register with the new URL.'
        : 'URLs match - webhooks should be working. Check if ngrok is running and forwarding to port 3000.'
    })

  } catch (error) {
    console.error('Error checking webhook URL:', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}