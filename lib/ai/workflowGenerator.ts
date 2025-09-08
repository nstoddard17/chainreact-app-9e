import { generateObject, generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"
import { generateWorkflow, extractWorkflowVariables, suggestNodeConfigurationWithVariables } from "./workflowAI"

const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.literal("custom"),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.object({
    type: z.string(),
    title: z.string(),
    description: z.string(),
    config: z.record(z.any()),
  }),
})

const WorkflowConnectionSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
})

const GeneratedWorkflowSchema = z.object({
  name: z.string(),
  description: z.string(),
  nodes: z.array(WorkflowNodeSchema),
  connections: z.array(WorkflowConnectionSchema),
  confidence: z.number().min(0).max(1),
})

export async function generateWorkflowFromPrompt(prompt: string) {
  try {
    console.log("🔍 generateWorkflowFromPrompt called with:", prompt)
    
    // Use the existing generateWorkflow function from workflowAI.ts
    const workflow = await generateWorkflow({
      prompt,
      userId: "temp", // This will be set by the API route
    })

    console.log("✅ generateWorkflow successful:", workflow)

    return {
      success: true,
      workflow,
      confidence: 0.8, // Default confidence
    }
  } catch (error) {
    console.error("❌ Error in generateWorkflowFromPrompt:", error)
    return {
      success: false,
      error: "Failed to generate workflow from prompt",
    }
  }
}

export async function suggestNodeConfiguration(nodeType: string, context: any) {
  try {
    // Use the enhanced function with variable awareness if context includes workflowData
    if (context && context.workflowData) {
      return await suggestNodeConfigurationWithVariables(nodeType, context.workflowData);
    }
    
    // Fall back to the original implementation if no workflow data
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: `
        Suggest configuration for a ${nodeType} node in a workflow.
        Context: ${JSON.stringify(context, null, 2)}
        
        Provide a JSON configuration object that would be appropriate for this node type.
        Consider the workflow context and previous nodes.
        
        Return only valid JSON.
      `,
    })

    return {
      success: true,
      config: JSON.parse(text),
    }
  } catch (error) {
    console.error("Error suggesting node configuration:", error)
    return {
      success: false,
      error: "Failed to suggest configuration",
    }
  }
}

export async function generateNodeSuggestions(currentWorkflow: any, position: { x: number; y: number }) {
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        suggestions: z.array(
          z.object({
            type: z.string(),
            title: z.string(),
            description: z.string(),
            confidence: z.number(),
            reasoning: z.string(),
          }),
        ),
      }),
      prompt: `
        Analyze this workflow and suggest the next logical nodes that could be added:
        ${JSON.stringify(currentWorkflow, null, 2)}
        
        Consider:
        1. What nodes already exist
        2. What connections are made
        3. What logical next steps would make sense
        4. Common workflow patterns
        
        Suggest 3-5 relevant node types with explanations.
      `,
    })

    return {
      success: true,
      suggestions: object.suggestions,
    }
  } catch (error) {
    console.error("Error generating node suggestions:", error)
    return {
      success: false,
      error: "Failed to generate suggestions",
    }
  }
}
