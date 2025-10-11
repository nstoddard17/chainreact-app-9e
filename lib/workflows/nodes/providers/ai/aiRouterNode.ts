import { Zap } from "lucide-react"
import { NodeComponent } from "../../types"

// AI Router Templates
export const AI_ROUTER_TEMPLATES = {
  support_router: {
    id: 'support_router',
    name: 'Support Router',
    description: 'Intelligently routes support messages to appropriate handlers',
    icon: '🎯',
    systemPrompt: `You are an intelligent support message router. Analyze incoming messages and classify them into one of the following categories:
    
    1. Bug Report - Technical issues, errors, crashes, or things not working as expected
    2. Feature Request - Suggestions for new features or improvements
    3. Support Query - Questions about how to use the product or service
    4. Sales Inquiry - Questions about pricing, plans, or purchasing
    5. General Feedback - General comments, praise, or non-specific feedback
    
    Consider urgency, sentiment, and technical detail in your classification.
    Respond with a JSON object containing: { "classification": "category_name", "confidence": 0.0-1.0, "reasoning": "brief explanation", "urgency": "low|medium|high", "sentiment": "positive|neutral|negative" }`,
    defaultOutputs: [
      { 
        id: 'bug_report',
        name: 'Bug Report',
        description: 'Technical issues and errors',
        color: '#ef4444', // red
        condition: { type: 'ai_decision', minConfidence: 0.7 }
      },
      { 
        id: 'feature_request',
        name: 'Feature Request',
        description: 'New feature suggestions',
        color: '#3b82f6', // blue
        condition: { type: 'ai_decision', minConfidence: 0.7 }
      },
      { 
        id: 'support_query',
        name: 'Support Query',
        description: 'How-to questions',
        color: '#10b981', // green
        condition: { type: 'ai_decision', minConfidence: 0.7 }
      },
      { 
        id: 'sales_inquiry',
        name: 'Sales Inquiry',
        description: 'Pricing and plan questions',
        color: '#f59e0b', // amber
        condition: { type: 'ai_decision', minConfidence: 0.7 }
      },
      { 
        id: 'general',
        name: 'General/Other',
        description: 'Everything else',
        color: '#6b7280', // gray
        condition: { type: 'fallback' }
      }
    ]
  },
  
  content_moderator: {
    id: 'content_moderator',
    name: 'Content Moderator',
    description: 'Filters and routes content based on safety and appropriateness',
    icon: '🛡️',
    systemPrompt: `You are a content moderation system. Analyze content for:
    - Inappropriate language or hate speech
    - Spam or promotional content
    - Personal information (PII)
    - Off-topic content
    - Quality and relevance
    
    Classify content as: Approved, Needs Review, or Rejected.
    Include safety scores and specific concerns if any.`,
    defaultOutputs: [
      { 
        id: 'approved',
        name: 'Approved',
        description: 'Safe and appropriate content',
        color: '#10b981',
        condition: { type: 'ai_decision', minConfidence: 0.8 }
      },
      { 
        id: 'needs_review',
        name: 'Needs Review',
        description: 'Potentially problematic content',
        color: '#f59e0b',
        condition: { type: 'ai_decision', minConfidence: 0.6 }
      },
      { 
        id: 'rejected',
        name: 'Rejected',
        description: 'Inappropriate or unsafe content',
        color: '#ef4444',
        condition: { type: 'ai_decision', minConfidence: 0.8 }
      }
    ]
  },
  
  lead_qualifier: {
    id: 'lead_qualifier',
    name: 'Lead Qualifier',
    description: 'Qualifies and routes sales leads based on potential',
    icon: '💰',
    systemPrompt: `You are a lead qualification expert. Analyze incoming leads based on:
    - Budget indicators
    - Company size/type
    - Urgency and timeline
    - Decision-making authority
    - Specific needs mentioned
    
    Classify leads as: Hot (ready to buy), Warm (interested), Cold (just browsing), or Not a Lead.
    Include a qualification score and key insights.`,
    defaultOutputs: [
      { 
        id: 'hot_lead',
        name: 'Hot Lead',
        description: 'Ready to purchase',
        color: '#dc2626',
        condition: { type: 'ai_decision', minConfidence: 0.75 }
      },
      { 
        id: 'warm_lead',
        name: 'Warm Lead',
        description: 'Interested and engaged',
        color: '#f97316',
        condition: { type: 'ai_decision', minConfidence: 0.7 }
      },
      { 
        id: 'cold_lead',
        name: 'Cold Lead',
        description: 'Early stage interest',
        color: '#3b82f6',
        condition: { type: 'ai_decision', minConfidence: 0.6 }
      },
      { 
        id: 'not_lead',
        name: 'Not a Lead',
        description: 'Support or other inquiry',
        color: '#6b7280',
        condition: { type: 'fallback' }
      }
    ]
  },
  
  task_dispatcher: {
    id: 'task_dispatcher',
    name: 'Task Dispatcher',
    description: 'Routes tasks to appropriate teams or systems',
    icon: '📋',
    systemPrompt: `You are a task routing system. Analyze incoming requests and determine:
    - Task type and category
    - Required department or team
    - Priority level
    - Estimated complexity
    
    Route to appropriate handlers based on content analysis.`,
    defaultOutputs: [
      { 
        id: 'engineering',
        name: 'Engineering Team',
        description: 'Technical tasks',
        color: '#8b5cf6',
        condition: { type: 'ai_decision', minConfidence: 0.7 }
      },
      { 
        id: 'design',
        name: 'Design Team',
        description: 'UI/UX tasks',
        color: '#ec4899',
        condition: { type: 'ai_decision', minConfidence: 0.7 }
      },
      { 
        id: 'marketing',
        name: 'Marketing Team',
        description: 'Marketing tasks',
        color: '#06b6d4',
        condition: { type: 'ai_decision', minConfidence: 0.7 }
      },
      { 
        id: 'operations',
        name: 'Operations',
        description: 'General operations',
        color: '#84cc16',
        condition: { type: 'fallback' }
      }
    ]
  },
  
  custom: {
    id: 'custom',
    name: 'Custom Router',
    description: 'Define your own routing logic',
    icon: '🔧',
    systemPrompt: '',
    defaultOutputs: [
      { 
        id: 'output_1',
        name: 'Output 1',
        description: 'First output path',
        color: '#3b82f6',
        condition: { type: 'ai_decision', minConfidence: 0.7 }
      },
      { 
        id: 'output_2',
        name: 'Output 2',
        description: 'Second output path',
        color: '#10b981',
        condition: { type: 'ai_decision', minConfidence: 0.7 }
      },
      { 
        id: 'fallback',
        name: 'Fallback',
        description: 'Default path',
        color: '#6b7280',
        condition: { type: 'fallback' }
      }
    ]
  }
}

