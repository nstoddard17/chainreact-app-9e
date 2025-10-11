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

// Helper function to extract task name from what might be a longer description
function extractTaskName(taskText: string): string {
  // If it's already a short name (less than 50 chars), return as is
  if (taskText.length < 50) {
    return taskText
  }

  // Common patterns for task names:
  // 1. If it starts with something like "Design User Flow for Onboarding", take the first line or sentence
  // 2. If it has a colon or dash, take the part before it
  // 3. Otherwise, take the first 50 characters and add ellipsis

  // Check for line breaks and take the first line
  if (taskText.includes('\n')) {
    const firstLine = taskText.split('\n')[0].trim()
    if (firstLine.length > 0 && firstLine.length < 100) {
      return firstLine
    }
  }

  // Check for colon or dash separators
  if (taskText.includes(':')) {
    const beforeColon = taskText.split(':')[0].trim()
    if (beforeColon.length > 0 && beforeColon.length < 100) {
      return beforeColon
    }
  }

  if (taskText.includes(' - ')) {
    const beforeDash = taskText.split(' - ')[0].trim()
    if (beforeDash.length > 0 && beforeDash.length < 100) {
      return beforeDash
    }
  }

  // Check for sentence end (period followed by space)
  const firstSentence = taskText.match(/^[^.!?]+[.!?]/)
  if (firstSentence && firstSentence[0].length < 100) {
    return firstSentence[0].trim()
  }

  // If still too long, take first 50 characters and add ellipsis
  return `${taskText.substring(0, 50).trim() }...`
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
          // First try to find a "Task Name" field
          let taskNameField = Object.keys(record.fields).find(key =>
            key.toLowerCase() === 'task name' || key.toLowerCase() === 'taskname' || key === 'Name'
          )

          // If no Task Name field, find any field that includes "task"
          if (!taskNameField) {
            taskNameField = Object.keys(record.fields).find(key =>
              key.toLowerCase().includes('task')
            )
          }

          if (taskNameField) {
            console.log(`📊 [Airtable Tasks] Found matching field '${taskNameField}'`)
            const taskField = record.fields[taskNameField]

            // Tasks might be an array or a string
            if (Array.isArray(taskField)) {
              console.log(`📊 [Airtable Tasks] Field is array:`, taskField)
              taskField.forEach(task => {
                if (task && typeof task === 'string') {
                  // If it looks like a full description (contains sentence-like text), try to extract just the name
                  const extractedName = extractTaskName(task)
                  tasks.add(extractedName)
                }
              })
            } else if (taskField && typeof taskField === 'string') {
              // If it looks like a full description, try to extract just the name
              const extractedName = extractTaskName(taskField)
              tasks.add(extractedName)
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