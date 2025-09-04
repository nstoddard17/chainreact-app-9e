import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { generateDynamicWorkflow } from "@/lib/ai/dynamicWorkflowAI"
import { nodeRegistry, getAllNodes } from "@/lib/workflows/nodes/registry"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"

export async function POST(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseServerClient()
    
    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { prompt, model } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    // Register nodes if not already registered
    if (getAllNodes().length === 0) {
      nodeRegistry.registerNodes(ALL_NODE_COMPONENTS)
    }

    // Pre-validation: Check if the prompt mentions any coming soon integrations
    const comingSoonIntegrations = getAllNodes()
      .filter(node => node.comingSoon === true)
      .map(node => node.providerId)
      .filter((value, index, self) => value && self.indexOf(value) === index) // unique provider IDs
    
    const promptLower = prompt.toLowerCase()
    const mentionedComingSoon = comingSoonIntegrations.filter(provider => {
      if (!provider) return false
      // Check if the provider name is mentioned in the prompt
      return promptLower.includes(provider.toLowerCase())
    })
    
    if (mentionedComingSoon.length > 0) {
      return NextResponse.json({
        error: `The following integrations are coming soon and not yet available: ${mentionedComingSoon.join(', ')}. Please try your request without these integrations.`,
        comingSoonIntegrations: mentionedComingSoon,
      }, { status: 400 })
    }

    // Validate model parameter
    const validModels = ['gpt-4o', 'gpt-4o-mini']
    const selectedModel = model && validModels.includes(model) ? model : 'gpt-4o-mini'

    // Generate workflow using dynamic AI with actual node registry
    const generatedWorkflow = await generateDynamicWorkflow({
      prompt,
      userId: user.id,
      model: selectedModel as 'gpt-4o' | 'gpt-4o-mini',
    })

    // Save the generated workflow to the database
    const { data: workflow, error: dbError } = await supabase
      .from("workflows")
      .insert({
        name: generatedWorkflow.name,
        description: generatedWorkflow.description,
        user_id: user.id,
        nodes: generatedWorkflow.nodes,
        connections: generatedWorkflow.connections,
        status: "draft",
      })
      .select()
      .single()

    if (dbError) {
      console.error("Database error:", dbError)
      return NextResponse.json({ error: "Failed to save workflow" }, { status: 500 })
    }

    // Log the AI generation with model info
    await supabase.from("ai_workflow_generations").insert({
      user_id: user.id,
      prompt,
      generated_workflow: generatedWorkflow,
      confidence_score: 0.8,
      status: "generated",
      metadata: { model: selectedModel },
    })

    return NextResponse.json({
      success: true,
      workflow,
      generated: generatedWorkflow,
    })
  } catch (error: any) {
    console.error("Error generating workflow:", error)
    return NextResponse.json(
      {
        error: "Failed to generate workflow",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
