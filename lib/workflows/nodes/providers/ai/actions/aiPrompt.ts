import * as React from "react"
import { NodeComponent } from "../../../types"

const PromptIcon = ({ className }: { className?: string }) =>
  React.createElement("img", {
    src: "/integrations/ai.svg",
    alt: "AI Prompt",
    className: className ? `object-contain ${className}` : "h-5 w-5 object-contain",
    width: 20,
    height: 20,
    draggable: false,
  })

/**
 * AI Prompt Node
 *
 * Flexible, custom AI prompt for power users.
 * Full control over the prompt - like Zapier's "Send Prompt" or Make's "Simple Text Prompt".
 */
export const aiPromptNode: NodeComponent = {
  type: "ai_prompt",
  title: "AI Prompt",
  description: "Send a custom prompt to AI and get a response",
  icon: PromptIcon,
  category: "AI & Automation",
  providerId: "ai",
  isTrigger: false,
  testable: true,
  producesOutput: true,
  billableTest: true, // AI calls cost money - deduct from user's task quota when testing
  testCost: 1,

  configSchema: [
    {
      name: "prompt",
      label: "Prompt",
      type: "textarea",
      multiline: true,
      rows: 10,
      required: true,
      hasVariablePicker: true,
      hasImproveButton: true,
      placeholder: `Write your prompt here. You can use variables from previous steps.

Examples:
• "Summarize this article in 3 bullet points: {{trigger.article}}"
• "Extract the customer name and order number from: {{trigger.email.body}}"
• "Analyze this feedback and tell me if it's positive or negative: {{input.text}}"
• "Write a professional response to this customer inquiry"`,
      description: "Your custom prompt - be specific about what you want"
    },
    {
      name: "systemPrompt",
      label: "System Instructions (Optional)",
      type: "textarea",
      multiline: true,
      rows: 5,
      placeholder: `Optional: Give the AI a role or rules to follow.

Examples:
• "You are a helpful customer service assistant"
• "Always respond in JSON format"
• "Be concise - keep responses under 100 words"
• "You are an expert in {{domain}}"`,
      description: "Optional instructions that shape how the AI behaves"
    },
    {
      name: "outputFormat",
      label: "Expected Output",
      type: "select",
      defaultValue: "text",
      options: [
        { value: "text", label: "Free-form Text" },
        { value: "json", label: "JSON Object" },
        { value: "list", label: "Bullet List" },
        { value: "number", label: "Single Number" },
        { value: "boolean", label: "Yes/No (Boolean)" }
      ],
      description: "What format you expect the response in"
    },
    {
      name: "jsonSchema",
      label: "JSON Schema (Optional)",
      type: "textarea",
      multiline: true,
      rows: 6,
      dependsOn: "outputFormat",
      visibilityCondition: { field: "outputFormat", operator: "equals", value: "json" },
      placeholder: `Describe the JSON structure you want:
{
  "name": "string",
  "email": "string",
  "priority": "high | medium | low",
  "tags": ["string"]
}`,
      description: "Describe the JSON structure you expect"
    },
    {
      name: "model",
      label: "AI Model",
      type: "select",
      required: true,
      defaultValue: "gpt-4o-mini",
      options: [
        { value: "gpt-4o", label: "GPT-4o (Most capable)" },
        { value: "gpt-4o-mini", label: "GPT-4o Mini ⭐ Recommended" },
        { value: "gpt-4-turbo", label: "GPT-4 Turbo (128k context)" },
        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Budget)" },
        { value: "claude-3-opus", label: "Claude 3 Opus (Best reasoning)" },
        { value: "claude-3-sonnet", label: "Claude 3 Sonnet (Balanced)" },
        { value: "claude-3-haiku", label: "Claude 3 Haiku (Fast, cheap)" }
      ],
      description: "Which AI model to use"
    },
    {
      name: "temperature",
      label: "Creativity",
      type: "slider",
      min: 0,
      max: 1,
      step: 0.1,
      defaultValue: 0.7,
      description: "Lower (0-0.3) = focused & consistent. Higher (0.7-1.0) = creative & varied"
    },
    {
      name: "maxTokens",
      label: "Max Response Length",
      type: "number",
      min: 100,
      max: 4000,
      step: 100,
      defaultValue: 1500,
      description: "Maximum tokens in response (~4 chars per token)"
    }
  ],

  outputSchema: [
    {
      name: "response",
      label: "AI Response",
      type: "string",
      description: "The AI's text response"
    },
    {
      name: "data",
      label: "Parsed Data",
      type: "object",
      description: "If JSON output was requested, the parsed object"
    },
    {
      name: "tokensUsed",
      label: "Tokens Used",
      type: "number",
      description: "Number of tokens consumed"
    },
    {
      name: "cost",
      label: "Cost ($)",
      type: "number",
      description: "Cost of this API call"
    },
    {
      name: "model",
      label: "Model Used",
      type: "string",
      description: "Which AI model was used"
    },
    {
      name: "finishReason",
      label: "Finish Reason",
      type: "string",
      description: "Why the AI stopped (completed, length limit, etc.)"
    }
  ]
}
