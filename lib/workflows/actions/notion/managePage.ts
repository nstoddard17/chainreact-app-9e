import { ExecutionContext } from '@/types/workflow';
import { ActionResult } from '@/lib/workflows/actions';
import {
  notionCreatePage,
  notionUpdatePage,
  notionRetrievePage,
  notionArchivePage,
  notionDuplicatePage,
  notionAppendBlocks
} from './handlers';

/**
 * Execute unified Notion page management action
 * Handles create, update, get details, append, archive, and duplicate operations
 */
export async function executeNotionManagePage(
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
        // Validate parent selection
        if (!config.parentType) {
          return {
            success: false,
            output: {},
            message: 'Please select where to create the page (Database or Page)'
          };
        }

        if (config.parentType === 'database' && !config.parentDatabase) {
          return {
            success: false,
            output: {},
            message: 'Please select a database to create the page in'
          };
        }

        if (config.parentType === 'page' && !config.parentPage) {
          return {
            success: false,
            output: {},
            message: 'Please select a parent page to create the page under'
          };
        }

        // Map fields for create page with new parent selection
        const createConfig = {
          workspace: config.workspace,
          title: config.title,
          content: config.content,
          parent_type: config.parentType,
          database_id: config.parentDatabase,
          parent_page_id: config.parentPage,
          icon_type: config.iconType,
          icon_emoji: config.iconEmoji,
          icon_url: config.iconUrl,
          cover_type: config.coverType,
          cover_url: config.coverUrl,
          content_blocks: config.contentBlocks,
          properties: config.properties
        };
        return await notionCreatePage(createConfig, context);

      case 'create_database':
        // Map fields for create database page
        const createDbPageConfig = {
          workspace: config.workspace,
          title: config.title,
          content: config.content,
          parent_type: 'database',
          database_id: config.database,
          properties: config.properties
        };
        return await notionCreatePage(createDbPageConfig, context);

      case 'update':
        // Map fields for update page
        const updateConfig = {
          page_id: config.page,
          title: config.title,
          content: config.content,
          properties: config.pageFields || config.properties,
          icon_type: config.iconType,
          icon_emoji: config.iconEmoji,
          icon_url: config.iconUrl,
          cover_type: config.coverType,
          cover_url: config.coverUrl
        };
        return await notionUpdatePage(updateConfig, context);

      case 'update_database':
        // This operation updates database properties, not pages
        // It should be handled by executeNotionManageDatabase
        return {
          success: false,
          output: {},
          message: 'update_database operation should use notion_action_manage_database'
        };

      case 'append':
        // Map fields for append to page
        const appendConfig = {
          page_id: config.page,
          blocks: [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  {
                    type: 'text',
                    text: { content: config.content || '' }
                  }
                ]
              }
            }
          ],
          after: config.after
        };
        return await notionAppendBlocks(appendConfig, context);

      case 'get_details':
        // Map fields for get page details
        const getDetailsConfig = {
          page_id: config.page,
          include_properties: config.includeProperties === 'true',
          include_content: config.includeContent === 'true'
        };
        return await notionRetrievePage(getDetailsConfig, context);

      case 'archive':
        // Map fields for archive/unarchive
        const archiveConfig = {
          page_id: config.page,
          archived: config.archiveAction === 'archive' ? 'true' : 'false'
        };
        return await notionArchivePage(archiveConfig, context);

      case 'duplicate':
        // Map fields for duplicate page
        const duplicateConfig = {
          source_page_id: config.page,
          destination_type: config.destinationPage ? 'page' : 'same_parent',
          destination_page_id: config.destinationPage,
          title_suffix: config.titleSuffix || ' (Copy)',
          include_content: config.includeContent !== false,
          include_children: config.includeChildren === true
        };
        return await notionDuplicatePage(duplicateConfig, context);

      default:
        return {
          success: false,
          output: {},
          message: `Unknown operation: ${operation}`
        };
    }
  } catch (error: any) {
    console.error('Notion manage page error:', error);
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to execute Notion page operation'
    };
  }
}