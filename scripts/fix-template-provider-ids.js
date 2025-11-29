#!/usr/bin/env node

/**
 * Fix missing providerId on all template nodes
 * Run with: node scripts/fix-template-provider-ids.js
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Extract providerId from node type
function extractProviderId(nodeType) {
  if (!nodeType) return null

  // Handle system nodes that don't have providers
  const systemNodes = ['ai_agent', 'if_condition', 'delay', 'loop', 'switch', 'webhook', 'schedule', 'manual']
  if (systemNodes.includes(nodeType)) {
    return null // System nodes don't have providers
  }

  // Extract provider from type patterns:
  // gmail_trigger_new_email -> gmail
  // slack_action_send_message -> slack
  // airtable_action_create_record -> airtable
  // discord_trigger_new_message -> discord

  // Split by underscore and take the first part
  const parts = nodeType.split('_')
  if (parts.length > 0) {
    const provider = parts[0]

    // Map common provider names
    const providerMap = {
      'gmail': 'gmail',
      'slack': 'slack',
      'discord': 'discord',
      'airtable': 'airtable',
      'notion': 'notion',
      'trello': 'trello',
      'asana': 'asana',
      'hubspot': 'hubspot',
      'stripe': 'stripe',
      'shopify': 'shopify',
      'calendar': 'google-calendar',
      'drive': 'google-drive',
      'sheets': 'google-sheets',
      'onedrive': 'onedrive',
      'onenote': 'microsoft-onenote',
      'teams': 'microsoft-teams',
      'outlook': 'outlook',
      'twitter': 'twitter',
      'linkedin': 'linkedin',
      'facebook': 'facebook',
      'instagram': 'instagram'
    }

    return providerMap[provider] || provider
  }

  return null
}

async function fixTemplate(templateId, dryRun = false) {
  console.log(`\n🔍 Fetching template ${templateId}...`)

  const { data: template, error: fetchError } = await supabase
    .from('templates')
    .select('id, name, nodes')
    .eq('id', templateId)
    .single()

  if (fetchError || !template) {
    console.error('❌ Error fetching template:', fetchError)
    return
  }

  console.log(`📦 Template: ${template.name}`)

  if (!template.nodes || !Array.isArray(template.nodes)) {
    console.log('⏭️  No nodes array found')
    return
  }

  let needsUpdate = false
  const updatedNodes = template.nodes.map(node => {
    const nodeType = node.data?.type
    const currentProviderId = node.data?.providerId

    // Skip if already has a providerId
    if (currentProviderId) {
      return node
    }

    // Extract providerId from node type
    const providerId = extractProviderId(nodeType)

    if (providerId) {
      console.log(`📍 ${node.data?.title || node.id}`)
      console.log(`   Type: ${nodeType}`)
      console.log(`   Adding providerId: ${providerId}`)
      needsUpdate = true

      return {
        ...node,
        data: {
          ...node.data,
          providerId
        }
      }
    }

    return node
  })

  if (!needsUpdate) {
    console.log('\n✅ All nodes already have providerId or are system nodes')
    return
  }

  if (dryRun) {
    console.log('\n🔍 DRY RUN - No changes made')
    console.log('Run without --dry-run flag to apply changes')
    return
  }

  console.log('\n💾 Updating template...')

  const { error: updateError } = await supabase
    .from('templates')
    .update({ nodes: updatedNodes })
    .eq('id', template.id)

  if (updateError) {
    console.error('❌ Error updating template:', updateError)
    return
  }

  console.log('✅ Template updated successfully!')
}

async function fixAllTemplates() {
  const dryRun = process.argv.includes('--dry-run')

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n')
  }

  console.log('🔍 Fetching all templates...')

  const { data: templates, error: fetchError } = await supabase
    .from('templates')
    .select('id, name')

  if (fetchError) {
    console.error('❌ Error fetching templates:', fetchError)
    process.exit(1)
  }

  console.log(`📦 Found ${templates.length} templates\n`)

  for (const template of templates) {
    await fixTemplate(template.id, dryRun)
  }

  console.log('\n✅ All templates processed!')
}

// Get template ID from command line args or process all
const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'))
const templateId = args.length > 0 ? args[0] : null

if (templateId) {
  const dryRun = process.argv.includes('--dry-run')
  fixTemplate(templateId, dryRun).catch(error => {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  })
} else {
  fixAllTemplates().catch(error => {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  })
}
