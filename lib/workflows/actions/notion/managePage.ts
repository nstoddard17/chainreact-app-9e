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
 * Convert plain text content to Notion block format with markdown-like syntax support
 */
function convertContentToBlocks(content: string): any[] {
  if (!content) return [];

  // Split content by newlines
  const lines = content.split('\n');

  return lines.map(line => {
    const trimmedLine = line.trim();

    // Empty line becomes empty paragraph
    if (!trimmedLine) {
      return {
        type: 'paragraph',
        paragraph: {
          rich_text: []
        }
      };
    }

    // H1 Header: # text
    if (trimmedLine.startsWith('# ')) {
      return {
        type: 'heading_1',
        heading_1: {
          rich_text: [{
            type: 'text',
            text: {
              content: trimmedLine.substring(2).trim()
            }
          }]
        }
      };
    }

    // H2 Header: ## text
    if (trimmedLine.startsWith('## ')) {
      return {
        type: 'heading_2',
        heading_2: {
          rich_text: [{
            type: 'text',
            text: {
              content: trimmedLine.substring(3).trim()
            }
          }]
        }
      };
    }

    // H3 Header: ### text
    if (trimmedLine.startsWith('### ')) {
      return {
        type: 'heading_3',
        heading_3: {
          rich_text: [{
            type: 'text',
            text: {
              content: trimmedLine.substring(4).trim()
            }
          }]
        }
      };
    }

    // Bullet list: - text or * text
    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      return {
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: {
              content: trimmedLine.substring(2).trim()
            }
          }]
        }
      };
    }

    // Numbered list: 1. text (any number followed by .)
    if (/^\d+\.\s/.test(trimmedLine)) {
      const textContent = trimmedLine.replace(/^\d+\.\s/, '').trim();
      return {
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [{
            type: 'text',
            text: {
              content: textContent
            }
          }]
        }
      };
    }

    // Todo list: [] text or [ ] text (unchecked) or [x] text or [X] text (checked)
    if (trimmedLine.startsWith('[]') || trimmedLine.startsWith('[ ]')) {
      const textContent = trimmedLine.replace(/^\[\s?\]\s?/, '').trim();
      return {
        type: 'to_do',
        to_do: {
          rich_text: [{
            type: 'text',
            text: {
              content: textContent
            }
          }],
          checked: false
        }
      };
    }

    if (trimmedLine.startsWith('[x]') || trimmedLine.startsWith('[X]')) {
      const textContent = trimmedLine.replace(/^\[[xX]\]\s?/, '').trim();
      return {
        type: 'to_do',
        to_do: {
          rich_text: [{
            type: 'text',
            text: {
              content: textContent
            }
          }],
          checked: true
        }
      };
    }

    // Quote/callout: > text
    if (trimmedLine.startsWith('> ')) {
      return {
        type: 'quote',
        quote: {
          rich_text: [{
            type: 'text',
            text: {
              content: trimmedLine.substring(2).trim()
            }
          }]
        }
      };
    }

    // Code block: ``` or lines starting with 4 spaces
    if (trimmedLine.startsWith('```')) {
      const codeContent = trimmedLine.substring(3).trim();
      return {
        type: 'code',
        code: {
          rich_text: [{
            type: 'text',
            text: {
              content: codeContent || ' '  // Notion requires at least one character
            }
          }],
          language: 'plain text'
        }
      };
    }

    // Divider: --- or ***
    if (trimmedLine === '---' || trimmedLine === '***') {
      return {
        type: 'divider',
        divider: {}
      };
    }

    // Default: paragraph
    return {
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: {
            content: line  // Use original line to preserve indentation
          }
        }]
      }
    };
  });
}

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
          parent_type: config.parentType,
          database_id: config.parentDatabase,
          parent_page_id: config.parentPage,
          icon_type: config.iconType,
          icon_emoji: config.iconEmoji,
          icon_url: config.iconUrl,
          cover_type: config.coverType,
          cover_url: config.coverUrl,
          // If content is provided as plain text, convert it to blocks
          content_blocks: config.contentBlocks || (config.content ? convertContentToBlocks(config.content) : undefined),
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
        // For updates, if content is provided, we need to append it as blocks
        // since Notion API doesn't support replacing all content in one call
        if (config.content) {
          // First update the page properties
          const updateConfig = {
            page_id: config.page,
            title: config.title,
            properties: config.pageFields || config.properties,
            icon_type: config.iconType,
            icon_emoji: config.iconEmoji,
            icon_url: config.iconUrl,
            cover_type: config.coverType,
            cover_url: config.coverUrl
          };
          const updateResult = await notionUpdatePage(updateConfig, context);

          // Then append content as new blocks if update was successful
          if (updateResult.success && config.content) {
            const appendConfig = {
              page_id: config.page,
              children: convertContentToBlocks(config.content)
            };
            const appendResult = await notionAppendBlocks(appendConfig, context);

            // Return combined result
            return {
              success: appendResult.success,
              output: {
                ...updateResult.output,
                content_added: appendResult.success
              },
              message: appendResult.success ? undefined : appendResult.message
            };
          }

          return updateResult;
        } else {
          // No content, just update properties
          const updateConfig = {
            page_id: config.page,
            title: config.title,
            properties: config.pageFields || config.properties,
            icon_type: config.iconType,
            icon_emoji: config.iconEmoji,
            icon_url: config.iconUrl,
            cover_type: config.coverType,
            cover_url: config.coverUrl
          };
          return await notionUpdatePage(updateConfig, context);
        }

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
          // Use the helper function to convert content to blocks
          children: config.content ? convertContentToBlocks(config.content) : [],
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