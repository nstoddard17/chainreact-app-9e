/**
 * Notion Database Rows Handler
 * Fetches all rows/pages from a database with their properties for editing
 */

import { NotionIntegration, NotionDataHandler } from '../types'
import { makeNotionApiRequest } from '../utils'
import { createAdminClient } from "@/lib/supabase/admin"

import { logger } from '@/lib/utils/logger'

export const getNotionDatabaseRows: NotionDataHandler = async (integration: any, context?: any): Promise<any[]> => {
  logger.debug("🔍 Notion database rows fetcher called")
  logger.debug("🔍 Context:", context)

  try {
    // Import decrypt function
    const { decrypt } = await import("@/lib/security/encryption")
    const encryptionKey = process.env.ENCRYPTION_KEY!

    // Get the Notion integration
    const supabase = createAdminClient()
    let notionIntegration
    let integrationError

    if (integration.id) {
      logger.debug(`🔍 Looking up integration by ID: ${integration.id}`)
      const result = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integration.id)
        .single()
      notionIntegration = result.data
      integrationError = result.error
    } else if (integration.userId) {
      logger.debug(`🔍 Looking up Notion integration for user: ${integration.userId}`)
      const result = await supabase
        .from('integrations')
        .select('*')
        .eq('user_id', integration.userId)
        .eq('provider', 'notion')
        .eq('status', 'connected')
        .single()
      notionIntegration = result.data
      integrationError = result.error
    } else {
      throw new Error("No integration ID or user ID provided")
    }

    if (integrationError || !notionIntegration) {
      logger.error('🔍 Integration lookup failed:', integrationError)
      throw new Error("Notion integration not found")
    }

    logger.debug(`🔍 Found integration: ${notionIntegration.id}`)

    // Decrypt the access token
    const decryptedToken = await decrypt(notionIntegration.access_token, encryptionKey)

    // Get the database ID from context
    const databaseId = context?.databaseId || context?.database_id
    if (!databaseId) {
      throw new Error("Database ID is required to fetch rows")
    }

    logger.debug(`🔍 Fetching database schema for database: ${databaseId}`)

    // First, get the database schema to understand all properties
    const databaseResponse = await makeNotionApiRequest(
      `https://api.notion.com/v1/databases/${databaseId}`,
      decryptedToken,
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

    // Query the database to get all rows (pages)
    const queryResponse = await makeNotionApiRequest(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      decryptedToken,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page_size: 100 // Fetch up to 100 rows
        })
      }
    )

    if (!queryResponse.ok) {
      const errorData = await queryResponse.json().catch(() => ({}))
      logger.error(`❌ Failed to query database: ${queryResponse.status}`, errorData)
      throw new Error(`Failed to query database: ${queryResponse.status}`)
    }

    const queryData = await queryResponse.json()
    const rows = queryData.results || []

    logger.debug(`✅ Found ${rows.length} rows in database`)

    // Transform each row into a field group for editing
    const rowFields = rows.map((row: any, index: number) => {
      // Extract the title for display
      const titleProp = Object.entries(row.properties).find(([_, prop]: [string, any]) => prop.type === 'title')
      const rowTitle = titleProp ? (titleProp[1] as any).title?.[0]?.plain_text || `Row ${index + 1}` : `Row ${index + 1}`

      // Build fields for each property
      const fields: any[] = []

      Object.entries(properties).forEach(([propertyName, propertySchema]: [string, any]) => {
        const rowProperty = row.properties[propertyName]
        let fieldType = 'text'
        let currentValue: any = ''
        let options: any[] = []

        // Map Notion property types to form field types and extract values
        switch (propertySchema.type) {
          case 'title':
            fieldType = 'text'
            currentValue = rowProperty?.title?.[0]?.plain_text || ''
            break

          case 'rich_text':
            fieldType = 'textarea'
            currentValue = rowProperty?.rich_text?.map((rt: any) => rt.plain_text).join('') || ''
            break

          case 'number':
            fieldType = 'number'
            currentValue = rowProperty?.number ?? ''
            break

          case 'select':
            fieldType = 'select'
            currentValue = rowProperty?.select?.name || ''
            options = propertySchema.select?.options?.map((opt: any) => ({
              value: opt.name,
              label: opt.name,
              color: opt.color
            })) || []
            break

          case 'multi_select':
            fieldType = 'multi-select'
            currentValue = rowProperty?.multi_select?.map((s: any) => s.name) || []
            options = propertySchema.multi_select?.options?.map((opt: any) => ({
              value: opt.name,
              label: opt.name,
              color: opt.color
            })) || []
            break

          case 'date':
            fieldType = 'date'
            currentValue = rowProperty?.date?.start || ''
            break

          case 'checkbox':
            fieldType = 'checkbox'
            currentValue = rowProperty?.checkbox || false
            break

          case 'url':
            fieldType = 'url'
            currentValue = rowProperty?.url || ''
            break

          case 'email':
            fieldType = 'email'
            currentValue = rowProperty?.email || ''
            break

          case 'phone_number':
            fieldType = 'tel'
            currentValue = rowProperty?.phone_number || ''
            break

          case 'people':
            fieldType = 'people'
            currentValue = rowProperty?.people?.map((p: any) => ({ id: p.id, name: p.name || p.email })) || []
            break

          case 'files':
            fieldType = 'files'
            currentValue = rowProperty?.files?.map((f: any) => ({ name: f.name, url: f.file?.url || f.external?.url })) || []
            break

          case 'relation':
            fieldType = 'relation'
            currentValue = rowProperty?.relation?.map((r: any) => r.id) || []
            break

          case 'formula':
            fieldType = 'text'
            // Formula fields are read-only, show the computed value
            if (rowProperty?.formula?.type === 'string') {
              currentValue = rowProperty.formula.string || ''
            } else if (rowProperty?.formula?.type === 'number') {
              currentValue = rowProperty.formula.number?.toString() || ''
            } else if (rowProperty?.formula?.type === 'boolean') {
              currentValue = rowProperty.formula.boolean?.toString() || ''
            } else if (rowProperty?.formula?.type === 'date') {
              currentValue = rowProperty.formula.date?.start || ''
            }
            break

          case 'rollup':
            fieldType = 'text'
            // Rollup fields are read-only
            if (rowProperty?.rollup?.type === 'number') {
              currentValue = rowProperty.rollup.number?.toString() || ''
            } else if (rowProperty?.rollup?.type === 'date') {
              currentValue = rowProperty.rollup.date?.start || ''
            } else if (rowProperty?.rollup?.type === 'array') {
              currentValue = `[${rowProperty.rollup.array?.length || 0} items]`
            }
            break

          case 'created_time':
          case 'last_edited_time':
            fieldType = 'text'
            currentValue = rowProperty?.[propertySchema.type] || ''
            break

          case 'created_by':
          case 'last_edited_by':
            fieldType = 'text'
            currentValue = rowProperty?.[propertySchema.type]?.name || rowProperty?.[propertySchema.type]?.email || ''
            break

          default:
            fieldType = 'text'
            currentValue = JSON.stringify(rowProperty) || ''
        }

        const field: any = {
          name: propertyName,
          label: propertyName,
          type: fieldType,
          value: currentValue,
          required: propertySchema.type === 'title',
          placeholder: `Enter ${propertyName}`,
          description: `Property type: ${propertySchema.type}`,
          propertyType: propertySchema.type,
          propertyId: propertySchema.id
        }

        // Add options for select fields
        if (options.length > 0) {
          field.options = options
        }

        // Mark read-only fields
        if (['formula', 'rollup', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by'].includes(propertySchema.type)) {
          field.readOnly = true
        }

        fields.push(field)
      })

      return {
        id: row.id, // Page ID for updates/deletes
        title: rowTitle,
        fields,
        url: row.url,
        created_time: row.created_time,
        last_edited_time: row.last_edited_time,
        archived: row.archived || false
      }
    })

    logger.debug(`✅ Returning ${rowFields.length} rows with their properties`)

    return rowFields

  } catch (error: any) {
    logger.error("Error fetching Notion database rows:", error)
    throw new Error(error.message || "Error fetching Notion database rows")
  }
}
