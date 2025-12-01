import { ExecutionContext } from '@/types/workflow';
import { ActionResult } from '@/lib/workflows/actions';

import { logger } from '@/lib/utils/logger'

/**
 * Execute Notion get page property action
 * Retrieves a specific property value from a Notion page
 */
export async function executeNotionGetPageProperty(
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
    const { notionGetPageProperty } = await import('./handlers');

    const propertyConfig = {
      page_id: config.page,
      property_name: config.propertyName
    };

    const result = await notionGetPageProperty(propertyConfig, context);

    return {
      success: result.success,
      output: result.output,
      message: result.message
    };
  } catch (error: any) {
    logger.error('Notion get page property error:', error);
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to get page property'
    };
  }
}
