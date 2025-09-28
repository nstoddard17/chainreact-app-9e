import { NodeComponent } from "../../../types"

export const defaultActionSchema: NodeComponent = {
  type: "ai_agent",
    title: "AI Agent",
    description: "An AI agent that can use other integrations as tools to accomplish goals",
    icon: "Zap" as any,
    category: "AI & Automation",
    providerId: "ai",
    isTrigger: false,
    testable: true,
    supportsChains: true,
    configSchema: [
      {
        name: "model",
        label: "AI Model",
        type: "select",
        required: true,
        defaultValue: "gpt-4",
        options: [
          { value: "gpt-4", label: "GPT-4 (OpenAI - Best overall)" },
          { value: "gpt-4-turbo-preview", label: "GPT-4 Turbo (OpenAI - Faster)" },
          { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (OpenAI - Fast & cheap)" },
          { value: "claude-3-opus-20240229", label: "Claude 3 Opus (Anthropic - Best reasoning)" },
          { value: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet (Anthropic - Balanced)" },
          { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku (Anthropic - Fast)" },
          { value: "claude-2.1", label: "Claude 2.1 (Anthropic - Legacy)" }
        ],
        description: "Choose the AI model to power the agent. OpenAI models are always available. Anthropic models require the SDK to be installed."
      },
      {
        name: "apiSource",
        label: "API Source",
        type: "select",
        defaultValue: "chainreact",
        options: [
          { value: "chainreact", label: "ChainReact API (No setup required)" },
          { value: "custom", label: "Custom API Key" }
        ],
        description: "Use ChainReact's API or provide your own API key"
      },
      {
        name: "apiKey",
        label: "API Key",
        type: "text",
        dependsOn: "apiSource",
        placeholder: "sk-... or anthropic-api-key",
        description: "Your OpenAI or Anthropic API key (only needed if using custom API)"
      },
      {
        name: "temperature",
        label: "Temperature",
        type: "number",
        defaultValue: 0.7,
        min: 0,
        max: 1,
        step: 0.1,
        description: "Controls randomness: 0 = focused, 1 = creative"
      },
      {
        name: "inputNodeId",
        label: "Input Node",
        type: "select",
        required: true,
        placeholder: "Select which node should provide input to the AI Agent..."
      },
      {
        name: "memory", 
        label: "Memory", 
        type: "select",
        defaultValue: "all-storage",
        options: [
          { value: "none", label: "No memory (start fresh each time)" },
          { value: "single-storage", label: "One storage integration (select below)" },
          { value: "all-storage", label: "All connected storage integrations" },
          { value: "custom", label: "Custom selection (choose specific integrations)" }
        ],
        description: "Choose how the AI agent should access memory and context"
      },
      { 
        name: "memoryIntegration", 
        label: "Memory Integration", 
        type: "select",
        dependsOn: "memory",
        options: [
          { value: "google-drive", label: "Google Drive" },
          { value: "onedrive", label: "OneDrive" },
          { value: "dropbox", label: "Dropbox" },
          { value: "box", label: "Box" },
          { value: "notion", label: "Notion" },
          { value: "airtable", label: "Airtable" },
          { value: "google-sheets", label: "Google Sheets" }
        ],
        placeholder: "Select a storage integration for memory..."
      },
      { 
        name: "customMemoryIntegrations", 
        label: "Custom Memory Integrations", 
        type: "select", 
        multiple: true,
        dependsOn: "memory",
        options: [
          { value: "gmail", label: "Gmail" },
          { value: "slack", label: "Slack" },
          { value: "notion", label: "Notion" },
          { value: "hubspot", label: "HubSpot" },
          { value: "github", label: "GitHub" },
          { value: "google-drive", label: "Google Drive" },
          { value: "google-sheets", label: "Google Sheets" },
          { value: "google-calendar", label: "Google Calendar" },
          { value: "airtable", label: "Airtable" },
          { value: "discord", label: "Discord" },
          { value: "teams", label: "Microsoft Teams" },
          { value: "onedrive", label: "OneDrive" },
          { value: "dropbox", label: "Dropbox" },
          { value: "box", label: "Box" }
        ],
        placeholder: "Select specific integrations for memory access..."
      },
      { 
        name: "systemPrompt", 
        label: "System Prompt (Optional)", 
        type: "textarea",
        placeholder: "Override the default AI system prompt..."
      },
      {
        name: "template",
        label: "Template",
        type: "select",
        defaultValue: "none",
        options: [
          { value: "none", label: "No template (use default behavior)" },
          { value: "summarize", label: "Summarize Content" },
          { value: "extract", label: "Extract Information" },
          { value: "sentiment", label: "Sentiment Analysis" },
          { value: "translate", label: "Translate Text" },
          { value: "generate", label: "Generate Content" },
          { value: "classify", label: "Classify Content" },
          { value: "email_response", label: "Email Response" },
          { value: "data_analysis", label: "Data Analysis" },
          { value: "content_creation", label: "Content Creation" },
          { value: "customer_support", label: "Customer Support" },
          { value: "custom", label: "Custom Template" }
        ],
        description: "Choose a predefined template or create a custom one"
      },
      {
        name: "customTemplate",
        label: "Prompt",
        type: "textarea",
        dependsOn: "template",
        placeholder: "Write your custom prompt here...",
        description: "Define a custom prompt for the AI agent to follow"
      },
      {
        name: "contentType",
        label: "Content Type (for Generate template)",
        type: "select",
        dependsOn: "template",
        defaultValue: "email",
        options: [
          { value: "email", label: "Email" },
          { value: "report", label: "Report" },
          { value: "summary", label: "Summary" },
          { value: "response", label: "Response" },
          { value: "custom", label: "Custom" }
        ],
        description: "Type of content to generate (only used with Generate template)"
      },
      {
        name: "tone",
        label: "Tone",
        type: "select",
        dependsOn: "template",
        defaultValue: "professional",
        options: [
          { value: "professional", label: "Professional" },
          { value: "casual", label: "Casual" },
          { value: "friendly", label: "Friendly" },
          { value: "formal", label: "Formal" }
        ],
        description: "Tone to use for content generation"
      },
      {
        name: "length",
        label: "Length",
        type: "select",
        dependsOn: "template",
        defaultValue: "medium",
        options: [
          { value: "short", label: "Short" },
          { value: "medium", label: "Medium" },
          { value: "long", label: "Long" }
        ],
        description: "Length of generated content"
      }
    ],
    outputSchema: [
      {
        name: "output",
        label: "AI Agent Output",
        type: "string",
        description: "The complete, unprocessed AI response"
      },
      {
        name: "email_subject",
        label: "Email Subject",
        type: "string",
        description: "Generated email subject line"
      },
      {
        name: "email_body",
        label: "Email Body",
        type: "string",
        description: "Generated email body content"
      },
      {
        name: "slack_message",
        label: "Slack Message",
        type: "string",
        description: "Generated message for Slack actions"
      },
      {
        name: "discord_message",
        label: "Discord Message",
        type: "string",
        description: "Generated message for Discord actions"
      },
      {
        name: "notion_title",
        label: "Notion Page Title",
        type: "string",
        description: "Generated title for Notion page creation"
      },
      {
        name: "notion_content",
        label: "Notion Page Content",
        type: "string",
        description: "Generated content for Notion page creation"
      }
    ],
    producesOutput: true
}