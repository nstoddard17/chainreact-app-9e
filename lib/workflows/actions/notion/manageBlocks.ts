import { ExecutionContext } from '@/types/workflow';
import { ActionResult } from '@/lib/workflows/actions';

import { logger } from '@/lib/utils/logger'

/**
 * Execute unified Notion blocks management action
 * Handles add_block, get_block, get_block_children, and get_page_with_children operations
 */
export async function executeNotionManageBlocks(
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
      case 'add_block': {
        const { notionAddBlock } = await import('./handlers');

        const addConfig = {
          page_id: config.targetPage,
          block_type: config.blockType,
          content: config.blockContent,
          checked: config.checked === 'true',
          language: config.codeLanguage
        };

        const result = await notionAddBlock(addConfig, context);

        return {
          success: result.success,
          output: result.output,
          message: result.message
        };
      }

      case 'get_block': {
        const { notionGetBlock } = await import('./handlers');

        const getConfig = {
          block_id: config.blockId
        };

        const result = await notionGetBlock(getConfig, context);

        return {
          success: result.success,
          output: result.output,
          message: result.message
        };
      }

      case 'get_block_children': {
        const { notionGetBlockChildren } = await import('./handlers');

        const childrenConfig = {
          block_id: config.blockId,
          page_size: config.pageSize || 100
        };

        const result = await notionGetBlockChildren(childrenConfig, context);

        return {
          success: result.success,
          output: result.output,
          message: result.message
        };
      }

      case 'get_page_with_children': {
        const { notionGetPageWithChildren } = await import('./handlers');

        const pageConfig = {
          page_id: config.pageForChildren,
          depth: config.depth || '1'
        };

        const result = await notionGetPageWithChildren(pageConfig, context);

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
    logger.error('Notion manage blocks error:', error);
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to execute Notion blocks operation'
    };
  }
}
