/**
 * Human-in-the-Loop (HITL) Node
 * Pauses workflow execution for conversational interaction before continuing
 */

import { MessageCircle } from 'lucide-react'
import type { NodeComponent } from '../../types'

export const hitlAction: NodeComponent = {
  type: "hitl_conversation",
  title: "Human-in-the-Loop",
  description: "Pause workflow for a conversational approval or input from a human",
  icon: MessageCircle,
  providerId: "automation",
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
      required: true,
      dependsOn: "channel",
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
      required: true,
      dependsOn: "discordGuildId",
      visibleWhen: { channel: "discord" },
      uiTab: "basic"
    },
    {
      name: "initialMessage",
      label: "Initial Message",
      type: "discord-rich-text",
      provider: "discord",
      description: "The first message to send (can use {{variables}})",
      placeholder: "I'm about to {{action}}. Here's what I have:\n{{context}}",
      required: true,
      uiTab: "basic"
    },
    {
      name: "contextData",
      label: "Context Data",
      type: "textarea",
      description: "Data available for the AI to discuss (JSON or text, can use {{variables}})",
      placeholder: '{\n  "emailDraft": "{{emailBody}}",\n  "recipient": "{{recipientEmail}}"\n}',
      required: false,
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
