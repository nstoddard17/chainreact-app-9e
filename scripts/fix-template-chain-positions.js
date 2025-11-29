#!/usr/bin/env node

/**
 * Fix chain node positions in templates so they're properly staggered vertically
 * Run with: node scripts/fix-template-chain-positions.js
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

// Vertical spacing between chain nodes (220px gives more room for inserting actions)
const VERTICAL_SPACING = 220

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

  // Group chain nodes by their parentChainIndex
  const chainNodesByIndex = new Map()

  template.nodes.forEach(node => {
    if (node.data?.isAIAgentChild || node.data?.parentAIAgentId) {
      const chainIndex = node.data.parentChainIndex ?? 0
      if (!chainNodesByIndex.has(chainIndex)) {
        chainNodesByIndex.set(chainIndex, [])
      }
      chainNodesByIndex.get(chainIndex).push(node)
    }
  })

  if (chainNodesByIndex.size === 0) {
    console.log('⏭️  No chain nodes found')
    return
  }

  console.log(`\n📊 Found ${chainNodesByIndex.size} chains`)

  let needsUpdate = false
  const updatedNodes = template.nodes.map(node => {
    // Skip non-chain nodes
    if (!node.data?.isAIAgentChild && !node.data?.parentAIAgentId) {
      return node
    }

    const chainIndex = node.data.parentChainIndex ?? 0
    const chainNodes = chainNodesByIndex.get(chainIndex)

    // Sort chain nodes by current Y position, then by ID for consistency
    chainNodes.sort((a, b) => {
      const yDiff = (a.position?.y || 0) - (b.position?.y || 0)
      if (yDiff !== 0) return yDiff
      return a.id.localeCompare(b.id)
    })

    // Find this node's position in the sorted chain
    const nodeIndex = chainNodes.findIndex(n => n.id === node.id)

    if (nodeIndex === -1) {
      console.warn(`⚠️  Could not find node ${node.id} in its chain`)
      return node
    }

    // Calculate expected Y position based on index in chain
    // First node in chain stays at its current Y, others are spaced below
    const firstNodeY = chainNodes[0].position?.y || 0
    const expectedY = firstNodeY + (nodeIndex * VERTICAL_SPACING)
    const currentY = node.position?.y || 0

    // Check if position needs updating
    if (currentY !== expectedY) {
      console.log(`📍 Chain ${chainIndex}, Node ${nodeIndex}: ${node.data?.title}`)
      console.log(`   Current Y: ${currentY} → Expected Y: ${expectedY}`)
      needsUpdate = true

      return {
        ...node,
        position: {
          ...node.position,
          y: expectedY
        }
      }
    }

    return node
  })

  if (!needsUpdate) {
    console.log('\n✅ All chain nodes are already correctly positioned')
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
