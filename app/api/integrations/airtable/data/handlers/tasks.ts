/**
 * Airtable Tasks Handler
 * Fetches unique tasks from a table
 */

import { AirtableIntegration, AirtableDataHandler, AirtableHandlerOptions } from '../types'
import { validateAirtableIntegration, validateAirtableToken, makeAirtableApiRequest, parseAirtableApiResponse, buildAirtableApiUrl } from '../utils'

interface TaskOption {
  value: string
  label: string
}

export const getAirtableTasks: AirtableDataHandler<TaskOption> = async (
  integration: AirtableIntegration,
  options: AirtableHandlerOptions = {}
): Promise<TaskOption[]> => {
  const { baseId, tableName } = options

  console.log("🔍 Airtable tasks fetcher called with:", {
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
      console.log(`❌ Airtable token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }

    if (!baseId || !tableName) {
      console.log('⚠️ Base ID or Table name missing, returning empty list')
      return []
    }

    console.log('🔍 Fetching Airtable tasks from API...')

    // Fetch records to extract unique tasks
    const queryParams = new URLSearchParams()
    queryParams.append('maxRecords', '100')

    const apiUrl = buildAirtableApiUrl(`/v0/${baseId}/${encodeURIComponent(tableName)}?${queryParams.toString()}`)

    const response = await makeAirtableApiRequest(apiUrl, tokenResult.token!)
    const data = await response.json()

    // Extract unique tasks - look for field that contains "task"
    const tasks = new Set<string>()

    if (data.records && Array.isArray(data.records)) {
      // Log first record to see field structure
      if (data.records.length > 0) {
        console.log('📊 [Airtable Tasks] Sample record fields:', Object.keys(data.records[0].fields || {}))
      }

      data.records.forEach((record: any) => {
        if (record.fields) {
          // Find the field that matches "task" pattern
          const fieldName = Object.keys(record.fields).find(key =>
            key.toLowerCase().includes('task')
          )

          if (fieldName) {
            console.log(`📊 [Airtable Tasks] Found matching field '${fieldName}'`)
            const taskField = record.fields[fieldName]
            // Tasks might be an array or a string
            if (Array.isArray(taskField)) {
              console.log(`📊 [Airtable Tasks] Field is array:`, taskField)
              taskField.forEach(task => {
                if (task && typeof task === 'string') {
                  tasks.add(task)
                }
              })
            } else if (taskField && typeof taskField === 'string') {
              tasks.add(taskField)
            }
          }
        }
      })
    }

    // Convert to options format
    const options = Array.from(tasks).map(task => ({
      value: task,
      label: task
    })).sort((a, b) => a.label.localeCompare(b.label))

    console.log(`✅ Airtable tasks fetched successfully: ${options.length} unique tasks`)
    return options

  } catch (error: any) {
    console.error("Error fetching Airtable tasks:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Airtable authentication expired. Please reconnect your account.')
    }

    throw new Error(error.message || "Error fetching Airtable tasks")
  }
}