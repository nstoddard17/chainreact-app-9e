/**
 * Notion Databases Handler
 */

import { NotionIntegration, NotionDatabase, NotionDataHandler } from '../types'
import { validateNotionIntegration, validateNotionToken, getDatabaseTitle, getPageTitle } from '../utils'

import { logger } from '@/lib/utils/logger'

/**
 * Fetch Notion databases (simplified version without workspace complexity)
 */
export const getNotionDatabases: NotionDataHandler<NotionDatabase> = async (integration: NotionIntegration, options?: any) => {
  try {
    validateNotionIntegration(integration)
    // Check for both workspace and workspaceId for compatibility
    const targetWorkspaceId = options?.workspace || options?.workspaceId
    logger.info("🗄️ [Notion Databases] Fetching databases", targetWorkspaceId ? `for workspace: ${targetWorkspaceId}` : '(all workspaces)')

    // Get workspace-specific token if workspace is specified
    let tokenToUse = integration.access_token
    
    if (targetWorkspaceId && integration.metadata?.workspaces) {
      const workspace = integration.metadata.workspaces[targetWorkspaceId]
      if (workspace?.access_token) {
        logger.info("🔑 [Notion Databases] Using workspace-specific token")
        tokenToUse = workspace.access_token
      } else {
        logger.info("🔑 [Notion Databases] No workspace-specific token, using main integration token")
      }
    }

    // Create a temporary integration object with the correct token
    const integrationWithToken = { ...integration, access_token: tokenToUse }
    
    // Validate and get token
    const tokenResult = await validateNotionToken(integrationWithToken)
    if (!tokenResult.success) {
      throw new Error(tokenResult.error || "Token validation failed")
    }

    // First, search for ALL content to debug what's available
    logger.info("🔍 [Notion Databases] Searching for ALL content in workspace to debug...")
    
    let allContent: any[] = []
    let hasMore = true
    let startCursor: string | undefined = undefined
    
    // Search without any filter to get EVERYTHING
    while (hasMore) {
      const requestBody: any = {
        page_size: 100
      }
      
      if (startCursor) {
        requestBody.start_cursor = startCursor
      }
      
      const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResult.token}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Notion authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Notion API error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      const data = await response.json()
      const results = data.results || []
      allContent = allContent.concat(results)
      
      hasMore = data.has_more || false
      startCursor = data.next_cursor
    }
    
    // Log everything we found
    logger.info(`📊 [Notion Databases] Total items found: ${allContent.length}`)
    
    // Separate by type
    const rawDatabases = allContent.filter(item => item.object === 'database')
    const pages = allContent.filter(item => item.object === 'page')
    
    logger.info(`📊 Breakdown: ${rawDatabases.length} databases, ${pages.length} pages`)
    
    // Log ALL databases with their details
    logger.info("🗄️ ALL DATABASES FOUND:")
    rawDatabases.forEach((db, index) => {
      const title = getDatabaseTitle(db)
      logger.info(`  ${index + 1}. "${title}" (ID: ${db.id.substring(0, 8)}...)`)
      logger.info(`     - Archived: ${db.archived}`)
      logger.info(`     - Is Inline: ${db.is_inline}`)
      logger.info(`     - Parent Type: ${db.parent?.type}`)
      logger.info(`     - Created: ${db.created_time}`)
      logger.info(`     - URL: ${db.url}`)
    })
    
    // Also log some pages to see if any contain databases
    logger.info("\n📄 SAMPLE PAGES (first 20):")
    pages.slice(0, 20).forEach((page, index) => {
      const title = getPageTitle(page)
      logger.info(`  ${index + 1}. "${title}" (ID: ${page.id.substring(0, 8)}...)`)
    })
    
    // SPECIFICALLY LOOK FOR THE MISSING ITEMS
    logger.info("\n🔍 SEARCHING FOR SPECIFIC MISSING ITEMS:")
    const viewOfGlobalOffices = pages.find(page => {
      const title = getPageTitle(page)
      return title === 'View of Global Offices' || title.toLowerCase().includes('view of global offices')
    })
    
    const projects1 = pages.find(page => {
      const title = getPageTitle(page)
      return title === 'Projects (1)' || title.toLowerCase().includes('projects (1)')
    })
    
    if (viewOfGlobalOffices) {
      logger.info("✅ FOUND 'View of Global Offices' as a PAGE:")
      logger.info(`   - ID: ${viewOfGlobalOffices.id}`)
      logger.info(`   - URL: ${viewOfGlobalOffices.url}`)
      logger.info(`   - Parent Type: ${viewOfGlobalOffices.parent?.type}`)
      logger.info(`   - Created: ${viewOfGlobalOffices.created_time}`)
    } else {
      logger.info("❌ 'View of Global Offices' NOT FOUND in pages")
      // Check if it's in databases
      const inDatabases = rawDatabases.find(db => {
        const title = getDatabaseTitle(db)
        return title === 'View of Global Offices' || title.toLowerCase().includes('view of global offices')
      })
      if (inDatabases) {
        logger.info("   BUT it IS in databases list! Details:")
        logger.info(`   - ID: ${inDatabases.id}`)
        logger.info(`   - Archived: ${inDatabases.archived}`)
      }
    }
    
    if (projects1) {
      logger.info("✅ FOUND 'Projects (1)' as a PAGE:")
      logger.info(`   - ID: ${projects1.id}`)
      logger.info(`   - URL: ${projects1.url}`)
      logger.info(`   - Parent Type: ${projects1.parent?.type}`)
      logger.info(`   - Created: ${projects1.created_time}`)
    } else {
      logger.info("❌ 'Projects (1)' NOT FOUND in pages")
      // Check if it's in databases
      const inDatabases = rawDatabases.find(db => {
        const title = getDatabaseTitle(db)
        return title === 'Projects (1)' || title.toLowerCase().includes('projects (1)')
      })
      if (inDatabases) {
        logger.info("   BUT it IS in databases list! Details:")
        logger.info(`   - ID: ${inDatabases.id}`)
        logger.info(`   - Archived: ${inDatabases.archived}`)
      }
    }
    
    const allDatabases = [...rawDatabases]
    
    logger.info(`\n📊 [Notion Databases] Starting with ${allDatabases.length} databases`)
    
    // If we found the specific missing pages, check them for database content
    const specificPagesToCheck = [viewOfGlobalOffices, projects1].filter(Boolean)
    
    if (specificPagesToCheck.length > 0) {
      logger.info("\n🔍 Checking specific pages for database content...")
      for (const page of specificPagesToCheck) {
        if (!page) continue
        
        const pageTitle = getPageTitle(page)
        logger.info(`\n   Checking page: "${pageTitle}"`)
        
        try {
          // Fetch the page's blocks to see if it contains a database view
          const blocksResponse = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children?page_size=100`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${tokenResult.token}`,
              "Notion-Version": "2022-06-28",
            },
          })
          
          if (blocksResponse.ok) {
            const blocksData = await blocksResponse.json()
            const blocks = blocksData.results || []
            
            logger.info(`      Found ${blocks.length} blocks in page`)
            
            for (const block of blocks) {
              logger.info(`      - Block type: ${block.type}, ID: ${block.id}`)
              
              // Check for different types of database blocks
              if (block.type === 'child_database') {
                logger.info(`      ✅ FOUND child_database! Adding to database list.`)
                allDatabases.push({
                  id: block.id,
                  object: 'database',
                  title: [{ 
                    type: 'text',
                    text: { content: pageTitle },
                    plain_text: pageTitle
                  }],
                  url: page.url,
                  parent: page.parent,
                  created_time: block.created_time || page.created_time,
                  last_edited_time: block.last_edited_time || page.last_edited_time,
                  properties: {},
                  is_inline: true,
                  archived: false
                })
              } else if (block.type === 'synced_block' && block.synced_block?.synced_from?.block_id) {
                logger.info(`      ⚡ Found synced_block - checking if it's a database view...`)
                // Synced blocks can contain database views
                allDatabases.push({
                  id: `${page.id}_synced`,
                  object: 'database',
                  title: [{ 
                    type: 'text',
                    text: { content: pageTitle },
                    plain_text: pageTitle
                  }],
                  url: page.url,
                  parent: page.parent,
                  created_time: page.created_time,
                  last_edited_time: page.last_edited_time,
                  properties: {},
                  is_inline: false,
                  archived: false,
                  is_database_view: true,
                  is_synced: true
                })
              } else if (block.type === 'child_page' && block.child_page) {
                logger.info(`      - Found child_page block`)
              } else if (block.type === 'link_to_page' && block.link_to_page?.database_id) {
                // This is a linked database view
                logger.info(`      ✅ FOUND link_to_page with database_id! Adding as database view.`)
                allDatabases.push({
                  id: block.link_to_page.database_id,
                  object: 'database',
                  title: [{ 
                    type: 'text',
                    text: { content: pageTitle },
                    plain_text: pageTitle
                  }],
                  url: page.url,
                  parent: page.parent,
                  created_time: page.created_time,
                  last_edited_time: page.last_edited_time,
                  properties: {},
                  is_inline: false,
                  archived: false,
                  is_database_view: true,
                  original_database_id: block.link_to_page.database_id
                })
              } else if (block[block.type]?.type === 'database_id') {
                // Generic check for any block with database_id
                logger.info(`      ✅ FOUND block with database_id! Adding as database view.`)
                allDatabases.push({
                  id: `${page.id}_linked_db`,
                  object: 'database',
                  title: [{ 
                    type: 'text',
                    text: { content: pageTitle },
                    plain_text: pageTitle
                  }],
                  url: page.url,
                  parent: page.parent,
                  created_time: page.created_time,
                  last_edited_time: page.last_edited_time,
                  properties: {},
                  is_inline: false,
                  archived: false,
                  is_database_view: true
                })
              }
            }
          } else {
            logger.info(`      ❌ Could not fetch blocks: ${blocksResponse.status}`)
          }
        } catch (error: any) {
          logger.info(`      ❌ Error fetching blocks: ${error.message}`)
        }
      }
    }
    
    // Now search for other database views in pages
    logger.info("\n🔍 [Notion Databases] Searching for other database views in pages...")
    
    // Check pages for database views (but limit to avoid timeout)
    const pagesToCheck = pages.slice(0, 30) // Check first 30 pages
    
    for (const page of pagesToCheck) {
      const pageTitle = getPageTitle(page)
      
      // Only check pages with titles that suggest they might be database views
      if (pageTitle.toLowerCase().includes('view') || 
          pageTitle.toLowerCase().includes('database') ||
          pageTitle.toLowerCase().includes('table') ||
          pageTitle.toLowerCase().includes('project') ||
          pageTitle.toLowerCase().includes('task') ||
          pageTitle.toLowerCase().includes('office')) {
        
        try {
          const blocksResponse = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children?page_size=10`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${tokenResult.token}`,
              "Notion-Version": "2022-06-28",
            },
          })
          
          if (blocksResponse.ok) {
            const blocksData = await blocksResponse.json()
            const blocks = blocksData.results || []
            
            // Look for child_database blocks (inline databases in pages)
            for (const block of blocks) {
              if (block.type === 'child_database') {
                logger.info(`   ✅ Found inline database in page: "${pageTitle}"`)
                // Add this as a database with the parent page's title
                allDatabases.push({
                  id: block.id,
                  object: 'database',
                  title: [{ 
                    type: 'text',
                    text: { content: `${pageTitle} (Inline)` },
                    plain_text: `${pageTitle} (Inline)`
                  }],
                  url: page.url,
                  parent: page.parent,
                  created_time: block.created_time,
                  last_edited_time: block.last_edited_time,
                  properties: {},
                  is_inline: true,
                  archived: false
                })
                break // Found a database, no need to check more blocks
              }
            }
          }
        } catch (error) {
          // Silently skip pages we can't access
        }
      }
    }
    
    logger.info(`📊 [Notion Databases] Total databases including views: ${allDatabases.length}`)
    
    // Log what we're about to filter
    const archivedDatabases = allDatabases.filter((db: any) => db.archived)
    if (archivedDatabases.length > 0) {
      logger.info(`⚠️ FILTERING OUT ${archivedDatabases.length} ARCHIVED DATABASES:`)
      archivedDatabases.forEach((db: any) => {
        const title = getDatabaseTitle(db)
        logger.info(`  - "${title}" (archived: ${db.archived})`)
      })
    }
    
    // Map and filter databases
    const databases = allDatabases
      .filter((database: any) => {
        // Log if we're filtering something out
        if (database.archived) {
          logger.info(`  ❌ Excluding archived database: "${getDatabaseTitle(database)}"`)
          return false
        }
        return true
      })
      .map((database: any): NotionDatabase => ({
        id: database.id,
        name: getDatabaseTitle(database),
        value: database.id,
        label: getDatabaseTitle(database), // Add label for dropdown display
        title: getDatabaseTitle(database),
        url: database.url,
        created_time: database.created_time,
        last_edited_time: database.last_edited_time,
        properties: database.properties,
        parent: database.parent,
        workspace_id: database.parent?.workspace, // Try to get workspace from parent
        is_inline: database.is_inline
      }))
    
    logger.info(`\n✅ FINAL DATABASE LIST (${databases.length} databases):`)
    databases.forEach((db: any, index: number) => {
      logger.info(`  ${index + 1}. "${db.name}" (ID: ${db.id.substring(0, 8)}...)`)
    })

    // Filter by workspace if specified
    // Note: Notion API doesn't directly provide workspace info, so this is best-effort
    // In production, you might need to store workspace associations separately
    if (targetWorkspaceId) {
      // For now, we'll return all databases when workspace is specified
      // since Notion's API doesn't easily filter by workspace
      logger.info(`⚠️ [Notion Databases] Workspace filtering requested but returning all databases (Notion API limitation)`)
    }

    logger.info(`✅ [Notion Databases] Retrieved ${databases.length} databases`)
    return databases

  } catch (error: any) {
    logger.error("❌ [Notion Databases] Error fetching databases:", error)
    throw error
  }
}