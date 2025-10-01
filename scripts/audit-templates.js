#!/usr/bin/env node

/**
 * Audit all templates to see their structure
 * Run with: node scripts/audit-templates.js
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function auditTemplates() {
  const { data: templates, error } = await supabase
    .from('templates')
    .select('id, name, category, nodes, connections')
    .order('name')

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  console.log('=== TEMPLATE STRUCTURE AUDIT ===\n')

  templates.forEach((template, idx) => {
    console.log(`${idx + 1}. ${template.name}`)
    console.log(`   Category: ${template.category}`)

    const trigger = template.nodes.find(n => n.data?.isTrigger)
    console.log(`   Trigger: ${trigger?.data?.title || trigger?.data?.type || 'MISSING'}`)

    const aiAgent = template.nodes.find(n => n.data?.type === 'ai_agent')
    if (aiAgent) {
      console.log(`   Has AI Agent: Yes (${aiAgent.data?.title || 'Untitled'})`)
      const chainNodes = template.nodes.filter(n => n.data?.parentAIAgentId)
      const chains = [...new Set(chainNodes.map(n => n.data?.parentChainIndex ?? 0))]
      console.log(`   Number of chains: ${chains.length}`)
      chains.sort((a, b) => a - b).forEach(chainIdx => {
        const nodesInChain = chainNodes.filter(n => (n.data?.parentChainIndex ?? 0) === chainIdx)
        nodesInChain.sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0))
        console.log(`     Chain ${chainIdx}: ${nodesInChain.map(n => n.data?.title).join(' → ')}`)
      })
    } else {
      console.log(`   Has AI Agent: No`)
      const actions = template.nodes.filter(n => !n.data?.isTrigger)
      if (actions.length > 0) {
        console.log(`   Actions: ${actions.map(n => n.data?.title).join(', ')}`)
      }
    }

    console.log(`   Total nodes: ${template.nodes.length}`)
    console.log(`   Total connections: ${template.connections?.length || 0}`)
    console.log('')
  })

  console.log('\n=== ISSUES TO FIX ===\n')

  templates.forEach((template, idx) => {
    const issues = []

    // Check for missing trigger
    const trigger = template.nodes.find(n => n.data?.isTrigger)
    if (!trigger) {
      issues.push('Missing trigger node')
    }

    // Check for nodes with undefined providerId
    const nodesWithoutProvider = template.nodes.filter(n => {
      const type = n.data?.type
      if (!type) return false
      // System nodes don't need providers
      if (type === 'ai_agent' || type === 'if_condition' || type === 'delay') return false
      return n.data?.providerId === undefined
    })

    if (nodesWithoutProvider.length > 0) {
      issues.push(`${nodesWithoutProvider.length} nodes missing providerId`)
    }

    // Check for disconnected nodes (nodes not in connections)
    const connectedNodeIds = new Set()
    template.connections?.forEach(conn => {
      connectedNodeIds.add(conn.source)
      connectedNodeIds.add(conn.target)
    })

    const disconnectedNodes = template.nodes.filter(n => {
      // AI Agent chain nodes are connected via parentAIAgentId
      if (n.data?.parentAIAgentId) return false
      return !connectedNodeIds.has(n.id)
    })

    if (disconnectedNodes.length > 0) {
      issues.push(`${disconnectedNodes.length} disconnected nodes`)
    }

    if (issues.length > 0) {
      console.log(`❌ ${template.name}:`)
      issues.forEach(issue => console.log(`   - ${issue}`))
      console.log('')
    }
  })
}

auditTemplates().catch(error => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
