import { type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { encrypt } from "@/lib/security/encryption"

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase URL or service role key")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  const baseUrl = getBaseUrl()

  if (error) {
    logger.error(`Airtable OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse(
      "error",
      "airtable",
      errorDescription || "An unknown error occurred.",
      baseUrl,
    )
  }

  if (!code || !state) {
    return createPopupResponse(
      "error",
      "airtable",
      "Authorization code or state parameter is missing.",
      baseUrl,
    )
  }

  try {
    // Fetch the code_verifier from the database
    const { data: pkceData, error: pkceError } = await supabase
      .from("pkce_flow")
      .select("code_verifier, state")
      .eq("state", state)
      .single()

    if (pkceError || !pkceData) {
      throw new Error(`Failed to retrieve PKCE data: ${pkceError?.message || 'Not found'}`)
    }

    const { code_verifier } = pkceData
    const stateData = JSON.parse(atob(pkceData.state))
    const { userId } = stateData

    if (!userId) {
      throw new Error("User ID not found in state")
    }

    const clientId = process.env.AIRTABLE_CLIENT_ID
    if (!clientId) {
      throw new Error("Airtable client ID not configured")
    }

    const clientSecret = process.env.AIRTABLE_CLIENT_SECRET
    if (!clientSecret) {
      throw new Error("Airtable client secret not configured")
    }

    const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`

    const tokenResponse = await fetch("https://airtable.com/oauth2/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": authHeader,
      },
      body: new URLSearchParams({
        code,
        code_verifier,
        grant_type: "authorization_code",
        redirect_uri: `${baseUrl}/api/integrations/airtable/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenjsonResponse()
      logger.error("Airtable token exchange error:", errorData)
      throw new Error(
        `Airtable token exchange failed: ${errorData.error_description || errorData.error.message}`,
      )
    }

    const tokenData = await tokenjsonResponse()

    const expiresIn = tokenData.expires_in // Typically in seconds
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    // Get user info
    const userResponse = await fetch("https://api.airtable.com/v0/meta/whoami", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    if (!userResponse.ok) {
      const errorData = await userjsonResponse()
      logger.error("Airtable whoami error:", errorData)
      throw new Error("Failed to get Airtable user info")
    }
    const userData = await userjsonResponse()

    // Log the scopes we received
    logger.debug('🔐 Airtable OAuth callback - User:', userData.email)
    logger.debug('📋 Scopes from token:', tokenData.scope)
    logger.debug('📋 User scopes from API:', userData.scopes)

    // Verify webhook:manage scope
    const hasWebhookScope = userData.scopes?.includes('webhook:manage') || tokenData.scope?.includes('webhook:manage')
    if (!hasWebhookScope) {
      logger.warn('⚠️ WARNING: webhook:manage scope not present in token!')
    } else {
      logger.debug('✅ webhook:manage scope confirmed')
    }

    // Encrypt tokens before storing
    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      throw new Error('Encryption key not configured')
    }

    const integrationData = {
      user_id: userId,
      provider: "airtable",
      provider_user_id: userData.id,
      access_token: encrypt(tokenData.access_token, encryptionKey),
      refresh_token: tokenData.refresh_token ? encrypt(tokenData.refresh_token, encryptionKey) : null,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      scopes: userData.scopes || tokenData.scope.split(" "), // Use API scopes if available, fallback to token scope
      status: "connected",
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: "user_id, provider",
    })

    if (upsertError) {
      throw new Error(`Failed to save Airtable integration: ${upsertError.message}`)
    }

    // Delete the PKCE record from the database
    const { error: deleteError } = await supabase.from("pkce_flow").delete().eq("state", state)
    if (deleteError) {
      logger.warn(`Failed to delete PKCE data for state: ${state}`, deleteError)
    }

    // Return success response immediately
    const successResponse = createPopupResponse("success", "airtable", "Airtable account connected successfully.", baseUrl)

    // Kick off base sync in background (best-effort) - DON'T await these calls
    setImmediate(() => {
      Promise.all([
        fetch(`${baseUrl}/api/integrations/airtable/sync-bases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        }).catch(e => logger.warn('Failed to sync Airtable bases', e)),
        
        fetch(`${baseUrl}/api/integrations/airtable/register-webhooks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        }).catch(e => logger.warn('Failed to register Airtable webhooks', e))
      ]).catch(e => logger.warn('Background Airtable setup failed', e))
    })

    return successResponse
  } catch (e: any) {
    logger.error("Airtable callback error:", e)
    return createPopupResponse("error", "airtable", e.message || "An unexpected error occurred.", baseUrl)
  }
}