// AI Router Node Definition
export const aiRouterNode: NodeComponent = {
  type: "ai_router",
  title: "AI Router",
  description: "Intelligently routes workflow based on content analysis with multiple output paths",
  icon: Zap,
  category: "AI & Automation",
  providerId: "ai",
  isTrigger: false,
  testable: true,
  hasMultipleOutputs: true, // New property for multiple outputs
  
  configSchema: [
    // Template Selection
    {
      name: "template",
      label: "Router Template",
      type: "select",
      required: true,
      defaultValue: "support_router",
      options: Object.entries(AI_ROUTER_TEMPLATES).map(([key, template]) => ({
        value: key,
        label: template.name,
        description: template.description
      })),
      description: "Choose a pre-configured routing template or create custom"
    },
    
    // System Prompt (shows when custom is selected)
    {
      name: "systemPrompt",
      label: "System Prompt",
      type: "textarea",
      dependsOn: "template",
      showWhen: { template: "custom" },
      placeholder: "Define how the AI should analyze and route incoming data...",
      description: "Custom instructions for the AI router"
    },
    
    // Memory Configuration
    {
      name: "memory",
      label: "Memory & Context",
      type: "select",
      defaultValue: "workflow",
      options: [
        { value: "none", label: "No memory - Stateless routing" },
        { value: "workflow", label: "Workflow context - Remember within this workflow run" },
        { value: "conversation", label: "Conversation memory - Remember across runs" },
        { value: "vector", label: "Vector storage - Semantic memory search" }
      ],
      description: "How the AI should maintain context"
    },
    
    // Memory Provider (shows when vector is selected)
    {
      name: "memoryProvider",
      label: "Vector Storage",
      type: "select",
      dependsOn: "memory",
      showWhen: { memory: "vector" },
      options: [
        { value: "pinecone", label: "Pinecone" },
        { value: "weaviate", label: "Weaviate" },
        { value: "supabase", label: "Supabase Vector" },
        { value: "qdrant", label: "Qdrant" }
      ],
      description: "Vector database for semantic search"
    },
    
    // Model Selection
    {
      name: "model",
      label: "AI Model",
      type: "select",
      required: true,
      defaultValue: "gpt-4-turbo",
      options: [
        { value: "gpt-4-turbo", label: "GPT-4 Turbo (Best accuracy, Higher cost)" },
        { value: "gpt-4o-mini", label: "GPT-4 Mini (Good balance)" },
        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Fast, Lower cost)" },
        { value: "claude-3-opus", label: "Claude 3 Opus (Best reasoning)" },
        { value: "claude-3-sonnet", label: "Claude 3 Sonnet (Balanced)" },
        { value: "claude-3-haiku", label: "Claude 3 Haiku (Fast)" },
        { value: "gemini-pro", label: "Gemini Pro (Google)" },
        { value: "mistral-large", label: "Mistral Large (Open source)" }
      ],
      description: "Select the AI model for routing decisions"
    },
    
    // API Configuration
    {
      name: "apiSource",
      label: "API Configuration",
      type: "select",
      required: true,
      defaultValue: "chainreact",
      options: [
        { value: "chainreact", label: "Use ChainReact API (Metered billing)" },
        { value: "custom", label: "Use my own API key" }
      ],
      description: "Choose API source for AI calls"
    },
    
    // Custom API Key (shows when custom is selected)
    {
      name: "customApiKey",
      label: "API Key",
      type: "password",
      dependsOn: "apiSource",
      showWhen: { apiSource: "custom" },
      placeholder: "sk-...",
      description: "Your API key (encrypted and secure)"
    },
    
    // Custom API Provider (shows when custom is selected)
    {
      name: "customApiProvider",
      label: "API Provider",
      type: "select",
      dependsOn: "apiSource",
      showWhen: { apiSource: "custom" },
      required: true,
      options: [
        { value: "openai", label: "OpenAI" },
        { value: "anthropic", label: "Anthropic (Claude)" },
        { value: "google", label: "Google (Gemini)" },
        { value: "mistral", label: "Mistral AI" }
      ],
      description: "Select your API provider"
    },
    
    // Output Paths Configuration
    {
      name: "outputPaths",
      label: "Output Paths",
      type: "dynamic_list",
      required: true,
      minItems: 2,
      maxItems: 10,
      itemSchema: {
        id: { type: "string", generated: true },
        name: { type: "string", label: "Path Name", required: true },
        description: { type: "string", label: "Description" },
        color: { type: "color", label: "Color", defaultValue: "#3b82f6" },
        chainId: { type: "string", label: "Chain ID", description: "Optional chain to execute when this path is selected" },
        condition: {
          type: "object",
          schema: {
            type: { 
              type: "select",
              label: "Condition Type",
              options: [
                { value: "ai_decision", label: "AI Decision" },
                { value: "keyword", label: "Keyword Match" },
                { value: "regex", label: "Regex Pattern" },
                { value: "confidence", label: "Confidence Threshold" },
                { value: "fallback", label: "Fallback/Default" }
              ]
            },
            value: { type: "string", label: "Value/Pattern" },
            minConfidence: { type: "number", label: "Min Confidence", min: 0, max: 1, step: 0.1 }
          }
        }
      },
      description: "Define the output paths for routing"
    },
    
    // Decision Mode
    {
      name: "decisionMode",
      label: "Decision Mode",
      type: "select",
      defaultValue: "single",
      options: [
        { value: "single", label: "Single path - Route to one output only" },
        { value: "multi", label: "Multi-path - Can trigger multiple outputs" },
        { value: "weighted", label: "Weighted - Distribute based on confidence" }
      ],
      description: "How the router makes decisions"
    },
    
    // Advanced Settings
    {
      name: "temperature",
      label: "Temperature",
      type: "slider",
      min: 0,
      max: 1,
      step: 0.1,
      defaultValue: 0.3,
      description: "Lower = more consistent, Higher = more creative"
    },
    
    {
      name: "maxRetries",
      label: "Max Retries",
      type: "number",
      min: 0,
      max: 3,
      defaultValue: 1,
      description: "Retry failed routing decisions"
    },
    
    {
      name: "timeout",
      label: "Timeout (seconds)",
      type: "number",
      min: 5,
      max: 60,
      defaultValue: 30,
      description: "Maximum time for routing decision"
    },
    
    {
      name: "includeReasoning",
      label: "Include Reasoning",
      type: "boolean",
      defaultValue: true,
      description: "Include AI's reasoning in output"
    },
    
    {
      name: "costLimit",
      label: "Cost Limit per Execution ($)",
      type: "number",
      min: 0.01,
      max: 10,
      step: 0.01,
      defaultValue: 0.50,
      description: "Maximum cost per routing decision"
    }
  ],
  
  outputSchema: [
    {
      name: "routingDecision",
      label: "Routing Decision",
      type: "object",
      description: "The AI's routing decision with metadata"
    },
    {
      name: "selectedPath",
      label: "Selected Path",
      type: "string",
      description: "ID of the selected output path"
    },
    {
      name: "selectedPaths",
      label: "Selected Paths",
      type: "array",
      description: "IDs of selected paths (multi-path mode)"
    },
    {
      name: "confidence",
      label: "Confidence Score",
      type: "number",
      description: "AI's confidence in the decision (0-1)"
    },
    {
      name: "reasoning",
      label: "Reasoning",
      type: "string",
      description: "AI's explanation for the routing decision"
    },
    {
      name: "classification",
      label: "Classification",
      type: "string",
      description: "Primary classification category"
    },
    {
      name: "urgency",
      label: "Urgency Level",
      type: "string",
      description: "Detected urgency (low/medium/high)"
    },
    {
      name: "sentiment",
      label: "Sentiment",
      type: "string",
      description: "Detected sentiment (positive/neutral/negative)"
    },
    {
      name: "extractedData",
      label: "Extracted Data",
      type: "object",
      description: "Any data extracted by the AI"
    },
    {
      name: "suggestedActions",
      label: "Suggested Actions",
      type: "array",
      description: "AI-suggested next steps"
    },
    {
      name: "metadata",
      label: "Metadata",
      type: "object",
      description: "Additional routing metadata"
    },
    {
      name: "tokensUsed",
      label: "Tokens Used",
      type: "number",
      description: "Number of tokens consumed"
    },
    {
      name: "costIncurred",
      label: "Cost Incurred",
      type: "number",
      description: "Cost of this routing decision"
    }
  ],
  
  producesOutput: true,
  requiresInput: true
}
