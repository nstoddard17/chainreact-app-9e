/**
 * Utility to fix workflow nodes that have missing data.type for triggers
 * This can happen with workflows created before proper node type saving was implemented
 *
 * Updated to use normalized workflow_nodes table
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

    // Get trigger nodes from normalized table
    let query = supabase
      .from('workflow_nodes')
      .select('id, workflow_id, node_type, label, config, is_trigger, provider_id')
      .eq('is_trigger', true)

    if (workflowId) {
      query = query.eq('workflow_id', workflowId)
    }

    const { data: triggerNodes, error } = await query

    if (error) {
      logger.error('Error fetching trigger nodes:', error)
      return { success: false, error }
    }

    if (!triggerNodes || triggerNodes.length === 0) {
      logger.debug('No trigger nodes found')
      return { success: true, fixed: 0 }
    }

    let fixedCount = 0
    const results: any[] = []

    for (const node of triggerNodes) {
      // Skip if already has proper type
      if (node.node_type && node.node_type !== 'custom') {
        continue
      }

      // Try to determine the correct type
      const title = node.label || ''
      const providerId = node.provider_id

      // Look up the correct type based on title
      const mapping = TRIGGER_TYPE_MAPPING[title]

      let newType: string | null = null
      let newProviderId: string | null = null

      if (mapping) {
        logger.debug(`  🔧 Fixing trigger node ${node.id}:`)
        logger.debug(`     Title: ${title}`)
        logger.debug(`     Old type: ${node.node_type || 'undefined'}`)
        logger.debug(`     New type: ${mapping.type}`)

        newType = mapping.type
        if (!providerId && mapping.providerId) {
          newProviderId = mapping.providerId
        }
      } else if (providerId && title) {
        // Try to guess the type based on provider and title
        if (title.toLowerCase().includes('new') && title.toLowerCase().includes('message')) {
          newType = `${providerId}_trigger_new_message`
        } else if (title.toLowerCase().includes('new') && title.toLowerCase().includes('file')) {
          newType = `${providerId}_trigger_new_file`
        } else if (title.toLowerCase().includes('modified')) {
          newType = `${providerId}_trigger_file_modified`
        }

        if (newType) {
          logger.debug(`  🔧 Guessing type for trigger node ${node.id}:`)
          logger.debug(`     Title: ${title}`)
          logger.debug(`     Provider: ${providerId}`)
          logger.debug(`     Guessed type: ${newType}`)
        } else {
          logger.warn(`  ⚠️ Could not determine type for trigger node:`, {
            nodeId: node.id,
            workflowId: node.workflow_id,
            title,
            providerId
          })
        }
      }

      // Update the node if we determined a new type
      if (newType) {
        const updateData: any = { node_type: newType }
        if (newProviderId) {
          updateData.provider_id = newProviderId
        }

        const { error: updateError } = await supabase
          .from('workflow_nodes')
          .update(updateData)
          .eq('id', node.id)

        if (updateError) {
          logger.error(`Failed to update node ${node.id}:`, updateError)
          results.push({ nodeId: node.id, workflowId: node.workflow_id, success: false, error: updateError })
        } else {
          logger.debug(`  ✅ Fixed node: ${node.id}`)
          fixedCount++
          results.push({ nodeId: node.id, workflowId: node.workflow_id, success: true })
        }
      }
    }

    logger.debug(`\n✅ Fixed ${fixedCount} trigger nodes`)

    return {
      success: true,
      fixed: fixedCount,
      total: triggerNodes.length,
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
