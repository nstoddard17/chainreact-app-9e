/**
 * Human-in-the-Loop (HITL) Node
 * Pauses workflow execution for conversational interaction before continuing
 */

import { MessageCircle } from 'lucide-react'
import type { NodeComponent } from '../../types'

export const hitlAction: NodeComponent = {
  type: "hitl_conversation",
  title: "Ask Human via Chat",
  description: "Pause workflow and have an AI-powered conversation with a human before continuing",
  icon: MessageCircle,
  category: "Automation",
  isTrigger: false,
  producesOutput: true,
  configSchema: [
    {
      name: "channel",
      label: "Channel Type",
      type: "select",
      description: "Where to send the conversation request",
      required: true,
      options: [
        { value: "discord", label: "Discord" },
        // { value: "slack", label: "Slack (Coming Soon)" },
        // { value: "sms", label: "SMS (Coming Soon)" }
      ],
      defaultValue: "discord",
      uiTab: "basic"
    },
    {
      name: "discordGuildId",
      label: "Discord Server",
      type: "select",
      description: "The Discord server to send messages to",
      placeholder: "Select a Discord server",
      dynamic: "discord_guilds",
      dynamicProvider: "discord",
      required: true,
      visibleWhen: { channel: "discord" },
      loadOnMount: true,
      uiTab: "basic"
    },
    {
      name: "discordChannelId",
      label: "Discord Channel",
      type: "select",
      description: "The channel where the conversation will happen",
      placeholder: "Select a channel",
      dynamic: "discord_channels",
      dynamicProvider: "discord",
      required: true,
      dependsOn: "discordGuildId",
      visibleWhen: { channel: "discord" },
      uiTab: "basic"
    },
    {
      name: "autoDetectContext",
      label: "Auto-Detect Context",
      type: "checkbox",
      description: "Automatically include all data from the previous step",
      defaultValue: true,
      required: false,
      uiTab: "basic"
    },
    {
      name: "availableDataPreview",
      label: "Available Data",
      type: "info",
      description: "The workflow will automatically format and display all data from the previous step. You can optionally add a custom introduction message below.",
      visibleWhen: { autoDetectContext: true },
      uiTab: "basic"
    },
    {
      name: "customMessage",
      label: "Custom Introduction (Optional)",
      type: "textarea",
      description: "Add a custom message before the auto-detected data",
      placeholder: "I need your approval before proceeding...",
      required: false,
      visibleWhen: { autoDetectContext: true },
      uiTab: "basic"
    },
    {
      name: "initialMessage",
      label: "Initial Message",
      type: "discord-rich-text",
      provider: "discord",
      description: "The first message to send (use {{*}} to include all previous data)",
      placeholder: "**Workflow Paused for Review**\n\nHere's the data from the previous step:\n{{*}}\n\nLet me know when you're ready to continue!",
      required: false,
      visibleWhen: { autoDetectContext: false },
      defaultValue: "**Workflow Paused for Review**\n\nHere's the data from the previous step:\n{{*}}\n\nLet me know when you're ready to continue!",
      uiTab: "advanced"
    },
    {
      name: "contextData",
      label: "Context Data",
      type: "textarea",
      description: "Specific data to include (use {{*}} for all previous data, or {{fieldName}} for specific fields)",
      placeholder: '{{*}}',
      required: false,
      visibleWhen: { autoDetectContext: false },
      defaultValue: '{{*}}',
      uiTab: "advanced"
    },
    {
      name: "systemPrompt",
      label: "AI System Prompt",
      type: "textarea",
      description: "Instructions for the AI assistant during the conversation",
      placeholder: "You are helping review an email before sending. Discuss the content, tone, and timing. Extract the user's final decision.",
      required: false,
      uiTab: "advanced",
      defaultValue: "You are a helpful workflow assistant. Help the user review and refine this workflow step. Answer questions about the data and accept modifications. When the user is satisfied, detect continuation signals like 'continue', 'proceed', 'go ahead', or 'send it'."
    },
    {
      name: "extractVariables",
      label: "Variables to Extract",
      type: "json",
      description: "Define what information to extract from the conversation",
      placeholder: '{\n  "userDecision": "approved | rejected | modified",\n  "modifiedContent": "If user suggested changes, the updated content",\n  "userNotes": "Any additional context from the conversation"\n}',
      required: false,
      uiTab: "advanced",
      defaultValue: '{\n  "decision": "The user\'s final decision",\n  "notes": "Any additional context provided by the user"\n}'
    },
    {
      name: "timeout",
      label: "Timeout (minutes)",
      type: "number",
      description: "How long to wait for a response before timing out",
      placeholder: "60",
      required: false,
      defaultValue: 60,
      uiTab: "advanced"
    },
    {
      name: "timeoutAction",
      label: "Timeout Action",
      type: "select",
      description: "What to do if the conversation times out",
      required: false,
      options: [
        { value: "cancel", label: "Cancel Workflow" },
        { value: "proceed", label: "Proceed Anyway" }
      ],
      defaultValue: "cancel",
      uiTab: "advanced"
    },
    {
      name: "continuationSignals",
      label: "Continuation Signals",
      type: "tag-input",
      description: "Phrases that signal the user is ready to continue",
      placeholder: "continue, proceed, go ahead",
      required: false,
      defaultValue: ["continue", "proceed", "go ahead", "send it", "looks good", "approve"],
      uiTab: "advanced"
    },
    {
      name: "enableMemory",
      label: "Enable AI Memory & Learning",
      type: "checkbox",
      description: "Allow the AI to learn from conversations and improve over time",
      defaultValue: true,
      required: false,
      uiTab: "memory"
    },
    {
      name: "knowledgeBaseDocuments",
      label: "Knowledge Base Documents",
      type: "unified-document-picker",
      description: "Select documents containing business policies, guidelines, and examples for the AI to reference",
      placeholder: "Click to select documents from any connected service...",
      providers: ["google_docs", "notion", "onedrive", "dropbox", "box"],
      allowInlineConnection: true,
      multiSelect: true,
      required: false,
      visibleWhen: { enableMemory: true },
      uiTab: "memory"
    },
    {
      name: "memoryStorageDocument",
      label: "AI Memory Storage Location (Required)",
      type: "unified-document-picker",
      description: "Choose where to store what the AI learns. You control this data and can edit it anytime.",
      placeholder: "Select or create a document to store AI learnings...",
      providers: ["google_docs", "notion", "onedrive"],
      allowInlineConnection: true,
      allowCreate: true,
      createLabel: "Create new memory document",
      multiSelect: false,
      required: true,
      visibleWhen: { enableMemory: true },
      uiTab: "memory",
      help: "💡 Your AI's learnings will be stored in YOUR document, not our database. You have full control!"
    },
    {
      name: "memoryCategories",
      label: "What Should AI Learn?",
      type: "multi-select",
      description: "Select what the AI should remember from conversations",
      options: [
        { value: "tone_preferences", label: "Tone & Style Preferences" },
        { value: "formatting_rules", label: "Formatting Rules" },
        { value: "approval_criteria", label: "Approval Criteria" },
        { value: "common_corrections", label: "Common Corrections" },
        { value: "business_context", label: "Business Context & Policies" },
        { value: "user_preferences", label: "Personal Preferences" }
      ],
      defaultValue: ["tone_preferences", "formatting_rules", "approval_criteria", "common_corrections"],
      required: false,
      visibleWhen: { enableMemory: true },
      uiTab: "memory"
    },
    {
      name: "cacheInDatabase",
      label: "Cache Memory for Faster Loading",
      type: "checkbox",
      description: "Store a copy in database for faster access (recommended)",
      defaultValue: true,
      required: false,
      visibleWhen: { enableMemory: true },
      uiTab: "memory"
    }
  ],
  outputSchema: [
    {
      name: "status",
      label: "Status",
      type: "string",
      description: "The result status: 'continued', 'timeout', or 'cancelled'"
    },
    {
      name: "conversationSummary",
      label: "Conversation Summary",
      type: "string",
      description: "A summary of what was discussed"
    },
    {
      name: "messagesCount",
      label: "Message Count",
      type: "number",
      description: "Number of messages exchanged in the conversation"
    },
    {
      name: "duration",
      label: "Duration (seconds)",
      type: "number",
      description: "How long the conversation lasted"
    },
    {
      name: "extractedVariables",
      label: "Extracted Variables",
      type: "object",
      description: "Variables extracted from the conversation as defined in config"
    },
    {
      name: "conversationHistory",
      label: "Full Conversation",
      type: "array",
      description: "Complete conversation history with all messages"
    }
  ]
}

// Export all HITL nodes
export const hitlNodes: NodeComponent[] = [
  hitlAction,
]
