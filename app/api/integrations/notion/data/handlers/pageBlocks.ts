/**
 * Notion Page Blocks Handler
 * Fetches all blocks from a page with their properties and structure
 */

import { NotionIntegration, NotionDataHandler } from '../types'
import { validateNotionIntegration, validateNotionToken } from '../utils'

interface BlockProperty {
  id: string
  type: string
  label: string
  value?: any
  options?: Array<{ value: string; label: string; color?: string }>
  required?: boolean
  disabled?: boolean
  placeholder?: string
  embedType?: string
  items?: Array<{ id: string; content: string; checked: boolean }>
}

interface PageBlock {
  id: string
  type: string
  properties: BlockProperty[]
  hasChildren: boolean
  content?: any
}

/**
 * Fetch all blocks from a Notion page with their properties
 */
export const getNotionPageBlocks: NotionDataHandler<PageBlock> = async (
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
    // Notion accepts both formats but let's use the dashless format
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

    console.log("🔍 [Notion Page Blocks] Fetching blocks for page:", pageId)
    console.log("📋 [Notion Page Blocks] Using workspace:", targetWorkspaceId)
    console.log("🔑 [Notion Page Blocks] Original page ID:", options?.pageId)

    // First, check if this is a database page to get properties
    let pageProperties: any = {}
    let databaseSchema: any = null
    let isDatabasePage = false
    
    try {
      // Try to get the page to see if it has properties
      const pageResponse = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenResult.token}`,
          "Notion-Version": "2022-06-28",
        },
      })

      if (pageResponse.ok) {
        const pageData = await pageResponse.json()
        if (pageData.properties) {
          isDatabasePage = true
          pageProperties = pageData.properties
          console.log("📊 [Notion Page Blocks] Page has database properties:", Object.keys(pageProperties))
          
          // If this is a database page, fetch the database schema to get property configurations
          if (pageData.parent?.type === 'database_id') {
            const databaseId = pageData.parent.database_id
            console.log("🗄️ [Notion Page Blocks] Fetching database schema for:", databaseId)
            
            const dbResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
              method: "GET",
              headers: {
                Authorization: `Bearer ${tokenResult.token}`,
                "Notion-Version": "2022-06-28",
              },
            })
            
            if (dbResponse.ok) {
              const dbData = await dbResponse.json()
              databaseSchema = dbData.properties
              console.log("✅ [Notion Page Blocks] Got database schema with properties:", Object.keys(databaseSchema))
            }
          }
        }
      } else if (pageResponse.status === 404 || pageResponse.status === 403) {
        const errorData = await pageResponse.json().catch(() => ({}))
        console.error("❌ [Notion Page Blocks] Access denied:", {
          status: pageResponse.status,
          pageId: pageId,
          originalPageId: options?.pageId,
          workspace: targetWorkspaceId,
          error: errorData
        })
        
        // More helpful error message for permission issues
        throw new Error(
          `Cannot access this Notion page (ID: ${options?.pageId?.substring(0, 8)}...).\n\n` +
          "Please ensure:\n" +
          "1. The page is shared with your Notion integration\n" +
          "2. You have selected the correct workspace\n" +
          "3. The page still exists and hasn't been deleted\n\n" +
          "To share a page with your integration in Notion:\n" +
          "• Open the page in Notion\n" +
          "• Click Share or '...' menu → Connections\n" +
          "• Search for and add your integration\n" +
          "• The integration needs at least 'Read content' permission"
        )
      }
    } catch (error: any) {
      // Re-throw if it's our custom error
      if (error.message?.includes("Cannot access")) {
        throw error
      }
      console.log("⚠️ [Notion Page Blocks] Could not fetch page properties:", error)
    }

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
      
      // Provide more helpful error messages based on status
      if (blocksResponse.status === 404 || errorData.message?.includes("Could not find")) {
        throw new Error(
          "Cannot access blocks for this page. Please ensure:\n" +
          "1. The page is shared with your Notion integration\n" +
          "2. You have selected the correct workspace\n" +
          "3. The page still exists and hasn't been deleted\n\n" +
          "To share a page with your integration:\n" +
          "• Open the page in Notion\n" +
          "• Click the '...' menu or Share button\n" +
          "• Search for your integration name and add it"
        )
      }
      
      throw new Error(`Failed to fetch blocks: ${errorData.message || blocksResponse.statusText}`)
    }

    const blocksData = await blocksResponse.json()
    const blocks = blocksData.results || []
    
    console.log(`📦 [Notion Page Blocks] Found ${blocks.length} blocks`)

    // Transform blocks into our format
    const transformedBlocks: PageBlock[] = []
    
    // First, add regular content blocks
    let currentSection = null
    const todoBlocks: any[] = [] // Collect all to-do blocks
    
    for (const block of blocks) {
      const blockProperties: BlockProperty[] = []
      
      // Extract content based on block type
      let content = ''
      const blockType = block.type
      
      // Check if this is a heading that marks a special section
      if (blockType === 'heading_3' && block.heading_3?.rich_text) {
        const headingText = block.heading_3.rich_text.map((t: any) => t.plain_text).join('')
        if (headingText.toLowerCase() === 'documents') {
          currentSection = 'documents'
          // Add special document embedding section
          transformedBlocks.push({
            id: `${block.id}-documents-section`,
            type: 'document_embedding_section',
            properties: [
              {
                id: `${block.id}-google-drive`,
                type: 'document_embed',
                label: 'Google Drive Document',
                embedType: 'google_drive',
                placeholder: 'Search for a file or paste Google Drive URL',
                value: ''
              },
              {
                id: `${block.id}-pdf`,
                type: 'document_embed', 
                label: 'PDF Document',
                embedType: 'pdf',
                placeholder: 'Upload PDF or paste URL',
                value: ''
              },
              {
                id: `${block.id}-figma`,
                type: 'document_embed',
                label: 'Figma Design',
                embedType: 'figma',
                placeholder: 'Paste Figma URL',
                value: ''
              }
            ],
            hasChildren: false
          })
          continue // Skip adding the heading itself
        }
      }
      
      if (block[blockType]) {
        // Handle text content
        if (block[blockType].rich_text) {
          content = block[blockType].rich_text.map((t: any) => t.plain_text).join('')
          blockProperties.push({
            id: `${block.id}-content`,
            blockId: block.id,  // Preserve the actual Notion block ID
            type: 'text',
            label: 'Content',
            value: content
          })
        }
        
        // Handle to-do blocks specially - collect them for grouping
        if (blockType === 'to_do') {
          todoBlocks.push({
            id: block.id,
            content: content,
            checked: block.to_do.checked || false,
            originalBlock: block
          })
          continue // Don't add individually, we'll group them
        }
        
        if (blockType === 'code') {
          blockProperties.push({
            id: `${block.id}-language`,
            type: 'select',
            label: 'Language',
            value: block.code.language || 'plain text',
            options: [
              { value: 'javascript', label: 'JavaScript' },
              { value: 'python', label: 'Python' },
              { value: 'typescript', label: 'TypeScript' },
              { value: 'html', label: 'HTML' },
              { value: 'css', label: 'CSS' },
              { value: 'plain text', label: 'Plain Text' }
            ]
          })
        }
      }

      // Handle file attachments specially
      if (blockType === 'file' || blockType === 'pdf' || blockType === 'image') {
        blockProperties.push({
          id: `${block.id}-file`,
          type: 'file_attachment',
          label: 'File Attachment',
          value: block[blockType]?.file?.url || block[blockType]?.external?.url || '',
          placeholder: 'Upload file or paste URL',
        })
      }
      
      // Only add blocks that have properties
      if (blockProperties.length > 0) {
        transformedBlocks.push({
          id: block.id,
          type: blockType,
          properties: blockProperties,
          hasChildren: block.has_children || false,
          content: block
        })
      }
    }
    
    // Add grouped to-do section if there are any to-dos
    if (todoBlocks.length > 0) {
      transformedBlocks.push({
        id: 'todo-list-section',
        type: 'todo_list',
        properties: [{
          id: 'todo-items',
          type: 'todo_list_items',
          label: 'To-Do List',
          items: todoBlocks.map(todo => ({
            id: todo.id,
            blockId: todo.id,  // Preserve the actual Notion block ID
            content: todo.content,
            checked: todo.checked
          }))
        }],
        hasChildren: false
      })
    }

    // Then, add database properties as a separate section
    if (isDatabasePage && Object.keys(pageProperties).length > 0) {
      const primaryPropertyBlocks: BlockProperty[] = []  // Important properties
      const secondaryPropertyBlocks: BlockProperty[] = [] // Other properties
      
      // Define property types that are typically shown in the header
      const primaryPropertyTypes = ['status', 'select', 'people', 'date', 'multi_select']
      const primaryPropertyNames = ['status', 'assignee', 'priority', 'due date', 'category', 'tags', 'owner']
      
      for (const [propName, propData] of Object.entries(pageProperties) as any) {
        const property: BlockProperty = {
          id: propData.id,
          type: propData.type,
          label: propName,
        }

        // Handle different property types
        switch (propData.type) {
          case 'select':
            if (propData.select) {
              property.value = propData.select.name
            }
            // Get options from database schema if available
            if (databaseSchema && databaseSchema[propName]?.select?.options) {
              property.options = databaseSchema[propName].select.options.map((opt: any) => ({
                value: opt.name,
                label: opt.name,
                color: opt.color
              }))
            }
            property.type = 'select'
            break
            
          case 'multi_select':
            if (propData.multi_select) {
              property.value = propData.multi_select.map((item: any) => item.name)
            }
            // Get options from database schema if available
            if (databaseSchema && databaseSchema[propName]?.multi_select?.options) {
              property.options = databaseSchema[propName].multi_select.options.map((opt: any) => ({
                value: opt.name,
                label: opt.name,
                color: opt.color
              }))
            }
            property.type = 'multi_select'
            break
            
          case 'status':
            if (propData.status) {
              property.value = propData.status.name
            }
            // Get options from database schema if available
            if (databaseSchema && databaseSchema[propName]?.status?.options) {
              property.options = databaseSchema[propName].status.options.map((opt: any) => ({
                value: opt.name,
                label: opt.name,
                color: opt.color
              }))
            }
            property.type = 'select'
            break
            
          case 'people':
            if (propData.people && propData.people.length > 0) {
              property.value = propData.people.map((person: any) => person.name || person.id)
            }
            property.type = 'people'
            break
            
          case 'title':
            if (propData.title && propData.title.length > 0) {
              property.value = propData.title.map((t: any) => t.plain_text).join('')
            } else {
              property.value = '' // Empty title
            }
            property.type = 'text'
            property.required = true // Title is always required
            break
            
          case 'rich_text':
            if (propData.rich_text && propData.rich_text.length > 0) {
              property.value = propData.rich_text.map((t: any) => t.plain_text).join('')
            } else {
              property.value = ''
            }
            property.type = 'text'
            break
            
          case 'checkbox':
            property.value = propData.checkbox === true
            property.type = 'checkbox'
            break
            
          case 'number':
            property.value = propData.number !== null ? propData.number : ''
            property.type = 'number'
            break
            
          case 'date':
            if (propData.date?.start) {
              property.value = propData.date.start
            } else {
              property.value = ''
            }
            property.type = 'date'
            break
            
          case 'url':
            property.value = propData.url || ''
            property.type = 'url'
            break
            
          case 'email':
            property.value = propData.email || ''
            property.type = 'email'
            break
            
          case 'phone_number':
            property.value = propData.phone_number || ''
            property.type = 'text'
            break
            
          case 'files':
            if (propData.files && propData.files.length > 0) {
              property.value = propData.files.map((f: any) => f.name || f.external?.url || f.file?.url).join(', ')
            } else {
              property.value = ''
            }
            property.type = 'text'
            property.placeholder = 'File URLs (comma-separated)'
            break
            
          case 'formula':
            // Formulas are read-only, show computed value
            if (propData.formula) {
              const formula = propData.formula
              if (formula.type === 'string') {
                property.value = formula.string || ''
              } else if (formula.type === 'number') {
                property.value = formula.number !== null ? formula.number : ''
              } else if (formula.type === 'boolean') {
                property.value = formula.boolean === true
              } else if (formula.type === 'date' && formula.date) {
                property.value = formula.date.start || ''
              }
            } else {
              property.value = ''
            }
            property.type = property.value === true || property.value === false ? 'checkbox' : 'text'
            property.disabled = true // Formulas are read-only
            break
            
          case 'relation':
            if (propData.relation && propData.relation.length > 0) {
              // Relations show page IDs
              property.value = propData.relation.map((r: any) => r.id).join(', ')
            } else {
              property.value = ''
            }
            property.type = 'text'
            property.placeholder = 'Related page IDs (comma-separated)'
            break
            
          case 'rollup':
            // Rollups are read-only computed values
            if (propData.rollup) {
              const rollup = propData.rollup
              if (rollup.type === 'number') {
                property.value = rollup.number !== null ? rollup.number : ''
              } else if (rollup.type === 'array') {
                property.value = 'Multiple values'
              }
            } else {
              property.value = ''
            }
            property.type = 'text'
            property.disabled = true // Rollups are read-only
            break
            
          default:
            // For any other types, try to extract a reasonable value
            if (propData[propData.type]) {
              property.value = JSON.stringify(propData[propData.type])
            } else {
              property.value = ''
            }
            property.type = 'text'
            break
        }

        // Categorize property as primary or secondary
        const isPrimary = 
          primaryPropertyTypes.includes(propData.type) || 
          primaryPropertyNames.some(name => propName.toLowerCase().includes(name.toLowerCase())) ||
          propData.type === 'title' // Title is always primary
        
        if (isPrimary) {
          primaryPropertyBlocks.push(property)
        } else {
          secondaryPropertyBlocks.push(property)
        }
      }

      // Add primary properties first (typically shown in header)
      if (primaryPropertyBlocks.length > 0) {
        transformedBlocks.push({
          id: 'primary-properties',
          type: 'primary_properties',
          properties: primaryPropertyBlocks,
          hasChildren: false
        })
      }
      
      // Add secondary properties (other fields)
      if (secondaryPropertyBlocks.length > 0) {
        transformedBlocks.push({
          id: 'secondary-properties',
          type: 'secondary_properties',
          properties: secondaryPropertyBlocks,
          hasChildren: false
        })
      }
    }

    console.log(`✅ [Notion Page Blocks] Returning ${transformedBlocks.length} blocks`)
    return transformedBlocks

  } catch (error: any) {
    console.error("❌ [Notion Page Blocks] Error:", error.message)
    throw error
  }
}