/**
 * Airtable Feedback Handler
 * Fetches unique feedback values from a table
 */

import { AirtableIntegration, AirtableDataHandler, AirtableHandlerOptions } from '../types'
import { validateAirtableIntegration, validateAirtableToken, makeAirtableApiRequest, parseAirtableApiResponse, buildAirtableApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

interface FeedbackOption {
  value: string
  label: string
}

export const getAirtableFeedback: AirtableDataHandler<FeedbackOption> = async (
  integration: AirtableIntegration,
  options: AirtableHandlerOptions = {}
): Promise<FeedbackOption[]> => {
  const { baseId, tableName } = options

  logger.debug("🔍 Airtable feedback fetcher called with:", {
    integrationId: integration.id,
    baseId,
    tableName,
    hasToken: !!integration.access_token
  })

  try {
    // Validate integration status
    validateAirtableIntegration(integration)

    const tokenResult = await validateAirtableToken(integration)

    if (!tokenResult.success) {
      logger.debug(`❌ Airtable token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }

    if (!baseId || !tableName) {
      logger.debug('⚠️ Base ID or Table name missing, returning empty list')
      return []
    }

    logger.debug('🔍 Fetching Airtable feedback from API...')

    // Fetch records to extract unique feedback
    const queryParams = new URLSearchParams()
    queryParams.append('maxRecords', '100')

    const apiUrl = buildAirtableApiUrl(`/v0/${baseId}/${encodeURIComponent(tableName)}?${queryParams.toString()}`)

    const response = await makeAirtableApiRequest(apiUrl, tokenResult.token!)
    const data = await response.json()

    // Extract unique feedback values - look for field that contains "feedback"
    const feedbackValues = new Set<string>()

    if (data.records && Array.isArray(data.records)) {
      // Log first record to see field structure
      if (data.records.length > 0) {
        logger.debug('📊 [Airtable Feedback] Sample record fields:', Object.keys(data.records[0].fields || {}))
      }

      data.records.forEach((record: any) => {
        if (record.fields) {
          // Find the field that matches "feedback" pattern
          const fieldName = Object.keys(record.fields).find(key =>
            key.toLowerCase().includes('feedback')
          )

          if (fieldName) {
            logger.debug(`📊 [Airtable Feedback] Found matching field '${fieldName}'`)
            const feedback = record.fields[fieldName]

            // Handle linked records (array of record IDs)
            if (Array.isArray(feedback)) {
              logger.debug(`📊 [Airtable Feedback] Field is array of linked records:`, feedback)
              feedback.forEach(item => {
                if (typeof item === 'string') {
                  feedbackValues.add(item) // Add the record ID for now
                }
              })
            } else if (feedback && typeof feedback === 'string') {
              feedbackValues.add(feedback)
            }
          }
        }
      })
    }

    // Convert to options format
    const options = Array.from(feedbackValues).map(value => ({
      value: value,
      label: value
    })).sort((a, b) => a.label.localeCompare(b.label))

    logger.debug(`✅ Airtable feedback fetched successfully: ${options.length} unique values`)
    return options

  } catch (error: any) {
    logger.error("Error fetching Airtable feedback:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Airtable authentication expired. Please reconnect your account.')
    }

    throw new Error(error.message || "Error fetching Airtable feedback")
  }
}