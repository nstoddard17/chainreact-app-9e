/**
 * Airtable Projects Handler
 * Fetches unique associated projects from a table
 */

import { AirtableIntegration, AirtableDataHandler, AirtableHandlerOptions } from '../types'
import { validateAirtableIntegration, validateAirtableToken, makeAirtableApiRequest, parseAirtableApiResponse, buildAirtableApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

interface ProjectOption {
  value: string
  label: string
}

export const getAirtableProjects: AirtableDataHandler<ProjectOption> = async (
  integration: AirtableIntegration,
  options: AirtableHandlerOptions = {}
): Promise<ProjectOption[]> => {
  const { baseId, tableName } = options

  logger.debug("🔍 Airtable projects fetcher called with:", {
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

    logger.debug('🔍 Fetching Airtable projects from API...')

    // Fetch records to extract unique projects
    const queryParams = new URLSearchParams()
    queryParams.append('maxRecords', '100')

    const apiUrl = buildAirtableApiUrl(`/v0/${baseId}/${encodeURIComponent(tableName)}?${queryParams.toString()}`)

    const response = await makeAirtableApiRequest(apiUrl, tokenResult.token!)
    const data = await response.json()

    // Extract unique projects - look for field that contains "project"
    const projects = new Set<string>()

    if (data.records && Array.isArray(data.records)) {
      // Log first record to see field structure
      if (data.records.length > 0) {
        logger.debug('📊 [Airtable Projects] Sample record fields:', Object.keys(data.records[0].fields || {}))
      }

      data.records.forEach((record: any) => {
        if (record.fields) {
          // Find the field that matches "project" pattern
          const fieldName = Object.keys(record.fields).find(key =>
            key.toLowerCase().includes('project')
          )

          if (fieldName) {
            logger.debug(`📊 [Airtable Projects] Found matching field '${fieldName}'`)
            const project = record.fields[fieldName]

            // Handle linked records (array of record IDs)
            if (Array.isArray(project)) {
              logger.debug(`📊 [Airtable Projects] Field is array of linked records:`, project)
              // For linked records, we might get an array of IDs
              // We'll need to fetch the actual names from the linked table
              project.forEach(item => {
                if (typeof item === 'string') {
                  projects.add(item) // Add the record ID for now
                }
              })
            } else if (project && typeof project === 'string') {
              projects.add(project)
            }
          }
        }
      })
    }

    // Convert to options format
    const options = Array.from(projects).map(name => ({
      value: name,
      label: name
    })).sort((a, b) => a.label.localeCompare(b.label))

    logger.debug(`✅ Airtable projects fetched successfully: ${options.length} unique projects`)
    return options

  } catch (error: any) {
    logger.error("Error fetching Airtable projects:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Airtable authentication expired. Please reconnect your account.')
    }

    throw new Error(error.message || "Error fetching Airtable projects")
  }
}