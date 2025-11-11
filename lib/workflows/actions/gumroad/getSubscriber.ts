import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Gets details about a specific Gumroad subscriber
 */
export async function getGumroadSubscriber(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gumroad")
    const subscriberId = resolveValue(config.subscriberId, input)

    if (!subscriberId) {
      return {
        success: false,
        message: "Subscriber ID is required"
      }
    }

    const url = `https://api.gumroad.com/v2/subscribers/${encodeURIComponent(subscriberId)}?access_token=${accessToken}`

    logger.debug('[getGumroadSubscriber] Fetching subscriber:', { subscriberId })

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to get subscriber: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()
    const subscriber = result.subscriber

    if (!subscriber) {
      return {
        success: false,
        message: "Subscriber not found"
      }
    }

    return {
      success: true,
      output: {
        id: subscriber.id,
        email: subscriber.email,
        status: subscriber.status,
        productId: subscriber.product_id,
        productName: subscriber.product_name,
        createdAt: subscriber.created_at,
        cancelledAt: subscriber.cancelled_at,
        endedAt: subscriber.ended_at,
        failedAt: subscriber.failed_at,
        freeTrialEndsAt: subscriber.free_trial_ends_at,
        licenseKey: subscriber.license_key,
        subscriptionId: subscriber.subscription_id,
        userId: subscriber.user_id,
        purchaseIds: subscriber.purchase_ids || []
      },
      message: `Successfully retrieved subscriber: ${subscriber.email}`
    }

  } catch (error: any) {
    logger.error("Gumroad get subscriber error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while retrieving subscriber"
    }
  }
}
