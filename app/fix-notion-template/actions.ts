"use server"

import { createClient } from '@supabase/supabase-js'

export async function fixNotionTemplate() {
  try {
    // Use service role client to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('Fetching Smart Email Triage template...')

    // Fetch the template
    const { data: templates, error: fetchError } = await supabase
      .from("templates")
      .select("*")
      .ilike("name", "%Smart Email Triage%")
      .limit(1)

    if (fetchError) {
      console.error('Failed to fetch template:', fetchError)
      return { success: false, error: `Failed to fetch template: ${fetchError.message}` }
    }

    if (!templates || templates.length === 0) {
      console.error('Template not found')
      return { success: false, error: "Template not found" }
    }

    const template = templates[0]
    console.log('Found template:', template.id, template.name)

    const nodes = template.nodes || []
    const connections = template.connections || []

    console.log('Total nodes:', nodes.length)

    // Find the Notion node
    const notionNode = nodes.find((n: any) => n.id === 'chain-3-notion')
    if (notionNode) {
      console.log('Found Notion node:', notionNode.id)
      console.log('Current needsConfiguration:', notionNode.data?.needsConfiguration)
      console.log('Current type:', notionNode.data?.type)
    } else {
      console.log('Notion node not found!')
    }

    // Fix the Notion node
    const updatedNodes = nodes.map((node: any) => {
      if (node.id === 'chain-3-notion') {
        console.log('✅ Fixing Notion node - adding needsConfiguration: true and type: notion_action_create_page')
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

    console.log('Updating template in database...')

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
      console.error('Failed to update template:', updateError)
      return { success: false, error: `Failed to update template: ${updateError.message}` }
    }

    console.log('✅ Template updated successfully!')

    return {
      success: true,
      message: "Template fixed successfully! The Notion node now has needsConfiguration: true"
    }
  } catch (error: any) {
    console.error("Error fixing template:", error)
    return { success: false, error: error.message || "Unknown error" }
  }
}
