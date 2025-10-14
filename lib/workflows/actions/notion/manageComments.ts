import { ExecutionContext } from '@/types/workflow';
import { ActionResult } from '@/lib/workflows/actions';
import {
  notionCreateComment,
  notionRetrieveComments
} from './handlers';

import { logger } from '@/lib/utils/logger'

/**
 * Execute unified Notion comments management action
 * Handles create and retrieve comment operations
 */
export async function executeNotionManageComments(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const { operation } = config;

  // Create a mock ExecutionContext for the handlers that expect it
  const context: ExecutionContext = {
    userId,
    workflowId: '',
    executionId: '',
    nodeId: '',
    testMode: false,
    dataFlowManager: {
      resolveVariable: (value: any) => {
        // Simple variable resolution - just return the value
        // In a real scenario, this would resolve {{variables}}
        if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
          const path = value.slice(2, -2);
          return path.split('.').reduce((acc: any, part: string) => acc?.[part], input);
        }
        return value;
      },
      storeNodeOutput: () => {},
      getNodeOutput: () => ({}),
      getAllOutputs: () => ({})
    } as any
  };

  try {
    switch (operation) {
      case 'create':
        // Map fields for create comment
        const createConfig = {
          parent_type: 'page',
          page_id: config.page,
          discussion_id: config.discussionId,
          rich_text: config.commentText,
          parent_id: config.parentId
        };
        return await notionCreateComment(createConfig, context);

      case 'retrieve':
        // Map fields for retrieve comments
        const retrieveConfig = {
          block_id: config.page,
          page_size: 100,
          include_resolved: config.includeResolved === 'true'
        };
        return await notionRetrieveComments(retrieveConfig, context);

      default:
        return {
          success: false,
          output: {},
          message: `Unknown operation: ${operation}`
        };
    }
  } catch (error: any) {
    logger.error('Notion manage comments error:', error);
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to execute Notion comments operation'
    };
  }
}