import { createClient } from "@supabase/supabase-js"
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'

import { logger } from '@/lib/utils/logger'

/**
 * Get Mailchimp access token and data center for API calls
 * Mailchimp stores the DC separately in metadata, not in the token
 * If DC is missing, will attempt to fetch it from Mailchimp metadata endpoint
 */
export async function getMailchimpAuth(userId: string): Promise<{ accessToken: string; dc: string }> {
  // Get the decrypted access token
  const accessToken = await getDecryptedAccessToken(userId, "mailchimp")

  // Fetch the integration to get the metadata with DC
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const { data: integration, error } = await supabase
    .from("integrations")
    .select("id, metadata")
    .eq("user_id", userId)
    .eq("provider", "mailchimp")
    .single()

  if (error || !integration) {
    logger.error('Failed to fetch Mailchimp integration metadata:', error)
    throw new Error('Failed to fetch Mailchimp integration metadata')
  }

  const metadata = integration.metadata as any
  let dc = metadata?.dc

  // If DC is missing, fetch it from Mailchimp metadata endpoint and update the integration
  if (!dc) {
    logger.info('Mailchimp DC missing, fetching from metadata endpoint...')

    try {
      const metadataResponse = await fetch("https://login.mailchimp.com/oauth2/metadata", {
        headers: {
          Authorization: `OAuth ${accessToken}`,
        },
      })

      if (metadataResponse.ok) {
        const metadataData = await metadataResponse.json()
        dc = metadataData.dc

        if (dc) {
          logger.info('Successfully fetched Mailchimp DC, updating integration metadata', { dc })

          // Update the integration with the DC
          const updatedMetadata = {
            ...metadata,
            dc: dc,
            accountname: metadataData.accountname,
            api_endpoint: metadataData.api_endpoint,
            login_url: metadataData.login?.login_url,
          }

          await supabase
            .from("integrations")
            .update({ metadata: updatedMetadata })
            .eq("id", integration.id)
        }
      } else {
        const errorText = await metadataResponse.text()
        logger.error('Failed to fetch Mailchimp metadata:', { status: metadataResponse.status, error: errorText })
      }
    } catch (fetchError: any) {
      logger.error('Error fetching Mailchimp metadata:', { error: fetchError.message })
    }
  }

  if (!dc) {
    logger.error('Mailchimp integration missing data center (dc) in metadata and could not fetch it')
    throw new Error('Mailchimp integration is missing data center information. Please reconnect your Mailchimp account.')
  }

  logger.debug('Retrieved Mailchimp auth', {
    hasToken: !!accessToken,
    dc
  })

  return { accessToken, dc }
}
