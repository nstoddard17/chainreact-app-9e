/**
 * AI Workflow Plan Generation API
 *
 * Takes a natural language prompt and generates a detailed workflow plan
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { WorkflowPlan, NodePlan } from '@/lib/workflows/ai/SequentialWorkflowBuilder'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Node catalog for AI to choose from
const NODE_CATALOG = `
Available Nodes:

TRIGGERS:
- gmailTrigger: Monitor Gmail for new emails (outputs: from, subject, body, attachments, timestamp)
- scheduleTrigger: Run on a schedule (outputs: timestamp, cronExpression)
- webhookTrigger: Receive webhook data (outputs: payload, headers, query)
- slackMessageTrigger: New Slack message (outputs: channelId, message, user, timestamp)

ACTIONS:
- gmailSendEmail: Send an email via Gmail (inputs: to, subject, body; outputs: messageId, success)
- slackSendMessage: Send a Slack message (inputs: channel, message; outputs: messageId, timestamp)
- notionCreatePage: Create a Notion page (inputs: database, title, properties; outputs: pageId, url)
- airtableCreateRecord: Create Airtable record (inputs: baseId, tableId, fields; outputs: recordId)
- googleSheetsAppendRow: Append row to Google Sheet (inputs: spreadsheetId, range, values; outputs: rowIndex)

AI:
- aiAgent: AI-powered analysis/generation (inputs: prompt, context; outputs: response, confidence)
- aiSentimentAnalysis: Analyze text sentiment (inputs: text; outputs: sentiment, score)
- aiTextSummarize: Summarize text (inputs: text, length; outputs: summary)

UTILITIES:
- condition: Conditional branching (inputs: condition, trueValue, falseValue; outputs: result)
- transformer: Transform data (inputs: inputData, transformScript; outputs: outputData)
- delay: Wait for duration (inputs: duration; outputs: timestamp)
`

const SYSTEM_PROMPT = `You are a workflow automation expert. Your job is to convert natural language descriptions into detailed workflow plans.

# Available Nodes
${NODE_CATALOG}

# Your Task
Given a user's goal, create a detailed workflow plan with:
1. A clear workflow name and description
2. 3-7 steps (nodes) that accomplish the goal
3. For each node: title, description, node type, required config fields, and output fields

# IMPORTANT: You must respond with ONLY valid JSON, no markdown or explanation text.

# Response Format
Return ONLY a JSON object with this structure:
{
  "workflowName": "Short, descriptive name",
  "workflowDescription": "1-2 sentence explanation of what this workflow does",
  "estimatedTime": "Time estimate (e.g., '2-3 minutes')",
  "nodes": [
    {
      "id": "unique-id",
      "step": 1,
      "title": "Human-readable step title",
      "description": "What this step does",
      "nodeType": "gmailTrigger | gmailSendEmail | etc.",
      "providerId": "gmail | slack | notion | etc.",
      "category": "trigger | action | ai | utility",
      "needsAuth": true/false,
      "authProvider": "google | slack | etc." (if needsAuth),
      "configFields": [
        {
          "name": "fieldName",
          "label": "User-friendly label",
          "type": "text | text_array | number | select | boolean",
          "description": "What this field is for",
          "required": true/false,
          "placeholder": "Example value",
          "options": [{"label": "Option 1", "value": "opt1"}] (for select type)
        }
      ],
      "outputFields": [
        {
          "name": "outputFieldName",
          "type": "string | number | boolean | object | array",
          "label": "Output field label",
          "description": "What this output contains"
        }
      ],
      "reasoning": "Why this node is needed"
    }
  ]
}

# Guidelines
- Keep workflows simple and focused (3-7 steps ideal)
- Choose the most appropriate node types
- Identify what config fields users need to provide
- Specify clear output fields for variable mapping
- Only require auth when actually needed
- Use text_array for fields that can have multiple values
- Make field labels conversational and clear
`

export async function POST(req: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: 'AI service not configured. Please set OPENAI_API_KEY environment variable.',
          details: 'The AI workflow builder requires an OpenAI API key to generate workflow plans. Contact your administrator to configure this.'
        },
        { status: 500 }
      )
    }

    const { prompt, userId, organizationId } = await req.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      )
    }

    // Generate plan using OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Using gpt-4o for better workflow planning
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `Create a workflow plan for: ${prompt}`
        }
      ],
      max_tokens: 4000,
      temperature: 0.7,
      response_format: { type: "json_object" } // Ensures JSON response
    })

    const responseText = completion.choices[0]?.message?.content || ''

    // Parse JSON response (OpenAI's json_object mode returns clean JSON)
    if (!responseText) {
      throw new Error('Empty response from AI')
    }

    const plan: WorkflowPlan = JSON.parse(responseText)

    // Validate and enhance plan
    const enhancedPlan: WorkflowPlan = {
      ...plan,
      nodes: plan.nodes.map((node, index) => ({
        ...node,
        id: node.id || `node-${Date.now()}-${index}`,
        step: index + 1
      }))
    }

    return NextResponse.json(enhancedPlan)
  } catch (error: any) {
    console.error('Error generating workflow plan:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate workflow plan',
        details: error.message
      },
      { status: 500 }
    )
  }
}
