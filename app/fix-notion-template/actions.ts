"use server"

import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

export async function fixNotionTemplate() {
  try {
    // Use service role client to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    logger.info('Fetching Smart Email Triage template...')

    // Fetch the template
    const { data: templates, error: fetchError } = await supabase
      .from("templates")
      .select("*")
      .ilike("name", "%Smart Email Triage%")
      .limit(1)

    if (fetchError) {
      logger.error('Failed to fetch template:', fetchError)
      return { success: false, error: `Failed to fetch template: ${fetchError.message}` }
    }

    if (!templates || templates.length === 0) {
      logger.error('Template not found')
      return { success: false, error: "Template not found" }
    }

    const template = templates[0]
    logger.info('Found template:', template.id, template.name)

    const nodes = template.nodes || []
    const connections = template.connections || []

    logger.info('Total nodes:', nodes.length)

    // Find the Notion node
    const notionNode = nodes.find((n: any) => n.id === 'chain-3-notion')
    if (notionNode) {
      logger.info('Found Notion node:', notionNode.id)
      logger.info('Current needsConfiguration:', notionNode.data?.needsConfiguration)
      logger.info('Current type:', notionNode.data?.type)
    } else {
      logger.info('Notion node not found!')
    }

    // Fix the Notion node
    const updatedNodes = nodes.map((node: any) => {
      if (node.id === 'chain-3-notion') {
        logger.info('✅ Fixing Notion node - adding needsConfiguration: true and type: notion_action_create_page')
        return {
          ...node,
          type: 'custom',
          data: {
            ...node.data,
            type: 'notion_action_create_page',
            needsConfiguration: true
          }
        }
      }
      return node
    })

    logger.info('Updating template in database...')

    // Update the template
    const { data: updated, error: updateError } = await supabase
      .from("templates")
      .update({
        nodes: updatedNodes,
        connections,
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id)
      .select()

    if (updateError) {
      logger.error('Failed to update template:', updateError)
      return { success: false, error: `Failed to update template: ${updateError.message}` }
    }

    logger.info('✅ Template updated successfully!')

    return {
      success: true,
      message: "Template fixed successfully! The Notion node now has needsConfiguration: true"
    }
  } catch (error: any) {
    logger.error("Error fixing template:", error)
    return { success: false, error: error.message || "Unknown error" }
  }
}
