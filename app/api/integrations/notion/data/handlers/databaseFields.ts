/**
 * Notion Database Fields Handler
 * Fetches database properties with their current values for a specific database entry
 */

import { NotionIntegration, NotionDataHandler } from '../types'
import { makeNotionApiRequest, validateNotionIntegration, resolveNotionAccessToken, getNotionRequestOptions } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getNotionDatabaseFields: NotionDataHandler = async (integration: NotionIntegration, context?: any): Promise<any[]> => {
  logger.debug("🔍 Notion database fields fetcher called")
  logger.debug("🔍 Context:", context)

  try {
    validateNotionIntegration(integration)
    const { workspaceId } = getNotionRequestOptions(context)
    const accessToken = resolveNotionAccessToken(integration, workspaceId)

    // Get the database ID from context
    const databaseId = context?.databaseId || context?.database_id
    if (!databaseId) {
      throw new Error("Database ID is required to fetch fields")
    }

    logger.debug(`🔍 Fetching database schema and first entry for database: ${databaseId}`)

    // First, get the database schema to understand all properties
    const databaseResponse = await makeNotionApiRequest(
      `https://api.notion.com/v1/databases/${databaseId}`,
      accessToken,
      {
        method: 'GET'
      }
    )

    if (!databaseResponse.ok) {
      const errorData = await databaseResponse.json().catch(() => ({}))
      logger.error(`❌ Failed to get database schema: ${databaseResponse.status}`, errorData)
      throw new Error(`Failed to get database schema: ${databaseResponse.status}`)
    }

    const database = await databaseResponse.json()
    const properties = database.properties || {}
    const databaseTitle = database.title?.[0]?.plain_text || 'Untitled Database'

    logger.debug(`✅ Database "${databaseTitle}" has ${Object.keys(properties).length} properties`)

    // Now, query the database to get the first entry for current values
    const queryResponse = await makeNotionApiRequest(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      accessToken,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page_size: 1 // Get just the first entry
        })
      }
    )

    let firstEntry = null
    if (queryResponse.ok) {
      const queryData = await queryResponse.json()
      firstEntry = queryData.results?.[0]
      logger.debug(`✅ Found first entry with ${firstEntry ? 'data' : 'no data'}`)
    }

    // Transform properties to field format with current values
    const fields = []

    // Always add the title field first
    fields.push({
      name: 'title',
      label: 'Database Title',
      type: 'text',
      value: databaseTitle,
      required: true,
      placeholder: 'Enter database title',
      description: 'The title of the database',
      isTitle: true
    })

    // Add all database properties
    Object.entries(properties).forEach(([propertyName, propertySchema]: [string, any]) => {
      let fieldType = 'text'
      let currentValue = ''
      let options = []

      // Get current value from first entry if available
      const entryProperty = firstEntry?.properties?.[propertyName]

      // Map Notion property types to form field types and extract values
      switch (propertySchema.type) {
        case 'title':
          fieldType = 'text'
          currentValue = entryProperty?.title?.[0]?.plain_text || ''
          break

        case 'rich_text':
          fieldType = 'textarea'
          currentValue = entryProperty?.rich_text?.[0]?.plain_text || ''
          break

        case 'number':
          fieldType = 'number'
          currentValue = entryProperty?.number?.toString() || ''
          break

        case 'select':
          fieldType = 'select'
          currentValue = entryProperty?.select?.name || ''
          options = propertySchema.select?.options?.map((opt: any) => ({
            value: opt.name,
            label: opt.name,
            color: opt.color
          })) || []
          break

        case 'multi_select':
          fieldType = 'multi_select'
          currentValue = entryProperty?.multi_select?.map((s: any) => s.name).join(', ') || ''
          options = propertySchema.multi_select?.options?.map((opt: any) => ({
            value: opt.name,
            label: opt.name,
            color: opt.color
          })) || []
          break

        case 'date':
          fieldType = 'date'
          currentValue = entryProperty?.date?.start || ''
          break

        case 'checkbox':
          fieldType = 'checkbox'
          currentValue = entryProperty?.checkbox?.toString() || 'false'
          break

        case 'url':
          fieldType = 'url'
          currentValue = entryProperty?.url || ''
          break

        case 'email':
          fieldType = 'email'
          currentValue = entryProperty?.email || ''
          break

        case 'phone_number':
          fieldType = 'tel'
          currentValue = entryProperty?.phone_number || ''
          break

        case 'people':
          fieldType = 'people'
          currentValue = entryProperty?.people?.map((p: any) => p.name || p.email).join(', ') || ''
          break

        case 'relation':
          fieldType = 'relation'
          currentValue = entryProperty?.relation?.map((r: any) => r.id).join(', ') || ''
          break

        case 'formula':
          fieldType = 'text'
          currentValue = '[Formula - Read Only]'
          break

        case 'rollup':
          fieldType = 'text'
          currentValue = '[Rollup - Read Only]'
          break

        default:
          fieldType = 'text'
          currentValue = ''
      }

      const field: any = {
        name: propertyName,
        label: propertyName,
        type: fieldType,
        value: currentValue,
        required: false,
        placeholder: `Enter ${propertyName}`,
        description: `Property type: ${propertySchema.type}`,
        propertyType: propertySchema.type,
        propertyId: propertySchema.id
      }

      // Add options for select fields
      if (options.length > 0) {
        field.options = options
      }

      // Mark formula and rollup fields as read-only
      if (propertySchema.type === 'formula' || propertySchema.type === 'rollup') {
        field.readOnly = true
      }

      fields.push(field)
    })

    logger.debug(`✅ Returning ${fields.length} fields with current values`)

    return fields

  } catch (error: any) {
    logger.error("Error fetching Notion database fields:", error)
    throw new Error(error.message || "Error fetching Notion database fields")
  }
}

