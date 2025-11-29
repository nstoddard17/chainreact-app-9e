/**
 * Utility to fix workflow nodes that have missing data.type for triggers
 * This can happen with workflows created before proper node type saving was implemented
 */

import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

// Lazy-load Supabase client to avoid build-time env var requirement
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.warn('[WorkflowTriggerFix] Supabase credentials are not configured; skipping fix')
    return null
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// Map of known trigger types based on their properties
const TRIGGER_TYPE_MAPPING: Record<string, { providerId: string, type: string }> = {
  // Slack triggers
  'New Message in Channel': { providerId: 'slack', type: 'slack_trigger_message_channels' },
  'New message in public channel': { providerId: 'slack', type: 'slack_trigger_message_channels' },
  'New Message': { providerId: 'slack', type: 'slack_trigger_new_message' },
  'Reaction Added': { providerId: 'slack', type: 'slack_trigger_reaction_added' },

  // OneDrive triggers
  'New file or folder': { providerId: 'onedrive', type: 'onedrive_trigger_new_file' },
  'File modified': { providerId: 'onedrive', type: 'onedrive_trigger_file_modified' },
  'File Modified in Folder': { providerId: 'onedrive', type: 'onedrive_trigger_file_modified' },

  // Gmail triggers
  'New Email': { providerId: 'gmail', type: 'gmail_trigger_new_email' },
  'New Attachment': { providerId: 'gmail', type: 'gmail_trigger_new_attachment' },

  // Discord triggers
  'New Message': { providerId: 'discord', type: 'discord_trigger_new_message' },
  'New Member': { providerId: 'discord', type: 'discord_trigger_member_join' },
  'Reaction Added': { providerId: 'discord', type: 'discord_trigger_reaction_add' },
  'Voice State Update': { providerId: 'discord', type: 'discord_trigger_voice_state_update' },

  // Add more trigger mappings as needed
}

export async function fixWorkflowTriggerNodes(workflowId?: string) {
  try {
    logger.debug('🔧 Starting workflow trigger node fix...')

    const supabase = getSupabaseClient()
    if (!supabase) {
      return { success: false, error: 'Supabase credentials are not configured' }
    }

    // Get workflows to fix
    let query = supabase.from('workflows').select('id, name, nodes')
    if (workflowId) {
      query = query.eq('id', workflowId)
    }

    const { data: workflows, error } = await query

    if (error) {
      logger.error('Error fetching workflows:', error)
      return { success: false, error }
    }

    if (!workflows || workflows.length === 0) {
      logger.debug('No workflows found')
      return { success: true, fixed: 0 }
    }

    let fixedCount = 0
    const results: any[] = []

    for (const workflow of workflows) {
      let nodes: any[]
      try {
        nodes = typeof workflow.nodes === 'string' ? JSON.parse(workflow.nodes) : workflow.nodes || []
      } catch (e) {
        logger.error(`Failed to parse nodes for workflow ${workflow.id}:`, e)
        continue
      }

      let modified = false

      // Check each node
      const updatedNodes = nodes.map((node: any) => {
        // Skip if not a trigger node
        if (!node?.data?.isTrigger) {
          return node
        }

        // Skip if already has proper type
        if (node.data.type && node.data.type !== 'custom') {
          return node
        }

        // Try to determine the correct type
        const title = node.data.title || node.data.label || ''
        const providerId = node.data.providerId

        // Look up the correct type based on title
        const mapping = TRIGGER_TYPE_MAPPING[title]

        if (mapping) {
          logger.debug(`  🔧 Fixing trigger node in workflow "${workflow.name}":`)
          logger.debug(`     Title: ${title}`)
          logger.debug(`     Old type: ${node.data.type || 'undefined'}`)
          logger.debug(`     New type: ${mapping.type}`)

          // Fix the node
          node.data.type = mapping.type
          if (!node.data.providerId && mapping.providerId) {
            node.data.providerId = mapping.providerId
          }

          modified = true
        } else if (providerId && title) {
          // Try to guess the type based on provider and title
          let guessedType = ''

          if (title.toLowerCase().includes('new') && title.toLowerCase().includes('message')) {
            guessedType = `${providerId}_trigger_new_message`
          } else if (title.toLowerCase().includes('new') && title.toLowerCase().includes('file')) {
            guessedType = `${providerId}_trigger_new_file`
          } else if (title.toLowerCase().includes('modified')) {
            guessedType = `${providerId}_trigger_file_modified`
          }

          if (guessedType) {
            logger.debug(`  🔧 Guessing type for trigger in workflow "${workflow.name}":`)
            logger.debug(`     Title: ${title}`)
            logger.debug(`     Provider: ${providerId}`)
            logger.debug(`     Guessed type: ${guessedType}`)

            node.data.type = guessedType
            modified = true
          } else {
            logger.warn(`  ⚠️ Could not determine type for trigger node:`, {
              workflowName: workflow.name,
              title,
              providerId
            })
          }
        }

        return node
      })

      // Save the updated workflow if modified
      if (modified) {
        const { error: updateError } = await supabase
          .from('workflows')
          .update({ nodes: JSON.stringify(updatedNodes) })
          .eq('id', workflow.id)

        if (updateError) {
          logger.error(`Failed to update workflow ${workflow.id}:`, updateError)
          results.push({ workflowId: workflow.id, name: workflow.name, success: false, error: updateError })
        } else {
          logger.debug(`  ✅ Fixed workflow: ${workflow.name}`)
          fixedCount++
          results.push({ workflowId: workflow.id, name: workflow.name, success: true })
        }
      }
    }

    logger.debug(`\n✅ Fixed ${fixedCount} workflows`)

    return {
      success: true,
      fixed: fixedCount,
      total: workflows.length,
      results
    }

  } catch (error) {
    logger.error('Error fixing workflow trigger nodes:', error)
    return { success: false, error }
  }
}

// CLI usage
if (require.main === module) {
  const workflowId = process.argv[2]
  fixWorkflowTriggerNodes(workflowId).then(result => {
    logger.debug('\n📊 Fix Results:', JSON.stringify(result, null, 2))
    process.exit(result.success ? 0 : 1)
  })
}
