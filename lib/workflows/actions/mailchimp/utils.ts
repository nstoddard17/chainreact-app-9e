import { createClient } from "@supabase/supabase-js"
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'

import { logger } from '@/lib/utils/logger'

/**
 * Get Mailchimp access token and data center for API calls
 * Mailchimp stores the DC separately in metadata, not in the token
 */
export async function getMailchimpAuth(userId: string): Promise<{ accessToken: string; dc: string }> {
  // Get the decrypted access token
  const accessToken = await getDecryptedAccessToken(userId, "mailchimp")

  // Fetch the integration to get the metadata with DC
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: integration, error } = await supabase
    .from("integrations")
    .select("metadata")
    .eq("user_id", userId)
    .eq("provider", "mailchimp")
    .single()

  if (error || !integration) {
    logger.error('Failed to fetch Mailchimp integration metadata:', error)
    throw new Error('Failed to fetch Mailchimp integration metadata')
  }

  const metadata = integration.metadata as any
  const dc = metadata?.dc

  if (!dc) {
    logger.error('Mailchimp integration missing data center (dc) in metadata')
    throw new Error('Mailchimp integration is missing data center information. Please reconnect your Mailchimp account.')
  }

  logger.debug('Retrieved Mailchimp auth', {
    hasToken: !!accessToken,
    dc
  })

  return { accessToken, dc }
}
