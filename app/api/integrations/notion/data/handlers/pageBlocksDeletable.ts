/**
 * Notion Page Blocks Deletable Handler
 * Fetches blocks from a page formatted for deletion selection (checkboxes)
 */

import { NotionIntegration, NotionDataHandler } from '../types'
import { validateNotionIntegration, validateNotionToken } from '../utils'

import { logger } from '@/lib/utils/logger'

interface DeletableBlock {
  id: string
  type: string
  blockId: string
  label: string
  content: string
  hasChildren: boolean
  selected: boolean
}

/**
 * Fetch all blocks from a Notion page formatted for deletion selection
 */
export const getNotionPageBlocksDeletable: NotionDataHandler<DeletableBlock> = async (
  integration: NotionIntegration,
  options?: any
) => {
  try {
    validateNotionIntegration(integration)

    let pageId = options?.pageId
    if (!pageId) {
      throw new Error("Page ID is required to fetch blocks")
    }

    // Normalize the page ID - remove any dashes if present
    pageId = pageId.replace(/-/g, '')

    const targetWorkspaceId = options?.workspace || options?.workspaceId

    // Get workspace-specific token if workspace is specified
    let tokenToUse = integration.access_token

    if (targetWorkspaceId && integration.metadata?.workspaces) {
      const workspace = integration.metadata.workspaces[targetWorkspaceId]
      if (workspace?.access_token) {
        tokenToUse = workspace.access_token
      }
    }

    const integrationWithToken = { ...integration, access_token: tokenToUse }
    const tokenResult = await validateNotionToken(integrationWithToken)

    if (!tokenResult.success) {
      throw new Error(tokenResult.error || "Token validation failed")
    }

    logger.debug("🗑️ [Notion Deletable Blocks] Fetching blocks for page:", pageId)

    // Fetch all blocks from the page
    const blocksResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
        "Notion-Version": "2022-06-28",
      },
    })

    if (!blocksResponse.ok) {
      const errorData = await blocksResponse.json().catch(() => ({}))

      if (blocksResponse.status === 404 || errorData.message?.includes("Could not find")) {
        throw new Error(
          "Cannot access blocks for this page. Please ensure:\n" +
          "1. The page is shared with your Notion integration\n" +
          "2. You have selected the correct workspace\n" +
          "3. The page still exists and hasn't been deleted"
        )
      }

      throw new Error(`Failed to fetch blocks: ${errorData.message || blocksResponse.statusText}`)
    }

    const blocksData = await blocksResponse.json()
    const blocks = blocksData.results || []

    logger.debug(`🗑️ [Notion Deletable Blocks] Found ${blocks.length} blocks`)

    // Transform blocks into deletable format with checkboxes
    const deletableBlocks: DeletableBlock[] = []

    for (const block of blocks) {
      const blockType = block.type

      // Extract content based on block type
      let content = ''
      if (block[blockType]?.rich_text) {
        content = block[blockType].rich_text.map((t: any) => t.plain_text).join('')
      } else if (blockType === 'to_do' && block.to_do?.rich_text) {
        const checked = block.to_do.checked ? '☑' : '☐'
        content = `${checked} ${block.to_do.rich_text.map((t: any) => t.plain_text).join('')}`
      } else if (blockType === 'child_page') {
        content = block.child_page?.title || 'Child Page'
      } else if (blockType === 'child_database') {
        content = block.child_database?.title || 'Child Database'
      } else if (blockType === 'image') {
        content = '[Image]'
      } else if (blockType === 'file') {
        content = '[File attachment]'
      } else if (blockType === 'pdf') {
        content = '[PDF document]'
      } else if (blockType === 'video') {
        content = '[Video]'
      } else if (blockType === 'embed') {
        content = '[Embed]'
      } else if (blockType === 'bookmark') {
        content = block.bookmark?.url || '[Bookmark]'
      } else if (blockType === 'code') {
        const lang = block.code?.language || 'code'
        const codeContent = block.code?.rich_text?.map((t: any) => t.plain_text).join('') || ''
        content = `[${lang}] ${codeContent.substring(0, 50)}${codeContent.length > 50 ? '...' : ''}`
      } else if (blockType === 'equation') {
        content = block.equation?.expression || '[Equation]'
      } else if (blockType === 'divider') {
        content = '─────────'
      } else if (blockType === 'table_of_contents') {
        content = '[Table of Contents]'
      } else if (blockType === 'breadcrumb') {
        content = '[Breadcrumb]'
      } else if (blockType === 'column_list') {
        content = '[Column Layout]'
      } else if (blockType === 'column') {
        content = '[Column]'
      } else if (blockType === 'synced_block') {
        content = '[Synced Block]'
      } else if (blockType === 'template') {
        content = '[Template]'
      } else if (blockType === 'link_to_page') {
        content = '[Link to Page]'
      } else if (blockType === 'table') {
        content = '[Table]'
      } else if (blockType === 'table_row') {
        content = '[Table Row]'
      }

      // Truncate content for display
      const truncatedContent = content.length > 80 ? content.substring(0, 80) + '...' : content

      // Create a user-friendly label
      const typeLabel = formatBlockType(blockType)
      const label = truncatedContent ? `${typeLabel}: ${truncatedContent}` : typeLabel

      deletableBlocks.push({
        id: `block-${block.id}`,
        type: blockType,
        blockId: block.id,
        label: label,
        content: content,
        hasChildren: block.has_children || false,
        selected: false
      })
    }

    logger.debug(`🗑️ [Notion Deletable Blocks] Returning ${deletableBlocks.length} deletable blocks`)

    // Return as a single section with checkbox-style blocks
    return [{
      id: 'deletable-blocks',
      type: 'deletable_block_list',
      properties: deletableBlocks.map(block => ({
        id: block.blockId,
        type: 'deletable_block',
        label: block.label,
        blockType: block.type,
        content: block.content,
        hasChildren: block.hasChildren,
        value: false // Not selected by default
      })),
      hasChildren: false
    }] as any

  } catch (error: any) {
    logger.error("❌ [Notion Deletable Blocks] Error:", error.message)
    throw error
  }
}

/**
 * Format block type to user-friendly label
 */
function formatBlockType(type: string): string {
  const typeMap: Record<string, string> = {
    'paragraph': 'Paragraph',
    'heading_1': 'Heading 1',
    'heading_2': 'Heading 2',
    'heading_3': 'Heading 3',
    'bulleted_list_item': 'Bullet',
    'numbered_list_item': 'Number',
    'to_do': 'To-do',
    'toggle': 'Toggle',
    'code': 'Code',
    'quote': 'Quote',
    'callout': 'Callout',
    'divider': 'Divider',
    'image': 'Image',
    'video': 'Video',
    'file': 'File',
    'pdf': 'PDF',
    'bookmark': 'Bookmark',
    'embed': 'Embed',
    'equation': 'Equation',
    'table_of_contents': 'Table of Contents',
    'breadcrumb': 'Breadcrumb',
    'column_list': 'Columns',
    'column': 'Column',
    'synced_block': 'Synced Block',
    'template': 'Template',
    'link_to_page': 'Link to Page',
    'table': 'Table',
    'table_row': 'Table Row',
    'child_page': 'Child Page',
    'child_database': 'Child Database'
  }

  return typeMap[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
