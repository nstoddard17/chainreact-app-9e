import React from "react"
import { NodeComponent } from "../../types"

const AIAgentIcon = ({ className }: { className?: string }) =>
  React.createElement("img", {
    src: "/integrations/ai.svg",
    alt: "AI Agent",
    className: className ? `object-contain ${className}` : "h-5 w-5 object-contain",
    width: 20,
    height: 20,
    draggable: false,
    loading: "lazy",
    decoding: "async",
  })

/**
 * Autonomous AI Agent Node
 *
 * This intelligent agent automatically:
 * 1. Detects connected output paths and chains
 * 2. Analyzes input data and task requirements
 * 3. Generates content if needed for downstream nodes
 * 4. Routes to the best path based on context
 * 5. Makes all decisions autonomously - no mode selection needed!
 *
 * The agent is smart enough to know what to do based on:
 * - What you ask it to do (the prompt)
 * - What's connected to it (single path vs multiple paths)
 * - What comes after it (does the next node need generated content?)
 */
export const aiAgentNode: NodeComponent = {
  type: "ai_agent",
  title: "AI Agent",
  description: "Get Custom AI Responses Using OpenAI (GPT-4, GPT-3.5) or Claude (Anthropic)",
  icon: AIAgentIcon,
  category: "AI & Automation",
  providerId: "ai",
  isTrigger: false,
  testable: true,
  hasMultipleOutputs: true,
  producesOutput: true,
  requiresInput: true,

  configSchema: [
    // ========================================
    // MAIN PROMPT - The agent figures out what to do
    // ========================================
    {
      name: "prompt",
      label: "What should the AI do?",
      type: "textarea",
      multiline: true,
      rows: 16,
      required: true,
      hasVariablePicker: true,
      hasImproveButton: true, // Enable "Improve Prompt" button
      placeholder: `Tell the AI what you want it to do. It will automatically figure out the rest!

Examples:
• "Summarize this article in 3 bullet points"
• "Extract the customer name, email, and order number from {{trigger.email.body}}"
• "Analyze the sentiment of this review and classify as positive, negative, or neutral"
• "Translate {{trigger.message}} to Spanish"
• "Generate a professional response to this customer inquiry"
• "Classify this support ticket as bug, feature request, or question"
• "Draft a follow-up email based on {{trigger.user.name}} and their purchase history"

The AI will:
✓ Summarize, extract, translate, or generate content as requested
✓ Classify and analyze sentiment based on your prompt
✓ Route to the best path if you have multiple outputs
✓ Make intelligent decisions based on context`,
      description: "Describe the task. The AI figures out if it needs to generate content, route, or both!"
    },

    // ========================================
    // OPTIONAL: CONTEXT & INSTRUCTIONS
    // ========================================
    {
      name: "systemInstructions",
      label: "Additional Instructions (Optional)",
      type: "textarea",
      multiline: true,
      rows: 7,
      placeholder: `Optional: Give the AI additional context or rules

Examples:
• "Always maintain a professional tone"
• "Our refund policy is 30 days"
• "You are a helpful customer service assistant"
• "Prioritize urgent requests"`,
      description: "Optional guidelines for the AI's behavior"
    },

    {
      name: "includeContextFrom",
      label: "Include Data From Previous Steps",
      type: "select",
      multiple: true,
      description: "Select previous steps to give the AI more context",
      placeholder: "Select steps to include as context..."
    },

    // ========================================
    // TONE & PERSONALITY
    // ========================================
    {
      name: "tone",
      label: "Response Tone",
      type: "select",
      defaultValue: "professional",
      options: [
        { value: "professional", label: "Professional - Clear and business-appropriate" },
        { value: "friendly", label: "Friendly - Warm and approachable" },
        { value: "casual", label: "Casual - Relaxed and conversational" },
        { value: "formal", label: "Formal - Polished and traditional" },
        { value: "concise", label: "Concise - Brief and to the point" }
      ],
      description: "How should the AI communicate?"
    },

    // ========================================
    // SIGNATURE SETTINGS
    // ========================================
    {
      name: "includeSignature",
      label: "Include Signature",
      type: "select",
      defaultValue: "none",
      options: [
        { value: "none", label: "No signature" },
        { value: "name_only", label: "Name only (from your profile)" },
        { value: "full", label: "Full signature (name, title, company)" },
        { value: "custom", label: "Custom signature" }
      ],
      description: "Automatically add a signature to AI responses"
    },

    {
      name: "customSignature",
      label: "Custom Signature",
      type: "textarea",
      multiline: true,
      rows: 4,
      dependsOn: "includeSignature",
      visibilityCondition: { field: "includeSignature", operator: "equals", value: "custom" },
      placeholder: `Best regards,
John Doe
CEO, Acme Corp
john@acme.com`,
      description: "Your custom signature (supports line breaks)"
    },

    {
      name: "signaturePrefix",
      label: "Sign-off Style",
      type: "select",
      defaultValue: "best",
      dependsOn: "includeSignature",
      visibilityCondition: { field: "includeSignature", operator: "notEquals", value: "none" },
      options: [
        { value: "best", label: "Best regards," },
        { value: "thanks", label: "Thanks," },
        { value: "sincerely", label: "Sincerely," },
        { value: "cheers", label: "Cheers," },
        { value: "regards", label: "Regards," },
        { value: "none", label: "No sign-off (name only)" }
      ],
      description: "The closing phrase before your name"
    },

    // ========================================
    // MODEL CONFIGURATION
    // ========================================
    {
      name: "model",
      label: "AI Model",
      type: "select",
      required: true,
      defaultValue: "gpt-4o-mini",
      options: [
        { value: "gpt-4o", label: "GPT-4o (Most capable, higher cost)" },
        { value: "gpt-4o-mini", label: "GPT-4o Mini ⭐ Recommended (Best balance)" },
        { value: "gpt-4-turbo", label: "GPT-4 Turbo (Fast, 128k context)" },
        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Budget friendly)" },
        { value: "claude-3-opus", label: "Claude 3 Opus (Best reasoning)" },
        { value: "claude-3-sonnet", label: "Claude 3 Sonnet (Balanced)" },
        { value: "claude-3-haiku", label: "Claude 3 Haiku (Fastest, cheapest)" }
      ],
      description: "Which AI model to use"
    },

    {
      name: "apiSource",
      label: "API Source",
      type: "select",
      required: true,
      defaultValue: "chainreact",
      options: [
        { value: "chainreact", label: "ChainReact Managed (No setup required)" },
        { value: "custom", label: "Use my own API key" }
      ],
      description: "Use ChainReact's API or provide your own"
    },

    {
      name: "customApiKey",
      label: "API Key",
      type: "password",
      dependsOn: "apiSource",
      visibilityCondition: { field: "apiSource", operator: "equals", value: "custom" },
      placeholder: "sk-...",
      description: "Your API key (encrypted and secure)"
    },

    {
      name: "customApiProvider",
      label: "API Provider",
      type: "select",
      dependsOn: "apiSource",
      visibilityCondition: { field: "apiSource", operator: "equals", value: "custom" },
      required: true,
      options: [
        { value: "openai", label: "OpenAI" },
        { value: "anthropic", label: "Anthropic (Claude)" }
      ],
      description: "Select your API provider"
    },

    // ========================================
    // OUTPUT CONFIGURATION
    // ========================================
    {
      name: "outputFormat",
      label: "Output Format Hint (Optional)",
      type: "textarea",
      multiline: true,
      rows: 9,
      placeholder: `Optionally tell the AI what format you need the output in:

Examples:
• "subject, body, tone"
• "decision, reasoning, confidence_score"
• "approved: boolean, feedback: string"
• "priority: high/medium/low, category: string"

The AI will structure its output accordingly.`,
      description: "Hint at what structured data you want extracted (optional)"
    },

    {
      name: "outputPaths",
      label: "Output Paths (Auto-detected)",
      type: "info",
      description: "The AI automatically detects connected paths and routes intelligently. You can name paths in the visual editor."
    },

    // ========================================
    // ADVANCED SETTINGS
    // ========================================
    {
      name: "temperature",
      label: "Creativity",
      type: "slider",
      min: 0,
      max: 1,
      step: 0.1,
      defaultValue: 0.7,
      description: "Lower (0-0.3) = focused and consistent. Higher (0.7-1.0) = creative and varied"
    },

    {
      name: "maxTokens",
      label: "Max Response Length",
      type: "number",
      min: 100,
      max: 4000,
      step: 100,
      defaultValue: 1500,
      description: "Maximum length of AI response (roughly 4 characters per token)"
    },

    {
      name: "timeout",
      label: "Timeout (seconds)",
      type: "number",
      min: 5,
      max: 120,
      defaultValue: 30,
      description: "Maximum time to wait for AI response"
    },

    {
      name: "maxRetries",
      label: "Retry Attempts",
      type: "number",
      min: 0,
      max: 3,
      defaultValue: 1,
      description: "Number of retry attempts on failure"
    },

    {
      name: "costLimit",
      label: "Cost Limit ($)",
      type: "number",
      min: 0.01,
      max: 10,
      step: 0.01,
      defaultValue: 1.00,
      description: "Maximum cost per execution"
    },

    {
      name: "minConfidence",
      label: "Routing Confidence Threshold",
      type: "slider",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.7,
      description: "Minimum confidence required for routing decisions (only applies when multiple paths exist)"
    }
  ],

  // ========================================
  // DYNAMIC OUTPUTS
  // Agent automatically provides relevant outputs
  // ========================================
  outputSchema: [
    // Always available
    {
      name: "output",
      label: "Generated Content",
      type: "string",
      description: "Main content generated by the AI (if applicable)"
    },
    {
      name: "data",
      label: "Structured Data",
      type: "object",
      description: "Structured data extracted by the AI (if applicable)"
    },

    // Routing outputs (when multiple paths exist)
    {
      name: "selectedPath",
      label: "Selected Path",
      type: "string",
      description: "Which path the AI chose (when routing)"
    },
    {
      name: "decision",
      label: "Decision",
      type: "object",
      description: "AI's decision with reasoning and confidence"
    },
    {
      name: "confidence",
      label: "Confidence Score",
      type: "number",
      description: "AI's confidence in its decision (0-1)"
    },
    {
      name: "reasoning",
      label: "Reasoning",
      type: "string",
      description: "AI's explanation for its decision"
    },

    // Metadata
    {
      name: "tokensUsed",
      label: "Tokens Used",
      type: "number",
      description: "Number of tokens consumed"
    },
    {
      name: "costIncurred",
      label: "Cost",
      type: "number",
      description: "Cost of this execution (USD)"
    },
    {
      name: "executionTime",
      label: "Execution Time",
      type: "number",
      description: "Time taken (milliseconds)"
    },
    {
      name: "modelUsed",
      label: "Model Used",
      type: "string",
      description: "Which AI model was used"
    }
  ]
}

/**
 * Router Templates (kept for backwards compatibility with masterPromptBuilder)
 * Note: These are not used in the autonomous agent UI, but may be used
 * internally for routing context
 */
export const AI_AGENT_ROUTER_TEMPLATES = {
  custom: {
    name: "Custom Router",
    systemPrompt: "You are a smart routing agent. Analyze the input and choose the best path.",
    defaultOutputs: []
  }
} as const
