import type { NextRequest } from "next/server"
import { db } from "@/lib/db"

/** Integration data model */
interface Integration {
  id: string
  user_id: string
  provider: string
  access_token: string | null
  refresh_token: string | null
  expires_at: string | number | null
  status: string
  consecutive_failures?: number
}

/** Output of refresh logic */
interface RefreshResult {
  success: boolean
  refreshed: boolean
  message: string
  newToken?: string
  newExpiry?: number
  newRefreshToken?: string
  requiresReconnect?: boolean
}

/**
 * Attempt refresh if needed
 */
export async function refreshTokenIfNeeded(integration: Integration): Promise<RefreshResult> {
  console.log(`🔍 refreshTokenIfNeeded for provider: ${integration.provider}`)

  if (!integration.refresh_token) {
    console.log(`❌ No refresh token for ${integration.provider}`)
    return { refreshed: false, success: true, message: 'No refresh token available' }
  }

  console.log(`✅ Found refresh_token for ${integration.provider}`)

  const googleMs = [
    "google","youtube","gmail","google-calendar",
    "google-docs","google-drive","google-sheets",
    "teams","onedrive"
  ].includes(integration.provider)

  const threshold = googleMs ? 1800 : 300
  if (integration.expires_at) {
    const ts = typeof integration.expires_at === "string"
      ? Math.floor(new Date(integration.expires_at).getTime() / 1000)
      : integration.expires_at
    const expiresIn = ts - Math.floor(Date.now() / 1000)
    console.log(`⏰ ${integration.provider} expires in ${expiresIn}s (threshold ${threshold}s)`)
    if (expiresIn > threshold && !googleMs) {
      return { refreshed: false, success: true, message: `Token valid for ${Math.floor(expiresIn/60)} min` }
    }
  }

  console.log(`🔄 Needs refresh: ${integration.provider}`)
  const result = await refreshTokenByProvider(integration.provider, integration.refresh_token)

  console.log(`📋 refreshTokenByProvider result for ${integration.provider}:`, result)

  if (result.success && result.newToken) {
    const update: any = {
      access_token: result.newToken,
      last_token_refresh: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (googleMs) {
      const future = Math.floor(Date.now() / 1000) + 365 * 24 * 3600
      update.expires_at = new Date(future * 1000).toISOString()
    } else if (result.newExpiry) {
      update.expires_at = new Date(result.newExpiry * 1000).toISOString()
    }
    if (result.newRefreshToken) update.refresh_token = result.newRefreshToken

    console.log(`💾 Updating DB for ${integration.provider}`, update)
    await db.from("integrations").update(update).eq("id", integration.id)
  }

  if (result.requiresReconnect) {
    console.log(`🔌 ${integration.provider} needs reconnect`)
    await db.from("integrations").update({
      status: "disconnected",
      disconnected_at: new Date().toISOString(),
      disconnect_reason: result.message,
      updated_at: new Date().toISOString()
    }).eq("id", integration.id)

    try {
      await db.rpc("create_token_expiry_notification", {
        p_user_id: integration.user_id,
        p_provider: integration.provider
      })
      console.log(`📧 Notification created for ${integration.provider}`)
    } catch (err) {
      console.error(`❌ Notification failed for ${integration.provider}:`, err)
    }
  }

  return result
}

/**
 * Provider dispatch
 */
export async function refreshTokenByProvider(
  provider: string,
  refresh_token: string
): Promise<RefreshResult> {
  console.log(`🔧 refreshTokenByProvider: ${provider}`)
  switch (provider) {
    case "hubspot":
      return refreshHubSpotToken(refresh_token)
    default:
      console.log(`❌ No implementation for ${provider}`)
      return {
        refreshed: false,
        success: false,
        message: `Refresh not implemented for ${provider}`
      }
  }
}

/**
 * HubSpot-specific refresh logic
 */
async function refreshHubSpotToken(refreshToken: string): Promise<RefreshResult> {
  console.log(`🚀 Starting HubSpot refresh`)

  const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.log(`❌ Missing HubSpot credentials`)
    return {
      success: false,
      refreshed: false,
      message: "Missing HubSpot credentials"
    }
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  let resp: Response
  try {
    console.log(`📤 Fetching HubSpot token endpoint`)
    resp = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      signal: controller.signal
    })
    clearTimeout(timeout)
  } catch (err: any) {
    console.error(`💥 HubSpot fetch error:`, err)
    return {
      success: false,
      refreshed: false,
      message: err.name === 'AbortError'
        ? 'HubSpot request timeout'
        : `Fetch error: ${err.message}`
    }
  }

  let data: any
  try {
    data = await resp.json()
  } catch (err: any) {
    console.error(`💥 JSON parse error:`, err)
    return {
      success: false,
      refreshed: false,
      message: `JSON parse error: ${err.message}`
    }
  }

  console.log(`📥 HubSpot response:`, resp.status, data)

  if (!resp.ok) {
    if (data.error === "invalid_grant") {
      return {
        success: false,
        refreshed: false,
        message: "Token expired – reconnect needed",
        requiresReconnect: true
      }
    }
    return {
      success: false,
      refreshed: false,
      message: data.error || data.message || `HTTP ${resp.status}`
    }
  }

  console.log(`✅ HubSpot refresh successful`)
  return {
    success: true,
    refreshed: true,
    message: "HubSpot refreshed",
    newToken: data.access_token,
    newExpiry: Math.floor(Date.now()/1000) + (data.expires_in || 21600),
    newRefreshToken: data.refresh_token
  }
}
