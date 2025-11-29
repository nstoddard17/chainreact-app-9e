/**
 * Fix Template Node Positions
 *
 * Updates all template node positions to follow the standard layout:
 * - First node (trigger): x: 400, y: 100
 * - Vertical spacing: 180px between nodes
 * - Branch spacing: 400px horizontal
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Standard positioning constants
const START_X = 600 // Center for single path
const START_Y = 100
const VERTICAL_SPACING = 180
const BRANCH_OFFSET = 400

/**
 * Calculate new positions for template nodes
 */
function calculateNodePositions(nodes, connections) {
  if (!nodes || nodes.length === 0) return nodes

  const updatedNodes = JSON.parse(JSON.stringify(nodes))
  const nodeMap = new Map(updatedNodes.map(n => [n.id, n]))

  // Build adjacency list
  const childrenMap = new Map()
  connections.forEach(conn => {
    if (!childrenMap.has(conn.source)) {
      childrenMap.set(conn.source, [])
    }
    childrenMap.get(conn.source).push(conn.target)
  })

  // Find root node (trigger or node with no incoming connections)
  const targetIds = new Set(connections.map(c => c.target))
  const rootNode = updatedNodes.find(n =>
    !targetIds.has(n.id) || n.data?.isTrigger === true
  ) || updatedNodes[0]

  // Position nodes using BFS
  const positioned = new Set()
  const queue = [{ nodeId: rootNode.id, x: START_X, y: START_Y, depth: 0 }]

  while (queue.length > 0) {
    const { nodeId, x, y, depth } = queue.shift()

    if (positioned.has(nodeId)) continue
    positioned.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (node) {
      node.position = { x, y }
    }

    // Get children
    const children = childrenMap.get(nodeId) || []

    if (children.length === 0) {
      // No children, continue
    } else if (children.length === 1) {
      // Single child - straight down
      queue.push({
        nodeId: children[0],
        x: x,
        y: y + VERTICAL_SPACING,
        depth: depth + 1
      })
    } else {
      // Multiple children - branch horizontally
      const totalWidth = (children.length - 1) * BRANCH_OFFSET
      const startX = x - (totalWidth / 2)

      children.forEach((childId, index) => {
        queue.push({
          nodeId: childId,
          x: startX + (index * BRANCH_OFFSET),
          y: y + VERTICAL_SPACING,
          depth: depth + 1
        })
      })
    }
  }

  return updatedNodes
}

/**
 * Main function to fix all templates
 */
async function fixTemplatePositions() {
  try {
    console.log('🔍 Fetching templates from Supabase...\n')

    // Fetch all templates
    const { data: templates, error } = await supabase
      .from('templates')
      .select('*')
      .eq('is_public', true)

    if (error) {
      console.error('❌ Error fetching templates:', error)
      process.exit(1)
    }

    if (!templates || templates.length === 0) {
      console.log('ℹ️  No templates found')
      return
    }

    console.log(`📋 Found ${templates.length} templates\n`)

    let updated = 0
    let skipped = 0

    for (const template of templates) {
      const { id, name, nodes, connections } = template

      if (!nodes || nodes.length === 0) {
        console.log(`⏭️  Skipping "${name}" (no nodes)`)
        skipped++
        continue
      }

      if (!connections || connections.length === 0) {
        console.log(`⏭️  Skipping "${name}" (no connections)`)
        skipped++
        continue
      }

      console.log(`🔧 Updating "${name}"...`)

      // Calculate new positions
      const updatedNodes = calculateNodePositions(nodes, connections)

      // Update template in database
      const { error: updateError } = await supabase
        .from('templates')
        .update({ nodes: updatedNodes })
        .eq('id', id)

      if (updateError) {
        console.error(`   ❌ Error updating: ${updateError.message}`)
        continue
      }

      console.log(`   ✅ Updated ${updatedNodes.length} nodes`)
      updated++
    }

    console.log(`\n✨ Complete!`)
    console.log(`   Updated: ${updated}`)
    console.log(`   Skipped: ${skipped}`)
    console.log(`   Total: ${templates.length}`)

  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  }
}

// Run the script
fixTemplatePositions()
