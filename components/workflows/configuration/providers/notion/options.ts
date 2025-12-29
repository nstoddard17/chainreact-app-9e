import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types'

import { logger } from '@/lib/utils/logger'

export const notionOptionsLoader: ProviderOptionsLoader = {
  canHandle(fieldName: string, providerId: string): boolean {
    // Handle all Notion provider fields
    return providerId === 'notion'
  },
  
  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, dependsOnValue, extraOptions, formValues } = params

    logger.debug('🔵 [Notion Options] loadOptions called:', {
      fieldName,
      integrationId,
      dependsOnValue,
      formValuesKeys: formValues ? Object.keys(formValues) : [],
      formValuesDatabase: formValues?.database,
      formValuesDatabaseId: formValues?.databaseId,
      extraOptions
    })

    try {
      // Map field names to Notion API data types
      const fieldToDataTypeMap: Record<string, string> = {
        'workspace': 'workspaces',
        'database': 'databases',
        'databaseId': 'databases', // Added for notion_action_create_page
        'parentDatabase': 'databases',
        'page': 'pages',
        'pageId': 'pages', // Added for consistency
        'parentPage': 'pages',
        'page_id': 'pages',
        'databaseProperties': 'properties',
        'databaseFields': 'database_fields',
        'pageFields': 'page_blocks',
        'after': 'blocks',
        'block_id': 'blocks',
        'user_id': 'users',
        'userId': 'users',
        'template': 'templates',
        'filter': 'filter_types',
        'database_id': 'databases',
        'source_database_id': 'databases',
        'target_database_id': 'databases',
        'parent_id': 'blocks',
        'source_page_id': 'pages',
        'destination_page_id': 'pages',
        'destinationPage': 'pages',
        'destination_database_id': 'databases',
        'databaseRows': 'database_rows',
        // New database action fields
        'searchProperty': 'properties',
        'createProperties': 'properties',
        'itemToArchive': 'database_items',
        'itemToRestore': 'archived_items',
        'sortProperty': 'properties',
      }

      const dataType = fieldToDataTypeMap[fieldName] || fieldName
      
      // Build request body from query params
      const requestBody: any = {
        integrationId,
        dataType,
        options: {}
      }
      
      // Add workspace filter if present
      if (dependsOnValue && (fieldName === 'page_id' || fieldName === 'database_id' || fieldName === 'user_id' ||
          fieldName === 'source_page_id' || fieldName === 'destination_page_id' || fieldName === 'destination_database_id' ||
          fieldName === 'parentDatabase' || fieldName === 'parentPage' || fieldName === 'page' || fieldName === 'database' ||
          fieldName === 'userId' || fieldName === 'destinationPage')) {
        requestBody.options.workspaceId = dependsOnValue
      }
      
      const databaseBoundFields = new Set([
        'databaseProperties',
        'databaseFields',
        'databaseRows',
        'searchProperty',
        'createProperties',
        'itemToArchive',
        'itemToRestore',
        'sortProperty'
      ])

      if (databaseBoundFields.has(fieldName)) {
        if (dependsOnValue) {
          requestBody.options.databaseId = dependsOnValue
        } else if (formValues?.database) {
          // Fall back to currently selected database value if dependency wasn't passed along
          requestBody.options.databaseId = formValues.database
        } else if (formValues?.databaseId) {
          requestBody.options.databaseId = formValues.databaseId
        }

        if (formValues?.workspace) {
          requestBody.options.workspaceId = formValues.workspace
        }
      } else if (fieldName === 'pageFields') {
        // pageFields depends on page - get from dependsOnValue or fall back to formValues.page
        if (dependsOnValue) {
          requestBody.options.pageId = dependsOnValue
        } else if (formValues?.page) {
          requestBody.options.pageId = formValues.page
        }
        if (formValues?.workspace) {
          requestBody.options.workspaceId = formValues.workspace
        }
      } else if (fieldName === 'after' && dependsOnValue) {
        requestBody.options.pageId = dependsOnValue
        if (formValues?.workspace) {
          requestBody.options.workspaceId = formValues.workspace
        }
      } else if (fieldName === 'block_id' && dependsOnValue) {
        requestBody.options.pageId = dependsOnValue
        if (formValues?.workspace) {
          requestBody.options.workspaceId = formValues.workspace
        }
      }
      
      // Add extra options
      if (extraOptions) {
        requestBody.options = { ...requestBody.options, ...extraOptions }
      }
      
      const requiresDatabaseId = databaseBoundFields.has(fieldName)
      if (requiresDatabaseId && !requestBody.options.databaseId) {
        logger.debug('⚠️ [Notion Options] Skipping Notion request - missing databaseId', {
          fieldName,
          dataType,
          integrationId,
          dependsOnValue,
          formValuesDatabase: formValues?.database,
          formValuesDatabaseId: formValues?.databaseId,
          formValuesKeys: formValues ? Object.keys(formValues) : []
        })
        return []
      }

      // pageFields requires pageId
      if (fieldName === 'pageFields' && !requestBody.options.pageId) {
        logger.debug('⚠️ [Notion Options] Skipping Notion request - missing pageId', {
          fieldName,
          dataType,
          integrationId,
          dependsOnValue,
          formValuesPage: formValues?.page,
          formValuesKeys: formValues ? Object.keys(formValues) : []
        })
        return []
      }

      logger.debug('📤 [Notion Options] Making API request:', {
        fieldName,
        dataType,
        requestBody,
        options: requestBody.options
      })

      const response = await fetch('/api/integrations/notion/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        // Try to get error details from response
        let errorMessage = response.statusText
        let errorDetails = null
        try {
          const errorBody = await response.json()
          errorMessage = errorBody.error || errorMessage
          errorDetails = errorBody
        } catch (e) {
          // Response might not be JSON
        }

        logger.error('Failed to fetch Notion options:', {
          status: response.status,
          statusText: response.statusText,
          errorMessage,
          errorDetails,
          requestBody,
          fieldName,
          dataType
        })

        // Throw with more detailed error message
        throw new Error(errorMessage || response.statusText)
      }
      
      const result = await response.json()
      const data = result.data || result
      
      logger.debug('🔍 [Notion Options] Raw response for', dataType, ':', result)
      logger.debug('🔍 [Notion Options] Extracted data:', data)
      
      // Format the response based on data type
      switch (dataType) {
        case 'workspaces':
          const workspaceData = Array.isArray(data) ? data : (data.workspaces || data)
          logger.debug('🔍 [Notion Options] Workspace data before mapping:', workspaceData)
          
          const mappedWorkspaces = workspaceData?.map((workspace: any) => {
            // The workspace already has label from the handler, use it directly
            const option = {
              value: workspace.value || workspace.id,
              label: workspace.label || workspace.name || 'Unnamed Workspace'
            }
            logger.debug('🔍 [Notion Options] Mapped workspace:', option)
            return option
          }) || []
          
          logger.debug('🔍 [Notion Options] Final workspace options:', mappedWorkspaces)
          return mappedWorkspaces
          
        case 'databases':
          const databaseData = Array.isArray(data) ? data : (data.databases || data)
          return databaseData?.map((db: any) => ({
            value: db.value || db.id,
            label: db.label || db.name || db.title?.[0]?.plain_text || db.title || 'Unnamed Database'
          })) || []
          
        case 'pages':
          const pageData = Array.isArray(data) ? data : (data.pages || data)
          return pageData?.map((page: any) => ({
            value: page.value || page.id,
            label: page.label || page.title || 
                   page.properties?.title?.title?.[0]?.plain_text || 
                   page.properties?.Name?.title?.[0]?.plain_text || 
                   'Unnamed Page'
          })) || []
          
        case 'properties':
          return (Array.isArray(data) ? data : data.properties)?.map((prop: any) => ({
            value: prop.id,
            label: prop.name
          })) || []

        case 'database_fields':
          // Database fields returns the actual field definitions with current values
          // This is used for dynamic_fields type
          return Array.isArray(data) ? data : []

        case 'page_blocks':
          // Page blocks returns the page properties and content blocks for dynamic_fields
          // This is used for the pageFields dynamic_fields type
          return Array.isArray(data) ? data : []

        case 'database_rows':
          // Database rows returns all pages/entries in the database with their properties
          // This is used for the databaseRows dynamic_fields type
          return Array.isArray(data) ? data : []

        case 'blocks':
          return (Array.isArray(data) ? data : data.blocks)?.map((block: any) => ({
            value: block.id,
            label: `${block.type} block`
          })) || []
          
        case 'users':
          return (Array.isArray(data) ? data : data.users)?.map((user: any) => ({
            value: user.id,
            label: user.name || user.email || 'Unknown User'
          })) || []
          
        case 'templates':
          return (Array.isArray(data) ? data : data.templates)?.map((template: any) => ({
            value: template.id,
            label: template.name
          })) || []
          
        case 'database_templates':
          return [
            { value: 'Project Tracker', label: 'Project Tracker' },
            { value: 'CRM', label: 'CRM' },
            { value: 'Content Calendar', label: 'Content Calendar' },
            { value: 'Task Management', label: 'Task Management' },
            { value: 'Bug Tracker', label: 'Bug Tracker' },
            { value: 'Feature Requests', label: 'Feature Requests' },
            { value: 'Customer Support', label: 'Customer Support' },
            { value: 'Sales Pipeline', label: 'Sales Pipeline' },
            { value: 'Marketing Campaigns', label: 'Marketing Campaigns' },
            { value: 'Event Planning', label: 'Event Planning' },
            { value: 'Product Roadmap', label: 'Product Roadmap' },
            { value: 'Team Directory', label: 'Team Directory' },
            { value: 'Knowledge Base', label: 'Knowledge Base' },
            { value: 'Inventory Management', label: 'Inventory Management' },
            { value: 'Expense Tracker', label: 'Expense Tracker' },
            { value: 'Time Tracking', label: 'Time Tracking' },
            { value: 'Meeting Notes', label: 'Meeting Notes' },
            { value: 'Research Database', label: 'Research Database' },
            { value: 'Learning Management', label: 'Learning Management' }
          ]
          
        case 'filter_types':
          return [
            { value: 'page', label: 'Pages' },
            { value: 'database', label: 'Databases' }
          ]
          
        default:
          return []
      }
    } catch (error) {
      logger.error('Error loading Notion options:', error)
      return []
    }
  },
  
  getFieldDependencies(fieldName: string): string[] {
    // Define field dependencies
    const dependencies: Record<string, string[]> = {
      'database': ['workspace'],
      'database_id': ['workspace'],
      'page_id': ['workspace'],
      'page': ['workspace'],
      'user_id': ['workspace'],
      'source_page_id': ['workspace'],
      'destination_page_id': ['workspace'],
      'destination_database_id': ['workspace'],
      'after': ['page_id'],
      'block_id': ['page_id'],
      'databaseProperties': ['database'],
      'databaseFields': ['database'],
      'databaseRows': ['database'],
      'pageFields': ['page'],
      'itemToArchive': ['database'],
      'itemToRestore': ['database'],
      'sortProperty': ['database'],
      'searchProperty': ['database'],
      'createProperties': ['database'],
    }

    return dependencies[fieldName] || []
  }
}
