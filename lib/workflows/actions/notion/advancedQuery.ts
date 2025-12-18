import { ExecutionContext } from '@/types/workflow';
import { ActionResult } from '@/lib/workflows/actions';

import { logger } from '@/lib/utils/logger'

/**
 * Execute Notion advanced database query action
 * Handles complex JSON filters, sorting, and pagination
 */
export async function executeNotionAdvancedQuery(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
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
    const { notionAdvancedDatabaseQuery } = await import('./handlers');

    // Parse JSON fields
    let filter = null;
    if (config.filterMode === 'json' && config.filterJson) {
      try {
        filter = typeof config.filterJson === 'string'
          ? JSON.parse(config.filterJson)
          : config.filterJson;
      } catch (error) {
        return {
          success: false,
          output: {},
          message: 'Invalid filter JSON: ' + (error as Error).message
        };
      }
    }

    // Build sorts array from user-friendly fields
    let sorts = null;
    if (config.sortProperty) {
      sorts = [
        {
          property: config.sortProperty,
          direction: config.sortDirection || 'descending'
        }
      ];
    }

    const queryConfig = {
      database_id: config.database,
      filter,
      sorts,
      page_size: config.pageSize || 100
    };

    logger.info('[Notion Advanced Query] Executing with config:', {
      database_id: config.database,
      sortProperty: config.sortProperty,
      sortDirection: config.sortDirection,
      hasSorts: !!sorts,
      sorts: sorts,
      hasFilter: !!filter,
      pageSize: config.pageSize
    });

    const result = await notionAdvancedDatabaseQuery(queryConfig, context);

    return {
      success: result.success,
      output: result.output,
      message: result.message
    };
  } catch (error: any) {
    logger.error('Notion advanced query error:', error);
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to execute advanced query'
    };
  }
}
