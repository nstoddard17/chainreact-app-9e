/**
 * Debug endpoint to test Microsoft Graph token permissions
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { safeDecrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return errorResponse('userId required' , 400)
    }

    // Get Microsoft integration
    const { data: integrations } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .or('provider.like.microsoft%,provider.eq.onedrive')

    const integration = integrations?.find(i => i.access_token)

    if (!integration) {
      return errorResponse('No Microsoft integration found' , 404)
    }

    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      return errorResponse('Failed to decrypt token' , 500)
    }

    // Test 1: Get user profile (basic test)
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    const profileData = await profilejsonResponse()

    // Test 2: List existing subscriptions (requires permissions to read subscriptions)
    const subscriptionsResponse = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    const subscriptionsData = await subscriptionsjsonResponse()

    // Test 3: Try to create a minimal subscription (this will likely fail with 403)
    const testSubscription = {
      changeType: 'created,updated',
      notificationUrl: 'https://webhook.site/unique-id', // Dummy webhook URL
      resource: '/me/messages',
      expirationDateTime: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
      clientState: 'test-client-state'
    }

    const createResponse = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testSubscription)
    })

    const createData = await createjsonResponse()

    return jsonResponse({
      integration: {
        provider: integration.provider,
        status: integration.status,
        scopes: integration.scopes,
        expiresAt: integration.expires_at,
        tokenLength: accessToken.length
      },
      tests: {
        profile: {
          status: profileResponse.status,
          ok: profileResponse.ok,
          data: profileData
        },
        listSubscriptions: {
          status: subscriptionsResponse.status,
          ok: subscriptionsResponse.ok,
          data: subscriptionsData
        },
        createSubscription: {
          status: createResponse.status,
          ok: createResponse.ok,
          data: createData
        }
      }
    })

  } catch (error: any) {
    logger.error('Error testing token:', error)
    return errorResponse('Internal server error', 500, { details: error.message
     })
  }
}
