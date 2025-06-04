import { OpenAI } from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface WorkflowGenerationRequest {
  prompt: string
  userId: string
}

export interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    type: string
    config: Record<string, any>
  }
}

export interface WorkflowConnection {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface GeneratedWorkflow {
  name: string
  description: string
  nodes: WorkflowNode[]
  connections: WorkflowConnection[]
}

const WORKFLOW_GENERATION_PROMPT = `
You are a workflow automation expert. Given a user's description, create a JSON workflow with nodes and connections.

Rules:
1. Always include a trigger node as the first node
2. Include action nodes that perform the described tasks
3. Connect nodes logically with proper flow
4. Use realistic integrations (Slack, Gmail, Google Sheets, etc.)
5. Position nodes in a readable layout
6. Include proper configuration for each node

Available node types:
- trigger: webhook, schedule, email_received, slack_message, etc.
- action: send_email, post_slack, create_sheet_row, http_request, etc.
- condition: if_then, filter, delay
- transform: format_data, extract_field, calculate

Return ONLY valid JSON in this format:
{
  "name": "Workflow Name",
  "description": "Brief description",
  "nodes": [
    {
      "id": "node-1",
      "type": "custom",
      "position": {"x": 100, "y": 100},
      "data": {
        "label": "Email Received",
        "type": "trigger",
        "config": {"provider": "gmail", "filter": "unread"}
      }
    }
  ],
  "connections": [
    {
      "id": "edge-1",
      "source": "node-1",
      "target": "node-2"
    }
  ]
}
`

export async function generateWorkflow(request: WorkflowGenerationRequest): Promise<GeneratedWorkflow> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: WORKFLOW_GENERATION_PROMPT,
        },
        {
          role: "user",
          content: `Create a workflow for: ${request.prompt}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    })

    const response = completion.choices[0]?.message?.content
    if (!response) {
      throw new Error("No response from OpenAI")
    }

    // Parse the JSON response
    const workflow = JSON.parse(response) as GeneratedWorkflow

    // Validate the workflow structure
    if (!workflow.name || !workflow.nodes || !Array.isArray(workflow.nodes)) {
      throw new Error("Invalid workflow structure generated")
    }

    return workflow
  } catch (error) {
    console.error("Error generating workflow:", error)
    throw new Error("Failed to generate workflow")
  }
}

export async function chatWithAI(message: string, context?: any): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a helpful workflow automation assistant. Help users build, debug, and optimize their workflows. 
          You can answer questions about:
          - How to create specific types of workflows
          - Troubleshooting workflow issues
          - Best practices for automation
          - Integration capabilities
          
          Keep responses concise and actionable.`,
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    })

    return completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response."
  } catch (error) {
    console.error("Error in AI chat:", error)
    throw new Error("Failed to get AI response")
  }
}
