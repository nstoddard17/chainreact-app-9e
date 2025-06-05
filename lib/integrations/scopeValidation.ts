import { db } from "@/lib/db"
import { INTEGRATION_SCOPES, validateScopes, getAllScopes } from "./integrationScopes"
import { getOAuthRedirectUri } from "@/lib/oauth/utils"

export interface ScopeValidationResult {
  provider: string
  valid: boolean
  missing: string[]
  granted: string[]
  status: "valid" | "invalid" | "partial"
  lastChecked: string
}

export async function validateIntegrationScopes(
  userId: string,
  provider: string,
  grantedScopes: string[],
): Promise<ScopeValidationResult> {
  const validation = validateScopes(provider, grantedScopes)

  // Update the integration record with validation results
  try {
    await db
      .from("integrations")
      .update({
        granted_scopes: grantedScopes,
        missing_scopes: validation.missing,
        scope_validation_status: validation.status,
        last_scope_check: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("provider", provider)
  } catch (error) {
    console.error("Failed to update integration scope validation:", error)
  }

  return {
    provider,
    valid: validation.valid,
    missing: validation.missing,
    granted: validation.granted,
    status: validation.status,
    lastChecked: new Date().toISOString(),
  }
}

export async function validateAllUserIntegrations(userId: string): Promise<ScopeValidationResult[]> {
  const { data: integrations } = await db
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "connected")

  if (!integrations) return []

  const results: ScopeValidationResult[] = []

  for (const integration of integrations) {
    if (!integration.granted_scopes) continue

    const result = await validateIntegrationScopes(userId, integration.provider, integration.granted_scopes)
    results.push(result)
  }

  return results
}

export function generateReconnectionUrl(provider: string, state?: string): string {
  const config = INTEGRATION_SCOPES[provider]
  if (!config) {
    throw new Error(`Unsupported provider: ${provider}`)
  }

  const allScopes = getAllScopes(provider)
  const redirectUri = getOAuthRedirectUri(provider)

  switch (provider) {
    case "slack":
      const slackParams = new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_SLACK_CLIENT_ID!,
        scope: allScopes.join(","),
        redirect_uri: redirectUri,
        response_type: "code",
        ...(state && { state }),
      })
      return `https://slack.com/oauth/v2/authorize?${slackParams.toString()}`

    case "google":
      const googleParams = new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        scope: allScopes.join(" "),
        redirect_uri: redirectUri,
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        ...(state && { state }),
      })
      return `https://accounts.google.com/o/oauth2/v2/auth?${googleParams.toString()}`

    case "discord":
      const discordParams = new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
        scope: allScopes.join(" "),
        redirect_uri: redirectUri,
        response_type: "code",
        ...(state && { state }),
      })
      return `https://discord.com/api/oauth2/authorize?${discordParams.toString()}`

    case "github":
      const githubParams = new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
        scope: allScopes.join(" "),
        redirect_uri: redirectUri,
        ...(state && { state }),
      })
      return `https://github.com/login/oauth/authorize?${githubParams.toString()}`

    case "dropbox":
      const dropboxParams = new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID!,
        scope: allScopes.join(" "),
        redirect_uri: redirectUri,
        response_type: "code",
        token_access_type: "offline",
        ...(state && { state }),
      })
      return `https://www.dropbox.com/oauth2/authorize?${dropboxParams.toString()}`

    default:
      throw new Error(`Reconnection URL generation not implemented for provider: ${provider}`)
  }
}

export async function checkIntegrationHealth(
  userId: string,
  provider: string,
): Promise<{
  connected: boolean
  scopesValid: boolean
  lastChecked: string
  issues: string[]
}> {
  try {
    const { data: integration } = await db
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single()

    if (!integration) {
      return {
        connected: false,
        scopesValid: false,
        lastChecked: new Date().toISOString(),
        issues: ["Integration not found"],
      }
    }

    const issues: string[] = []

    // Check if token exists
    if (!integration.access_token) {
      issues.push("Access token missing")
    }

    // Check if token is expired
    if (integration.expires_at && integration.expires_at < Date.now() / 1000) {
      issues.push("Access token expired")
    }

    // Check scope validation
    const scopesValid = integration.scope_validation_status === "valid"
    if (!scopesValid) {
      issues.push("Missing required permissions")
    }

    return {
      connected: integration.is_active && issues.length === 0,
      scopesValid,
      lastChecked: integration.last_scope_check || integration.updated_at,
      issues,
    }
  } catch (error) {
    console.error("Failed to check integration health:", error)
    return {
      connected: false,
      scopesValid: false,
      lastChecked: new Date().toISOString(),
      issues: ["Health check failed"],
    }
  }
}

/**
 * Validates the scopes for an integration and updates the database accordingly
 *
 * @param integrationId The ID of the integration to validate
 * @param grantedScopes Array of scopes granted by the OAuth provider
 * @returns Object containing validation results
 */
export async function validateAndUpdateIntegrationScopes(
  integrationId: string,
  grantedScopes: string[],
): Promise<{
  valid: boolean
  missing: string[]
  granted: string[]
  status: "valid" | "invalid" | "partial"
  integration: any
}> {
  // Get the integration
  const { data: integration, error } = await db.from("integrations").select("*").eq("id", integrationId).single()

  if (error || !integration) {
    throw new Error(`Integration not found: ${error?.message || "Unknown error"}`)
  }

  const provider = integration.provider

  // Validate the scopes
  const validationResult = validateScopes(provider, grantedScopes)

  // Update the integration with validation results
  await db
    .from("integrations")
    .update({
      granted_scopes: grantedScopes,
      missing_scopes: validationResult.missing,
      scope_validation_status: validationResult.status,
      last_scope_check: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", integrationId)

  return {
    ...validationResult,
    integration: {
      ...integration,
      granted_scopes: grantedScopes,
      missing_scopes: validationResult.missing,
      scope_validation_status: validationResult.status,
    },
  }
}

/**
 * Validates all integrations for a user
 *
 * @param userId The user ID to validate integrations for
 * @returns Array of validation results
 */
export async function validateAllIntegrations(userId: string): Promise<any[]> {
  // Get all connected integrations for the user
  const { data: integrations, error } = await db
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "connected")

  if (error || !integrations) {
    throw new Error(`Failed to fetch integrations: ${error?.message || "Unknown error"}`)
  }

  const results = []

  // Validate each integration
  for (const integration of integrations) {
    const grantedScopes = integration.granted_scopes || []
    const provider = integration.provider

    const validationResult = validateScopes(provider, grantedScopes)

    // Update the integration with validation results
    await db
      .from("integrations")
      .update({
        missing_scopes: validationResult.missing,
        scope_validation_status: validationResult.status,
        last_scope_check: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id)

    results.push({
      integrationId: integration.id,
      provider,
      ...validationResult,
    })
  }

  return results
}
