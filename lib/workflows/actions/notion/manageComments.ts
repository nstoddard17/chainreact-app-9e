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
  // Infer operation from config if not explicitly set
  // If commentTarget is set, it's a create operation
  // If listTarget is set, it's a list operation
  const operation = config.operation ||
    (config.commentTarget ? 'create' :
    (config.listTarget ? 'list' : undefined));

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
      case 'create': {
        // Map fields for create comment based on commentTarget
        const createConfig: any = {
          rich_text: config.commentText
        };

        // Determine parent type and ID based on commentTarget
        if (config.commentTarget === 'page' && config.page) {
          createConfig.parent_type = 'page';
          createConfig.page_id = config.page;
        } else if (config.commentTarget === 'block' && config.blockId) {
          createConfig.parent_type = 'block';
          createConfig.page_id = config.blockId; // handlers.ts uses page_id field for block_id too
        } else if (config.commentTarget === 'discussion' && config.discussionId) {
          createConfig.parent_type = 'discussion';
          createConfig.discussion_id = config.discussionId;
        } else {
          return {
            success: false,
            output: {},
            message: 'Invalid comment target configuration'
          };
        }

        const result = await notionCreateComment(createConfig, context);

        // Map output to match our schema
        return {
          success: result.success,
          output: {
            commentId: result.output.comment_id,
            discussionId: result.output.parent?.discussion_id,
            createdTime: result.output.created_time,
            ...result.output
          },
          message: result.message
        };
      }

      case 'list': {
        // Map fields for list comments based on listTarget
        let blockOrPageId: string;

        if (config.listTarget === 'page' && config.pageForList) {
          blockOrPageId = config.pageForList;
        } else if (config.listTarget === 'block' && config.blockIdForList) {
          blockOrPageId = config.blockIdForList;
        } else {
          return {
            success: false,
            output: {},
            message: 'Invalid list target configuration'
          };
        }

        const retrieveConfig = {
          block_id: blockOrPageId,
          page_size: config.pageSize || 100
        };

        const result = await notionRetrieveComments(retrieveConfig, context);

        // Map output to match our schema
        return {
          success: result.success,
          output: {
            comments: result.output.comments,
            hasMore: result.output.has_more,
            nextCursor: result.output.next_cursor,
            ...result.output
          },
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
    logger.error('Notion manage comments error:', error);
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to execute Notion comments operation'
    };
  }
}