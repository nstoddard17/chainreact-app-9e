import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  const baseUrl = getBaseUrl()
  const provider = 'stripe'

  if (error) {
    logger.error(`Error with Stripe OAuth: ${error} - ${errorDescription}`)
    return createPopupResponse('error', provider, errorDescription || `OAuth Error: ${error}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for Stripe OAuth.', baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      throw new Error('Missing userId in Stripe state')
    }

    const supabase = createAdminClient()

    const clientSecret = process.env.STRIPE_SECRET_KEY
    if (!clientSecret) {
      throw new Error('Stripe secret key not configured')
    }

    const tokenResponse = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(`Stripe token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenResponse.json()

    // Upsert the integration details
    const integrationData = {
      user_id: userId,
      provider: provider,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      status: 'connected',
      metadata: {
        stripe_publishable_key: tokenData.stripe_publishable_key,
        stripe_user_id: tokenData.stripe_user_id,
        livemode: tokenData.livemode,
      },
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from('integrations').upsert(integrationData, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      throw new Error(`Failed to save Stripe integration: ${upsertError.message}`)
    }

    return createPopupResponse('success', provider, 'You can now close this window.', baseUrl)
  } catch (e: any) {
    logger.error('Stripe callback error:', e)
    return createPopupResponse(
      'error',
      provider,
      e.message || 'An unexpected error occurred.',
      baseUrl,
    )
  }
}
