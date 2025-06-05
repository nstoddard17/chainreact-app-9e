/**
 * Get the correct base URL for OAuth redirects based on environment
 */
export function getOAuthBaseUrl(): string {
  // In production, always use the production domain
  if (process.env.NODE_ENV === "production") {
    return "https://chainreact.app"
  }

  // For development, check if we have a custom URL set
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  // Default to localhost for development
  return "http://localhost:3000"
}

/**
 * Generate a consistent redirect URI for OAuth providers
 */
export function getOAuthRedirectUri(provider: string): string {
  const baseUrl = getOAuthBaseUrl()
  return `${baseUrl}/api/integrations/${provider}/callback`
}

/**
 * Upsert integration data to avoid duplicate key constraint violations
 */
export async function upsertIntegration(supabase: any, integrationData: any) {
  try {
    // First, try to find existing integration
    const { data: existingIntegration, error: findError } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", integrationData.user_id)
      .eq("provider", integrationData.provider)
      .single()

    if (findError && findError.code !== "PGRST116") {
      // PGRST116 is "not found" error, which is expected if no integration exists
      throw findError
    }

    if (existingIntegration) {
      // Update existing integration
      const { data, error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingIntegration.id)
        .select()
        .single()

      if (error) throw error
      return data
    } else {
      // Insert new integration
      const { data, error } = await supabase
        .from("integrations")
        .insert({
          ...integrationData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error
      return data
    }
  } catch (error: any) {
    console.error("Error upserting integration:", error)
    throw error
  }
}

/**
 * Generate OAuth state with consistent structure
 */
export function generateOAuthState(
  provider: string,
  options: {
    reconnect?: boolean
    integrationId?: string
    requireFullScopes?: boolean
  } = {},
): string {
  const state = {
    provider,
    timestamp: Date.now(),
    reconnect: options.reconnect || false,
    integrationId: options.integrationId,
    requireFullScopes: options.requireFullScopes || true,
  }

  return btoa(JSON.stringify(state))
}

/**
 * Parse OAuth state safely
 */
export function parseOAuthState(state: string): any {
  try {
    return JSON.parse(atob(state))
  } catch (error) {
    throw new Error("Invalid OAuth state parameter")
  }
}
