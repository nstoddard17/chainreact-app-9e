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
  category: "AI & Intelligence",
  providerId: "ai",
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
      showWhen: { channel: "discord" },
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
      showWhen: { channel: "discord" },
      uiTab: "basic"
    },
    {
      name: "timeoutPreset",
      label: "Response Timeout",
      type: "select",
      description: "How long to wait for a response before timing out",
      required: false,
      options: [
        { value: "0", label: "Never (wait indefinitely)" },
        { value: "15", label: "15 minutes" },
        { value: "30", label: "30 minutes" },
        { value: "60", label: "1 hour" },
        { value: "120", label: "2 hours" },
        { value: "240", label: "4 hours" },
        { value: "480", label: "8 hours" },
        { value: "1440", label: "24 hours" },
        { value: "custom", label: "Custom..." }
      ],
      defaultValue: "60",
      uiTab: "basic"
    },
    {
      name: "timeout",
      label: "Custom Timeout (minutes)",
      type: "number",
      description: "Enter custom timeout in minutes",
      placeholder: "90",
      required: false,
      showWhen: { timeoutPreset: "custom" },
      uiTab: "basic",
      help: "Enter the number of minutes to wait (e.g., 90 for 1.5 hours)"
    },
    {
      name: "timeoutAction",
      label: "If No Response Within Timeout",
      type: "select",
      description: "What to do if the conversation times out",
      required: false,
      options: [
        { value: "cancel", label: "Cancel workflow" },
        { value: "proceed", label: "Continue automatically with original data" }
      ],
      defaultValue: "cancel",
      showWhen: { timeoutPreset: { $in: ["15", "30", "60", "120", "240", "480", "1440", "custom"] } },
      uiTab: "basic"
    },
    {
      name: "enableMemory",
      label: "Enable AI Memory & Learning",
      type: "select",
      description: "Allow the AI to learn from conversations and improve over time",
      required: false,
      options: [
        { value: "true", label: "True" },
        { value: "false", label: "False" }
      ],
      defaultValue: "true",
      uiTab: "basic"
    },
    {
      name: "autoDetectContext",
      label: "Message Mode",
      type: "select",
      description: "How to format the initial message sent to the conversation",
      required: false,
      options: [
        { value: "true", label: "Smart (AI auto-formats based on workflow data)" },
        { value: "false", label: "Manual (Use custom message template)" }
      ],
      defaultValue: "true",
      uiTab: "basic",
      help: "Smart mode intelligently formats emails, chat messages, and other data. Manual mode lets you write your own message."
    },
    {
      name: "initialMessage",
      label: "Initial Message",
      type: "discord-rich-text",
      provider: "discord",
      description: "The first message to send (use {{*}} to include all previous data)",
      placeholder: "**Workflow Paused for Review**\n\nHere's the data from the previous step:\n{{*}}\n\nLet me know when you're ready to continue!",
      required: false,
      defaultValue: "**Workflow Paused for Review**\n\nHere's the data from the previous step:\n{{*}}\n\nLet me know when you're ready to continue!",
      showWhen: { autoDetectContext: "false" },
      uiTab: "basic"
    },
    {
      name: "contextData",
      label: "Context Data",
      type: "textarea",
      description: "Specific data to include (use {{*}} for all previous data, or {{fieldName}} for specific fields)",
      placeholder: '{{*}}',
      required: false,
      defaultValue: '{{*}}',
      showWhen: { autoDetectContext: "false" },
      uiTab: "basic"
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
      name: "memoryStorageProvider",
      label: "Memory Storage Provider",
      type: "select",
      description: "Where to store AI learnings from conversations",
      required: false,
      options: [
        { value: "none", label: "None (Don't save learnings)" },
        { value: "chainreact", label: "ChainReact Memory (Recommended)" },
        { value: "google_docs", label: "Google Docs" },
        { value: "notion", label: "Notion" },
        { value: "onedrive", label: "OneDrive" }
      ],
      defaultValue: "none",
      showWhen: { enableMemory: "true" },
      uiTab: "memory",
      help: "💡 ChainReact Memory stores data securely in your account - no external setup needed!"
    },
    {
      name: "memoryDocumentId",
      label: "ChainReact Memory Document",
      type: "chainreact-memory-picker",
      description: "Select or create a memory document to store AI learnings",
      placeholder: "Select existing or create new memory document...",
      docType: "memory",
      allowCreate: true,
      required: false,
      showWhen: { enableMemory: "true", memoryStorageProvider: "chainreact" },
      uiTab: "memory",
      help: "Leave blank to create a new document, or select an existing one to append learnings"
    },
    {
      name: "knowledgeBaseProvider",
      label: "Knowledge Base Provider",
      type: "select",
      description: "Where your knowledge base documents are stored",
      required: false,
      options: [
        { value: "none", label: "None (No knowledge base)" },
        { value: "chainreact", label: "ChainReact Memory" },
        { value: "google_docs", label: "Google Docs" },
        { value: "notion", label: "Notion" },
        { value: "onedrive", label: "OneDrive" },
        { value: "dropbox", label: "Dropbox" },
        { value: "box", label: "Box" }
      ],
      defaultValue: "none",
      showWhen: { enableMemory: "true" },
      uiTab: "memory",
      help: "Knowledge base = reference documents with business policies, guidelines, and examples"
    },
    {
      name: "knowledgeBaseDocumentIds",
      label: "ChainReact Knowledge Base",
      type: "chainreact-memory-picker",
      description: "Select documents with business policies, guidelines, and examples",
      placeholder: "Select knowledge base documents...",
      docType: "knowledge_base",
      allowCreate: true,
      multiSelect: true,
      required: false,
      showWhen: { enableMemory: "true", knowledgeBaseProvider: "chainreact" },
      uiTab: "memory"
    },
    {
      name: "knowledgeBaseDocuments",
      label: "External Knowledge Base",
      type: "unified-document-picker",
      description: "Select documents containing business policies and guidelines",
      placeholder: "Click to select documents from your connected service...",
      providers: ["google_docs", "notion", "onedrive", "dropbox", "box"],
      allowInlineConnection: true,
      multiSelect: true,
      required: false,
      showWhen: {
        enableMemory: "true",
        knowledgeBaseProvider: { $in: ["google_docs", "notion", "onedrive", "dropbox", "box"] }
      },
      uiTab: "memory"
    },
    {
      name: "memoryStorageDocument",
      label: "External Memory Document",
      type: "unified-document-picker",
      description: "Choose where to store what the AI learns",
      placeholder: "Select or create a document to store AI learnings...",
      providers: ["google_docs", "notion", "onedrive"],
      allowInlineConnection: true,
      allowCreate: true,
      createLabel: "Create new memory document",
      multiSelect: false,
      required: true,
      showWhen: {
        enableMemory: "true",
        memoryStorageProvider: { $in: ["google_docs", "notion", "onedrive"] }
      },
      uiTab: "memory"
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
      showWhen: { enableMemory: "true" },
      uiTab: "memory"
    },
    {
      name: "cacheInDatabase",
      label: "Cache Memory for Faster Loading",
      type: "select",
      description: "Store a copy in database for faster access on every message",
      options: [
        { value: "true", label: "Enabled (Recommended for external providers)" },
        { value: "false", label: "Disabled" }
      ],
      defaultValue: "true",
      required: false,
      showWhen: {
        enableMemory: "true",
        memoryStorageProvider: { $in: ["google_docs", "notion", "onedrive"] }
      },
      uiTab: "memory",
      help: "⚡ Caches learnings in database to avoid slow API calls to external services. ChainReact Memory doesn't need this - it's already fast!"
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
