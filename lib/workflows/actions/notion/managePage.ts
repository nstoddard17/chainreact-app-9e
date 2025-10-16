import { ExecutionContext } from '@/types/workflow';
import { ActionResult } from '@/lib/workflows/actions';
import {
  notionCreatePage,
  notionUpdatePage,
  notionRetrievePage,
  notionArchivePage,
  notionDuplicatePage,
  notionAppendBlocks,
  notionRetrieveBlockChildren,
  notionDeleteBlock,
  notionUpdateBlock
} from './handlers';

import { logger } from '@/lib/utils/logger'

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
              content: codeContent || ' ' // Notion requires at least one character
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
            content: line // Use original line to preserve indentation
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
        // Debug log to see what data we receive
        logger.debug('📝 Notion Update - Config received:', {
          hasPageFields: !!config.pageFields,
          pageFieldsKeys: config.pageFields ? Object.keys(config.pageFields) : [],
          pageFieldsData: config.pageFields
        });

        // Extract block content from pageFields
        const pageFieldsData = config.pageFields || {};
        const blockContent: any[] = [];
        const pageProperties: any = {};

        // Separate block content from page properties
        for (const [key, value] of Object.entries(pageFieldsData)) {
          logger.debug(`📝 Processing field ${key}:`, value);

          // Check if this is block content
          if (key === 'todo-items' && value && typeof value === 'object') {
            // Handle todo list blocks
            const todoData = value as any;
            logger.debug('📝 Processing todo-items:', todoData);
            if (todoData.items && Array.isArray(todoData.items)) {
              todoData.items.forEach((item: any) => {
                const todoBlock = {
                  object: 'block',
                  type: 'to_do',
                  to_do: {
                    rich_text: [{
                      type: 'text',
                      text: {
                        content: item.content || item.text || ''
                      }
                    }],
                    checked: item.checked || false
                  }
                };
                logger.debug('📝 Adding todo block:', todoBlock);
                blockContent.push(todoBlock);
              });
            }
          } else if (key.includes('-content') && value) {
            // Handle other content blocks (text, toggle, etc.)
            const blockId = key.replace('-content', '');
            logger.debug(`📝 Processing content block ${blockId}:`, value);
            // Determine block type from the ID pattern
            if (typeof value === 'string' && value.trim()) {
              // Add as a paragraph block
              const paragraphBlock = {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: [{
                    type: 'text',
                    text: {
                      content: value
                    }
                  }]
                }
              };
              logger.debug('📝 Adding paragraph block:', paragraphBlock);
              blockContent.push(paragraphBlock);
            }
          } else {
            // Regular page property
            logger.debug(`📝 Adding as page property ${key}:`, value);
            pageProperties[key] = value;
          }
        }

        // Add any content from the content field
        if (config.content) {
          const contentBlocks = convertContentToBlocks(config.content);
          blockContent.push(...contentBlocks);
        }

        // Debug log the extracted content
        logger.debug('📝 Notion Update - Extracted content:', {
          blockContentCount: blockContent.length,
          blockContent: blockContent,
          pagePropertiesKeys: Object.keys(pageProperties),
          pageProperties: pageProperties
        });

        // First update the page properties
        const updateConfig = {
          page_id: config.page,
          title: config.title,
          properties: pageProperties,
          icon_type: config.iconType,
          icon_emoji: config.iconEmoji,
          icon_url: config.iconUrl,
          cover_type: config.coverType,
          cover_url: config.coverUrl
        };
        const updateResult = await notionUpdatePage(updateConfig, context);

        // Handle block updates using individual block API calls
        // This preserves block metadata, history, and is more efficient than replacing everything
        if (updateResult.success) {
          const blockUpdates: any[] = [];
          const blocksToAdd: any[] = [];
          const blocksToDelete: string[] = [];

          // Process todo items
          if (pageFieldsData['todo-items'] && pageFieldsData['todo-items'].items) {
            const todoItems = pageFieldsData['todo-items'].items;
            logger.debug('📝 Processing todo items for update:', todoItems);

            for (const item of todoItems) {
              // Use blockId if available, otherwise fallback to id
              const blockId = item.blockId || item.id;
              if (blockId && !blockId.startsWith('new-')) {
                // Existing block - update it
                logger.debug(`🔄 Updating existing todo block ${blockId}`);
                blockUpdates.push({
                  block_id: blockId,
                  to_do: {
                    rich_text: [{
                      type: 'text',
                      text: {
                        content: item.content || ''
                      }
                    }],
                    checked: item.checked || false
                  }
                });
              } else {
                // New block - add it
                logger.debug(`➕ Adding new todo block`);
                blocksToAdd.push({
                  object: 'block',
                  type: 'to_do',
                  to_do: {
                    rich_text: [{
                      type: 'text',
                      text: {
                        content: item.content || ''
                      }
                    }],
                    checked: item.checked || false
                  }
                });
              }
            }

            // TODO: Track deleted items (items that existed before but are not in the current list)
            // This would require comparing with the original fetched data
          }

          // Process other content blocks
          for (const [key, value] of Object.entries(pageFieldsData)) {
            if (key.includes('-content') && value) {
              // Extract block ID from key like "28c2d09a-d427-81cf-a1cf-e6c3e484bc13-content"
              // Need to remove the "-content" suffix and any dashes from the UUID
              const blockIdWithDashes = key.replace('-content', '');
              const blockId = blockIdWithDashes.replace(/-/g, ''); // Remove all dashes

              if (blockId && blockId.length === 32) { // Notion block IDs are 32 chars without dashes
                // This is an existing block - update it
                logger.debug(`🔄 Updating content block ${blockId} (original: ${blockIdWithDashes})`);
                blockUpdates.push({
                  block_id: blockId,
                  paragraph: {
                    rich_text: [{
                      type: 'text',
                      text: {
                        content: value
                      }
                    }]
                  }
                });
              }
            }
          }

          // Execute individual block updates
          let updatedCount = 0;
          for (const update of blockUpdates) {
            try {
              const { block_id, ...blockContent } = update;
              logger.debug(`🔄 Updating block ${block_id}`);
              const updateBlockConfig = {
                block_id: block_id,
                block_content: blockContent
              };
              await notionUpdateBlock(updateBlockConfig, context);
              updatedCount++;
            } catch (error) {
              logger.warn(`⚠️ Failed to update block ${block_id}:`, error);
            }
          }

          // Add new blocks if any
          if (blocksToAdd.length > 0) {
            logger.debug(`➕ Adding ${blocksToAdd.length} new blocks`);
            const appendConfig = {
              page_id: config.page,
              blocks: blocksToAdd
            };
            await notionAppendBlocks(appendConfig, context);
          }

          // Delete removed blocks if any
          if (blocksToDelete.length > 0) {
            logger.debug(`🗑️ Deleting ${blocksToDelete.length} blocks`);
            for (const blockId of blocksToDelete) {
              try {
                await notionDeleteBlock({ block_id: blockId }, context);
              } catch (error) {
                logger.warn(`⚠️ Failed to delete block ${blockId}:`, error);
              }
            }
          }

          logger.debug(`✅ Updated ${updatedCount} blocks, added ${blocksToAdd.length} blocks`);

          return {
            success: true,
            output: {
              ...updateResult.output,
              blocks_updated: updatedCount,
              blocks_added: blocksToAdd.length,
              blocks_deleted: blocksToDelete.length
            }
          };
        }

        return updateResult;

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
          blocks: config.content ? convertContentToBlocks(config.content) : [],
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
    logger.error('Notion manage page error:', error);
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to execute Notion page operation'
    };
  }
}