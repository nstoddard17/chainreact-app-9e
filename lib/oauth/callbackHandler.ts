import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function saveIntegrationToDatabase(integrationData: any): Promise<string> {
  try {
    console.log("Saving integration to database:", {
      provider: integrationData.provider,
      userId: integrationData.user_id,
      hasAccessToken: !!integrationData.access_token,
      hasRefreshToken: !!integrationData.refresh_token,
      scope: integrationData.scope,
    })

    // Check if integration already exists
    const { data: existingIntegration, error: findError } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", integrationData.user_id)
      .eq("provider", integrationData.provider)
      .maybeSingle()

    if (findError) {
      console.error("Error checking for existing integration:", findError)
      throw new Error(`Database error: ${findError.message}`)
    }

    let integrationId: string

    if (existingIntegration) {
      console.log("Updating existing integration:", existingIntegration.id)

      // Update existing integration
      const { error: updateError } = await supabase
        .from("integrations")
        .update({
          provider_account_id: integrationData.provider_account_id,
          access_token: integrationData.access_token,
          refresh_token: integrationData.refresh_token,
          expires_at: integrationData.expires_at,
          token_type: integrationData.token_type,
          scope: integrationData.scope,
          metadata: integrationData.metadata,
          is_active: integrationData.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingIntegration.id)

      if (updateError) {
        console.error("Error updating integration:", updateError)
        throw new Error(`Failed to update integration: ${updateError.message}`)
      }

      integrationId = existingIntegration.id
    } else {
      console.log("Creating new integration")

      // Create new integration
      const now = new Date().toISOString()
      const { data: newIntegration, error: insertError } = await supabase
        .from("integrations")
        .insert({
          ...integrationData,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single()

      if (insertError) {
        console.error("Error inserting integration:", insertError)
        throw new Error(`Failed to create integration: ${insertError.message}`)
      }

      if (!newIntegration) {
        throw new Error("Failed to create integration: No data returned")
      }

      integrationId = newIntegration.id
    }

    console.log("Integration saved successfully with ID:", integrationId)
    return integrationId
  } catch (error) {
    console.error("Error in saveIntegrationToDatabase:", error)
    throw error
  }
}

export function generateSuccessRedirect(provider: string): string {
  return `${getBaseUrl()}/integrations?success=${provider}_connected&provider=${provider}`
}

export async function handleOAuthCallback(
  provider: string,
  code: string,
  state: string,
  userId?: string,
): Promise<{ success: boolean; redirectUrl: string; error?: string }> {
  try {
    console.log(`Handling OAuth callback for ${provider}`)

    // Import the appropriate OAuth service dynamically
    let oauthService
    try {
      const module = await import(`@/lib/oauth/${provider}`)
      oauthService = module.default || module
    } catch (importError) {
      console.error(`Failed to import OAuth service for ${provider}:`, importError)
      throw new Error(`OAuth service not found for provider: ${provider}`)
    }

    // Exchange code for tokens
    const tokenData = await oauthService.exchangeCodeForTokens(code, state)

    if (!tokenData.access_token) {
      throw new Error("No access token received from OAuth provider")
    }

    // Get user info from the provider
    const userInfo = await oauthService.getUserInfo(tokenData.access_token)

    // Prepare integration data
    const integrationData = {
      user_id: userId || userInfo.id, // Use provided userId or fallback to provider user ID
      provider: provider,
      provider_account_id: userInfo.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at ? new Date(tokenData.expires_at * 1000).toISOString() : null,
      token_type: tokenData.token_type || "Bearer",
      scope: tokenData.scope,
      metadata: {
        user_info: userInfo,
        connected_at: new Date().toISOString(),
      },
      is_active: true,
    }

    // Save to database
    const integrationId = await saveIntegrationToDatabase(integrationData)

    return {
      success: true,
      redirectUrl: generateSuccessRedirect(provider),
    }
  } catch (error: any) {
    console.error(`OAuth callback error for ${provider}:`, error)

    const errorMessage = error.message || "Unknown OAuth error"
    const redirectUrl = `${getBaseUrl()}/integrations?error=${encodeURIComponent(errorMessage)}&provider=${provider}`

    return {
      success: false,
      redirectUrl,
      error: errorMessage,
    }
  }
}
