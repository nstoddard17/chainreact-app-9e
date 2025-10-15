import { NodeComponent } from "../../../types"

export const messageActionSchema: NodeComponent = {
  type: "ai_message",
  title: "AI Message",
  description: "Generate AI-crafted content with structured outputs",
  icon: "Zap" as any,
  category: "AI & Automation",
  providerId: "ai",
  isTrigger: false,
  testable: true,
  producesOutput: true,
  configSchema: [
    {
      name: "model",
      label: "AI Model",
      type: "select",
      required: true,
      defaultValue: "gpt-4o-mini",
      options: [
        { value: "gpt-4o", label: "GPT-4o (OpenAI – Most capable)" },
        { value: "gpt-4o-mini", label: "GPT-4o Mini (Balanced default)" },
        { value: "gpt-4-turbo", label: "GPT-4 Turbo (Fast, 128k context)" },
        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Budget friendly)" },
        { value: "claude-3-opus", label: "Claude 3 Opus (Best reasoning)" },
        { value: "claude-3-sonnet", label: "Claude 3 Sonnet (Balanced)" },
        { value: "claude-3-haiku", label: "Claude 3 Haiku (Fast)" }
      ],
      description: "Choose which model powers the message generation."
    },
    {
      name: "apiSource",
      label: "API Source",
      type: "select",
      defaultValue: "chainreact",
      options: [
        { value: "chainreact", label: "ChainReact Managed API (no setup)" },
        { value: "custom", label: "Bring your own API key" }
      ],
      description: "Decide whether to use ChainReact’s managed key or your own."
    },
    {
      name: "customApiKey",
      label: "Custom API Key",
      type: "password",
      dependsOn: "apiSource",
      visibilityCondition: { field: "apiSource", operator: "equals", value: "custom" },
      placeholder: "sk-...",
      description: "Your provider API key (encrypted). Required when using a custom source."
    },
    {
      name: "systemPrompt",
      label: "System Prompt",
      type: "textarea",
      multiline: true,
      placeholder: "Optional system instructions that set the assistant’s behavior.",
      description: "Use this to define tone, persona, or hard rules for every response."
    },
    {
      name: "userPrompt",
      label: "Message Prompt",
      type: "textarea",
      multiline: true,
      required: true,
      hasVariablePicker: true,
      placeholder: "Explain what the assistant should create. Variables like {{trigger.email.body}} are supported.",
      description: "Describe the task the AI should complete. Use variables to pass dynamic content."
    },
    {
      name: "contextNodeIds",
      label: "Include Data From Steps",
      type: "select",
      multiple: true,
      description: "Select previous steps (searches, lookups, storage reads) whose outputs should be appended as context for the model.",
      placeholder: "Select one or more steps to include…",
      uiTab: "advanced"
    },
    {
      name: "temperature",
      label: "Creativity",
      type: "number",
      defaultValue: 0.7,
      min: 0,
      max: 1,
      step: 0.1,
      description: "Lower values (0.0–0.3) keep responses focused. Higher values (0.7+) add variety."
    },
    {
      name: "outputFields",
      label: "Structured Output Fields",
      type: "textarea",
      multiline: true,
      placeholder: "subject | Short subject line\nbody | Main response content\nsummary | One sentence recap",
      description: "List each field on a new line using \"field_name | description\". These keys become available in later steps."
    },
    {
      name: "includeRawOutput",
      label: "Keep Raw Text",
      type: "boolean",
      defaultValue: true,
      description: "Store the full raw response in addition to structured fields."
    },
    {
      name: "memoryNotes",
      label: "Memory / Storage Notes",
      type: "textarea",
      multiline: true,
      placeholder: "Add reminders about doc libraries, knowledge bases, or historical context the assistant should consider.",
      description: "Describe the long-term memory or storage locations the assistant should reference (e.g. \"Use the records pulled from Airtable\" or \"Reference the meeting notes fetched earlier\").",
      uiTab: "advanced"
    }
  ],
  outputSchema: [
    {
      name: "output",
      label: "Full Output",
      type: "string",
      description: "Raw text returned by the AI model."
    },
    {
      name: "structured_output",
      label: "Structured Output",
      type: "object",
      description: "JSON object containing the structured fields defined above."
    }
  ]
}
