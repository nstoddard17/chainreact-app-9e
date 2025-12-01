import { ExecutionContext } from '@/types/workflow';
import { ActionResult } from '@/lib/workflows/actions';

import { logger } from '@/lib/utils/logger'

/**
 * Execute Notion update database schema action
 * Add, modify, or remove properties from a Notion database
 */
export async function executeNotionUpdateDatabaseSchema(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const { operation } = config;

  // Create ExecutionContext
  const context: ExecutionContext = {
    userId,
    workflowId: input.workflowId || '',
    executionId: input.executionId || '',
    testMode: input.testMode || false,
    dataFlowManager: {
      resolveVariable: (value: string) => {
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
    } as any
  };

  try {
    switch (operation) {
      case 'add_property': {
        const { notionAddDatabaseProperty } = await import('./handlers');

        // Parse select options if provided
        let selectOptions = null;
        if (config.selectOptions) {
          try {
            selectOptions = typeof config.selectOptions === 'string'
              ? JSON.parse(config.selectOptions)
              : config.selectOptions;
          } catch (error) {
            return {
              success: false,
              output: {},
              message: 'Invalid select options JSON: ' + (error as Error).message
            };
          }
        }

        const addConfig = {
          database_id: config.database,
          property_name: config.propertyName,
          property_type: config.propertyType,
          select_options: selectOptions
        };

        const result = await notionAddDatabaseProperty(addConfig, context);

        return {
          success: result.success,
          output: result.output,
          message: result.message
        };
      }

      case 'remove_property': {
        const { notionRemoveDatabaseProperty } = await import('./handlers');

        const removeConfig = {
          database_id: config.database,
          property_name: config.propertyName
        };

        const result = await notionRemoveDatabaseProperty(removeConfig, context);

        return {
          success: result.success,
          output: result.output,
          message: result.message
        };
      }

      default:
        return {
          success: false,
          output: {},
          message: `Unknown operation: ${operation}`
        };
    }
  } catch (error: any) {
    logger.error('Notion update database schema error:', error);
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update database schema'
    };
  }
}
