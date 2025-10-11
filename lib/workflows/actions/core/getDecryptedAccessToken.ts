import { TokenRefreshService } from "../../../integrations/tokenRefreshService"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"

/**
 * Gets a decrypted access token for a specific integration provider
 * Handles token refresh if needed
 */
export async function getDecryptedAccessToken(userId: string, provider: string): Promise<string> {
  try {
    // Use service role client for webhook execution context (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    console.log(`🔍 Looking for integration: userId="${userId}", provider="${provider}"`)

    // Map provider variations to database values
    // Google services can have different provider names but use the same OAuth integration
    const providerMapping: Record<string, string[]> = {
      'google': ['google', 'google-calendar', 'google-drive', 'google-sheets', 'google-docs', 'google_calendar', 'gmail', 'youtube'],
      'google-calendar': ['google', 'google-calendar', 'google_calendar', 'gmail'], // Google Calendar can use Google or Gmail OAuth
      'google-drive': ['google', 'google-drive', 'google_drive'],
      'google-sheets': ['google', 'google-sheets', 'google_sheets'],
      'google-docs': ['google', 'google-docs', 'google_docs'],
      'gmail': ['gmail', 'google'],
      'microsoft-outlook': ['microsoft-outlook', 'outlook'],
      'microsoft-teams': ['microsoft-teams', 'teams'],
      'microsoft-onenote': ['microsoft-onenote', 'onenote']
    };

    // Get possible provider values for this provider
    const possibleProviders = providerMapping[provider] || [provider];

    console.log(`🔍 Searching for integration with providers: ${possibleProviders.join(', ')}`);

    // First, let's see what integrations exist for this user
    const { data: allUserIntegrations, error: allError } = await supabase
      .from("integrations")
      .select("id, provider, status")
      .eq("user_id", userId)

    console.log(`📋 All integrations for user ${userId}:`, allUserIntegrations)

    // Get the user's integration - try all possible provider values
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .in("provider", possibleProviders)

    if (error) {
      console.error(`Database error fetching integration for ${provider}:`, error)
      throw new Error(`Database error: ${error.message}`)
    }

    // Take the first valid integration (prefer connected/active status)
    const integration = integrations?.sort((a, b) => {
      // Prioritize connected/active integrations
      if (a.status === 'connected' || a.status === 'active') return -1;
      if (b.status === 'connected' || b.status === 'active') return 1;
      return 0;
    })?.[0];

    if (!integration) {
      console.error(`No integration found. Searched providers: ${possibleProviders.join(', ')}`)
      console.error(`Available integrations for user:`, allUserIntegrations)
      throw new Error(`No integration found for ${provider}. Available integrations: ${allUserIntegrations?.map(i => i.provider).join(', ') || 'none'}`)
    }

    console.log(`✅ Found integration for ${provider} with actual provider: ${integration.provider}`)

    // Check if token needs refresh
    const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
      accessTokenExpiryThreshold: 5 // Refresh if expiring within 5 minutes
    })

    let accessToken = integration.access_token

    if (shouldRefresh.shouldRefresh && integration.refresh_token) {
      console.log(`Refreshing token for ${provider}: ${shouldRefresh.reason}`)
      
      const refreshResult = await TokenRefreshService.refreshTokenForProvider(
        integration.provider,
        integration.refresh_token,
        integration
      )

      if (refreshResult.success && refreshResult.accessToken) {
        accessToken = refreshResult.accessToken
        console.log(`Token refresh successful for ${provider}`)
      } else {
        console.error(`Token refresh failed for ${provider}:`, refreshResult.error)
        throw new Error(`Failed to refresh ${provider} token: ${refreshResult.error}`)
      }
    }

    if (!accessToken) {
      throw new Error(`No valid access token for ${provider}`)
    }

    const secret = await getSecret("encryption_key")
    if (!secret) {
      console.error("Encryption key not found in environment")
      throw new Error("Encryption secret not configured. Please set ENCRYPTION_KEY environment variable.")
    }

    console.log(`Attempting to decrypt access token for ${provider}`)
    // SECURITY: Never log token values, previews, or metadata
    console.log(`Token format check:`, {
      hasColon: accessToken.includes(':'),
      isEncrypted: accessToken.includes(':')
    })

    // If the token doesn't have the expected format, it's stored as plain text
    if (!accessToken.includes(':')) {
      console.log(`Token for ${provider} is stored as plain text, returning as-is`)
      return accessToken
    }
    
    // Only attempt decryption if the token appears to be encrypted
    try {
      const decryptedToken = decrypt(accessToken, secret)
      console.log(`Successfully decrypted access token for ${provider}`)
      return decryptedToken
    } catch (decryptError: any) {
      console.error(`Decryption failed for ${provider}:`, {
        error: decryptError.message,
        tokenFormat: 'encrypted'
      })
      
      throw new Error(`Failed to decrypt ${provider} access token: ${decryptError.message}`)
    }
  } catch (error: any) {
    console.error(`Error in getDecryptedAccessToken for ${provider}:`, {
      message: error.message,
      stack: error.stack,
      userId,
      provider
    })
    throw error
  }
} 