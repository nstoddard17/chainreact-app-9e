import { ExecutionContext } from '@/types/workflow';
import { ActionResult } from '@/lib/workflows/actions';

import { logger } from '@/lib/utils/logger'

/**
 * Internal function to execute Notion Manage Database action
 */
async function executeNotionManageDatabaseInternal(
  context: ExecutionContext,
  config: any
): Promise<any> {
  const { operation } = config;

  // Get the Notion integration credentials using the helper function
  const { getIntegrationCredentials } = await import('@/lib/integrations/getDecryptedAccessToken');
  const credentials = await getIntegrationCredentials(context.userId, 'notion');

  if (!credentials || !credentials.accessToken) {
    throw new Error('Notion integration not found or not connected');
  }

  const baseHeaders = {
    'Authorization': `Bearer ${credentials.accessToken}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  };

  switch (operation) {
    case 'create':
      // Validate parentPage is provided
      if (!config.parentPage) {
        throw new Error('Parent page is required to create a database. Please select a page where the database will be created.');
      }

      // Parse custom properties if provided
      let databaseProperties: Record<string, any>
      if (config.properties) {
        try {
          // Import the property converter
          const { convertToNotionProperties, validateProperties } =
            await import('./databasePropertyTypes');

          // Parse properties from JSON
          let propertiesConfig
          if (typeof config.properties === 'string') {
            propertiesConfig = JSON.parse(config.properties)
          } else {
            propertiesConfig = config.properties
          }

          // Validate properties
          const validation = validateProperties(propertiesConfig)
          if (!validation.valid) {
            throw new Error(`Invalid properties: ${validation.errors.join(', ')}`)
          }

          // Convert to Notion format
          databaseProperties = convertToNotionProperties(propertiesConfig)
        } catch (error: any) {
          // If it's already a validation error, don't add extra message
          if (error.message.includes('Invalid properties:')) {
            throw error
          }
          // Otherwise it's a parsing error
          throw new Error(`Failed to parse properties: ${error.message}`)
        }
      } else {
        // Use default properties (just Name field)
        databaseProperties = {
          Name: {
            title: {}
          }
        }
      }

      // Create a new database
      // The difference between "Full page" and "Inline" databases:
      // - Full page: is_inline = false (default) - appears as a standalone page in the sidebar
      // - Inline: is_inline = true - embedded directly within the parent page content
      const createBody: any = {
        parent: {
          type: 'page_id',
          page_id: config.parentPage
        },
        title: [
          {
            type: 'text',
            text: {
              content: config.title || 'Untitled Database'
            }
          }
        ],
        properties: databaseProperties
      };

      // Set is_inline based on database type
      // "Inline" databases are embedded in the parent page
      // "Full page" databases appear as standalone pages (is_inline = false or omitted)
      if (config.databaseType === 'Inline') {
        createBody.is_inline = true;
      }

      const createResponse = await fetch('https://api.notion.com/v1/databases', {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify(createBody)
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(`Failed to create database: ${error.message || createResponse.statusText}`);
      }

      return await createResponse.json();

    case 'update':
      // Update database metadata
      const updateBody: any = {};

      if (config.title) {
        updateBody.title = [
          {
            type: 'text',
            text: {
              content: config.title
            }
          }
        ];
      }

      if (config.description) {
        updateBody.description = [
          {
            type: 'text',
            text: {
              content: config.description
            }
          }
        ];
      }

      const updateResponse = await fetch(`https://api.notion.com/v1/databases/${config.database}`, {
        method: 'PATCH',
        headers: baseHeaders,
        body: JSON.stringify(updateBody)
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.json();
        throw new Error(`Failed to update database: ${error.message || updateResponse.statusText}`);
      }

      return await updateResponse.json();

    case 'sync':
      // Sync database entries (simplified version)
      // This would need more complex implementation based on sync direction
      throw new Error('Database sync operation not yet implemented');

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

/**
 * Export wrapper function for action registry
 * Converts from standard action handler signature to ExecutionContext signature
 */
export async function executeNotionManageDatabase(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Create ExecutionContext from standard inputs
    const context: ExecutionContext = {
      userId,
      workflowId: input.workflowId || '',
      executionId: input.executionId || '',
      testMode: input.testMode || false,
      dataFlowManager: {
        resolveVariable: (value: string) => {
          // Simple variable resolution for backward compatibility
          if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
            const match = value.match(/\{\{([^}]+)\}\}/);
            if (match) {
              const path = match[1].split('.');
              let result: any = input;
              for (const key of path) {
                result = result?.[key];
              }
              return result !== undefined ? result : value;
            }
          }
          return value;
        },
        getPreviousNodeOutputs: () => input.previousResults || {},
        getNodeOutput: (nodeId: string) => input.previousResults?.[nodeId] || null
      }
    };

    // Execute the internal function
    const result = await executeNotionManageDatabaseInternal(context, config);

    return {
      success: true,
      output: result,
      message: `Successfully executed ${config.operation} operation`
    };
  } catch (error: any) {
    logger.error('Notion Manage Database error:', {
      operation: config.operation,
      errorMessage: error.message,
      errorStack: error.stack,
      config: {
        databaseType: config.databaseType,
        parentPage: config.parentPage,
        title: config.title
      }
    });
    return {
      success: false,
      output: {},
      message: error.message || `Failed to execute ${config.operation} operation`
    };
  }
}