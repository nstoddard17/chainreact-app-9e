import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Lists all subscribers for a Gumroad product
 */
export async function listGumroadSubscribers(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gumroad")
    const productId = resolveValue(config.productId, input)
    const email = resolveValue(config.email, input)

    if (!productId) {
      return {
        success: false,
        message: "Product ID is required"
      }
    }

    // Build query parameters
    const params = new URLSearchParams({
      access_token: accessToken,
      product_id: productId
    })

    if (email) {
      params.append('email', email)
    }

    const url = `https://api.gumroad.com/v2/products/${encodeURIComponent(productId)}/subscribers?${params.toString()}`

    logger.debug('[listGumroadSubscribers] Fetching subscribers:', {
      productId,
      email
    })

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to list subscribers: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()
    const subscribers = result.subscribers || []

    // Transform subscribers to match output schema
    const transformedSubscribers = subscribers.map((subscriber: any) => ({
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
      subscriptionId: subscriber.subscription_id
    }))

    return {
      success: true,
      output: {
        subscribers: transformedSubscribers,
        count: transformedSubscribers.length
      },
      message: `Successfully retrieved ${transformedSubscribers.length} subscriber${transformedSubscribers.length === 1 ? '' : 's'}`
    }

  } catch (error: any) {
    logger.error("Gumroad list subscribers error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while listing subscribers"
    }
  }
}
