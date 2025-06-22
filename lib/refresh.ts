import { db } from "@/lib/db"
import { Integration } from "@/types/integration"
import { TokenRefreshService, RefreshResult } from "@/lib/integrations/tokenRefreshService"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"

interface ExtendedRefreshResult extends RefreshResult {
  message?: string;
}

/**
 * Checks if a token needs refreshing and refreshes it if needed
 */
export async function refreshTokenIfNeeded(integration: Integration): Promise<ExtendedRefreshResult> {
  // Skip if there's no refresh token
  if (!integration.refresh_token) {
    return {
      success: true,
      message: "No refresh token available",
    }
  }

  // Check if the token needs refreshing
  const needsRefresh = TokenRefreshService.shouldRefreshToken(integration, {
    accessTokenExpiryThreshold: 30, // 30 minutes for access tokens
    refreshTokenExpiryThreshold: 60, // 60 minutes for refresh tokens
  })

  if (!needsRefresh.shouldRefresh) {
    return {
      success: true,
      message: needsRefresh.reason,
    }
  }

  // Token needs refreshing
  try {
    // Get the encryption key
    const encryptionKey = await getSecret("encryption_key") || process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      throw new Error("Missing encryption key")
    }

    // Decrypt the refresh token
    const decryptedRefreshToken = decrypt(integration.refresh_token, encryptionKey)

    // Call the new token refresh service
    const result = await TokenRefreshService.refreshTokenForProvider(
      integration.provider,
      decryptedRefreshToken,
      integration
    )

    if (result.success && result.accessToken) {
      // Update the token in the database
      const updateData: any = {
        access_token: result.accessToken,
        last_token_refresh: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: "active",
        consecutive_failures: 0,
        disconnect_reason: null,
      }

      // Calculate and set the access token expiration
      if (result.accessTokenExpiresIn) {
        const expiryDate = new Date()
        expiryDate.setSeconds(expiryDate.getSeconds() + result.accessTokenExpiresIn)
        updateData.expires_at = expiryDate.toISOString()
      }

      // If we got a new refresh token, encrypt and store it
      if (result.refreshToken) {
        const { encrypt } = await import("@/lib/security/encryption")
        updateData.refresh_token = encrypt(result.refreshToken, encryptionKey)

        // If there's a refresh token expiration provided, calculate and set it
        if (result.refreshTokenExpiresIn) {
          const refreshExpiryDate = new Date()
          refreshExpiryDate.setSeconds(refreshExpiryDate.getSeconds() + result.refreshTokenExpiresIn)
          updateData.refresh_token_expires_at = refreshExpiryDate.toISOString()
        }
      }

      // Update the integration in the database
      await db.from("integrations").update(updateData).eq("id", integration.id)
    } else if (result.error) {
      // Handle error - if the token refresh failed, mark the integration accordingly
      const status = result.invalidRefreshToken || result.needsReauthorization
        ? "needs_reauthorization"
        : "error"

      await db
        .from("integrations")
        .update({
          status,
          consecutive_failures: (integration.consecutive_failures || 0) + 1,
          disconnect_reason: result.error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id)

      // Create a notification for the user if the integration needs reauthorization
      if (status === "needs_reauthorization") {
        try {
          await db.rpc("create_token_expiry_notification", {
            p_user_id: integration.user_id,
            p_provider: integration.provider,
          })
        } catch (notifError) {
          console.error(`Failed to create notification for ${integration.provider}:`, notifError)
        }
      }
    }

    return result
  } catch (error) {
    console.error(`Error refreshing token for ${integration.provider}:`, error)
    return {
      success: false,
      error: `Failed to refresh token: ${(error as Error).message}`,
    }
  }
}

// Re-export the token refresh service for convenience
export const { 
  refreshTokenForProvider, 
  getTokensNeedingRefresh, 
  getTokensWithRefreshErrors,
  refreshTokens,
  shouldRefreshToken
} = TokenRefreshService

export type { RefreshResult }
