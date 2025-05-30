import { generateObject, generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"

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
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: GeneratedWorkflowSchema,
      prompt: `
        Generate a complete workflow based on this user request: "${prompt}"
        
        Available node types:
        - webhook: For receiving HTTP requests
        - schedule: For time-based triggers
        - slack_message: For Slack integrations
        - send_email: For sending emails
        - api_call: For making HTTP requests
        - condition: For conditional logic
        - delay: For adding delays
        - template: For text/data transformation
        - database_query: For database operations
        - file_upload: For file handling
        
        Rules:
        1. Create a logical flow that accomplishes the user's goal
        2. Position nodes in a left-to-right flow (x: 100, 300, 500, etc.)
        3. Include proper configuration for each node
        4. Connect nodes in the correct order
        5. Provide a confidence score based on how well you understand the request
        
        Example configurations:
        - Slack: {"channel": "#general", "message": "Hello world"}
        - Email: {"to": "user@example.com", "subject": "Subject", "body": "Body"}
        - API: {"url": "https://api.example.com", "method": "POST", "headers": {}}
        - Schedule: {"cron_expression": "0 9 * * *", "timezone": "UTC"}
      `,
    })

    return {
      success: true,
      workflow: object,
      confidence: object.confidence,
    }
  } catch (error) {
    console.error("Error generating workflow:", error)
    return {
      success: false,
      error: "Failed to generate workflow from prompt",
    }
  }
}

export async function suggestNodeConfiguration(nodeType: string, context: any) {
  try {
    const { text } = await generateText({
      model: openai("gpt-4o"),
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
      model: openai("gpt-4o"),
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
