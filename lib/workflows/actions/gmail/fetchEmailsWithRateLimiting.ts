import { logger } from '@/lib/utils/logger'

/**
 * Fetch multiple Gmail messages with rate limiting to avoid API limits
 *
 * Gmail API has strict rate limits - this helper fetches messages in batches
 * with delays between batches to prevent 429 errors.
 *
 * @param accessToken - Gmail OAuth access token
 * @param messageIds - Array of Gmail message IDs to fetch
 * @param formatEmailFn - Function to format each raw message response
 * @param options - Configuration options
 * @returns Array of formatted email objects
 */
export async function fetchEmailsWithRateLimiting(
  accessToken: string,
  messageIds: string[],
  formatEmailFn: (messageData: any) => any,
  options: {
    batchSize?: number
    delayBetweenBatchesMs?: number
    format?: string
    logPrefix?: string
  } = {}
): Promise<any[]> {
  const {
    batchSize = 25,
    delayBetweenBatchesMs = 500,
    format = 'full',
    logPrefix = '[Gmail]'
  } = options

  logger.debug(`${logPrefix} Fetching ${messageIds.length} message(s) in batches of ${batchSize}...`)

  const emails = []

  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batchIds = messageIds.slice(i, i + batchSize)
    const batchNumber = Math.floor(i / batchSize) + 1
    const totalBatches = Math.ceil(messageIds.length / batchSize)

    logger.debug(`${logPrefix} Fetching batch ${batchNumber}/${totalBatches} (${batchIds.length} messages)`)

    // Fetch messages in parallel within each batch
    const batchPromises = batchIds.map(async (messageId) => {
      try {
        const messageResponse = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=${format}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        )

        if (!messageResponse.ok) {
          if (messageResponse.status === 429) {
            logger.warn(`${logPrefix} Rate limit hit for message ${messageId}, skipping`)
          } else {
            logger.warn(`${logPrefix} Failed to fetch message ${messageId}: ${messageResponse.status}`)
          }
          return null
        }

        const messageData = await messageResponse.json()
        return formatEmailFn(messageData)
      } catch (error: any) {
        logger.error(`${logPrefix} Error fetching message ${messageId}:`, error)
        return null
      }
    })

    const batchResults = await Promise.all(batchPromises)
    emails.push(...batchResults.filter((email): email is NonNullable<typeof email> => email !== null))

    logger.debug(`${logPrefix} Batch ${batchNumber}/${totalBatches} complete. Total emails fetched: ${emails.length}/${messageIds.length}`)

    // Add delay between batches to avoid rate limiting (except for the last batch)
    if (i + batchSize < messageIds.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatchesMs))
    }
  }

  const failedCount = messageIds.length - emails.length
  logger.debug(`${logPrefix} Finished fetching all message details: ${emails.length}/${messageIds.length} emails (${failedCount} failed)`)

  return emails
}
