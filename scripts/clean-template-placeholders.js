#!/usr/bin/env node

/**
 * Clean up placeholder nodes (addAction, insertAction) from all templates
 * Run with: node scripts/clean-template-placeholders.js
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

async function cleanTemplates() {
  console.log('🔍 Fetching all templates...')

  // Get all templates
  const { data: templates, error: fetchError } = await supabase
    .from('templates')
    .select('id, name, nodes')

  if (fetchError) {
    console.error('❌ Error fetching templates:', fetchError)
    process.exit(1)
  }

  console.log(`📦 Found ${templates.length} templates`)

  let cleanedCount = 0
  let nodesRemovedTotal = 0

  // Process each template
  for (const template of templates) {
    if (!template.nodes || !Array.isArray(template.nodes)) {
      console.log(`⏭️  Skipping ${template.name} - no nodes array`)
      continue
    }

    // Filter out placeholder nodes
    const filteredNodes = template.nodes.filter(node => {
      const nodeType = node.data?.type || node.type
      const hasAddButton = node.data?.hasAddButton
      const isPlaceholder = node.data?.isPlaceholder

      // Remove addAction, insertAction, and chain placeholder nodes
      return nodeType !== 'addAction'
        && nodeType !== 'insertAction'
        && nodeType !== 'chain_placeholder'
        && !hasAddButton
        && !isPlaceholder
    })

    const nodesRemoved = template.nodes.length - filteredNodes.length

    if (nodesRemoved > 0) {
      console.log(`🧹 Cleaning "${template.name}": removing ${nodesRemoved} placeholder node(s)`)

      // Update the template
      const { error: updateError } = await supabase
        .from('templates')
        .update({ nodes: filteredNodes })
        .eq('id', template.id)

      if (updateError) {
        console.error(`❌ Error updating template ${template.name}:`, updateError)
      } else {
        cleanedCount++
        nodesRemovedTotal += nodesRemoved
      }
    }
  }

  console.log(`\n✅ Cleanup complete!`)
  console.log(`   Templates cleaned: ${cleanedCount}`)
  console.log(`   Total placeholder nodes removed: ${nodesRemovedTotal}`)
}

cleanTemplates().catch(error => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
