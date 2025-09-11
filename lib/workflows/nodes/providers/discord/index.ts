import { MessageSquare } from "lucide-react"
import { NodeComponent } from "../../types"

export const discordNodes: NodeComponent[] = [
  // Triggers
  {
    type: "discord_trigger_new_message",
    title: "New Message in Channel",
    description: "Triggers when a new message is posted in a Discord channel.",
    icon: MessageSquare,
    providerId: "discord",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "guildId",
        label: "Discord Server",
        type: "select",
        description: "The Discord server to monitor",
        placeholder: "Select a Discord server",
        dynamic: "discord_guilds",
        required: true
      },
      {
        name: "channelId",
        label: "Channel",
        type: "select",
        description: "The channel to monitor for new messages",
        placeholder: "Select a channel",
        dynamic: "discord_channels",
        dependsOn: "guildId",
        required: true,
        hidden: true
      },
      {
        name: "contentFilter",
        label: "Content Filter",
        type: "text",
        description: "Only trigger on messages containing this text (optional)",
        placeholder: "e.g., !command or keyword",
        hidden: true
      },
      {
        name: "authorFilter",
        label: "Author Filter",
        type: "select",
        description: "Only trigger on messages from this user (optional)",
        placeholder: "Any user",
        dynamic: "discord_channel_members",
        dependsOn: "channelId",
        hidden: true,
        required: false
      }
    ],
    outputSchema: [
      { name: "messageId", label: "Message ID", type: "string", description: "The unique ID of the message" },
      { name: "content", label: "Message Content", type: "string", description: "The content of the message" },
      { name: "authorId", label: "Author ID", type: "string", description: "The ID of the message author" },
      { name: "authorName", label: "Author Name", type: "string", description: "The username of the message author" },
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the channel where the message was posted" },
      { name: "channelName", label: "Channel Name", type: "string", description: "The name of the channel where the message was posted" },
      { name: "guildId", label: "Server ID", type: "string", description: "The ID of the Discord server" },
      { name: "guildName", label: "Server Name", type: "string", description: "The name of the Discord server" },
      { name: "timestamp", label: "Message Time", type: "string", description: "When the message was posted (ISO 8601 format)" },
      { name: "attachments", label: "Attachments", type: "array", description: "Array of file attachments in the message" },
      { name: "mentions", label: "Mentions", type: "array", description: "Array of user mentions in the message" }
    ]
  },
  {
    type: "discord_trigger_slash_command",
    title: "Slash Command",
    description: "Triggers when a slash command is used",
    icon: MessageSquare,
    providerId: "discord",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [{ name: "command", label: "Command", type: "text" }],
    outputSchema: [
      { name: "commandName", label: "Command Name", type: "string", description: "The name of the slash command that was used" },
      { name: "userId", label: "User ID", type: "string", description: "The ID of the user who used the command" },
      { name: "userName", label: "User Name", type: "string", description: "The username of the user who used the command" },
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the channel where the command was used" },
      { name: "channelName", label: "Channel Name", type: "string", description: "The name of the channel where the command was used" },
      { name: "guildId", label: "Server ID", type: "string", description: "The ID of the Discord server" },
      { name: "guildName", label: "Server Name", type: "string", description: "The name of the Discord server" },
      { name: "options", label: "Command Options", type: "object", description: "The options/parameters passed with the command" },
      { name: "timestamp", label: "Command Time", type: "string", description: "When the command was used (ISO 8601 format)" }
    ]
  },

  // Actions
  {
    type: "discord_action_send_message",
    title: "Send Channel Message",
    description: "Sends a message to a Discord channel.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      {
        name: "guildId",
        label: "Server",
        type: "select",
        dynamic: "discord_guilds",
        required: true,
        placeholder: "Select a Discord server"
      },
      {
        name: "channelId",
        label: "Channel",
        type: "select",
        dynamic: "discord_channels",
        required: true,
        placeholder: "Select a channel",
        dependsOn: "guildId"
      },
      {
        name: "message",
        label: "Message",
        type: "discord-rich-text",
        provider: "discord",
        required: true,
        placeholder: "Enter your message with formatting, mentions, and emojis"
      }
    ],
    outputSchema: [
      {
        name: "messageId",
        label: "Message ID",
        type: "string",
        description: "Unique identifier for the sent message"
      },
      {
        name: "content",
        label: "Content",
        type: "string",
        description: "The message content that was sent"
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "string",
        description: "Name of the channel where message was sent"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the message was sent"
      },
      {
        name: "success",
        label: "Success",
        type: "boolean",
        description: "Whether the message was sent successfully"
      }
    ]
  },
  {
    type: "discord_action_edit_message",
    title: "Edit Message",
    description: "Edit a message in a Discord channel.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", placeholder: "Select a channel" },
      { name: "messageId", label: "Message", type: "select", dynamic: "discord_messages", required: true, dependsOn: "channelId", placeholder: "Select a message" },
      { name: "content", label: "New Content", type: "discord-rich-text", provider: "discord", required: true, placeholder: "Enter new message content with formatting, mentions, and emojis" }
    ]
  },
  {
    type: "discord_action_delete_message",
    title: "Delete Message(s)",
    description: "Delete messages in a Discord channel by selection, user, or keywords.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: true, required: true, placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: true, required: true, dependsOn: "guildId", placeholder: "Select a channel" },
      { name: "messageIds", label: "Messages", type: "multi-select", dynamic: "discord_messages", required: false, dependsOn: "channelId", placeholder: "Select messages to delete (optional)", showWhen: { channelId: "!empty" } },
      { name: "userIds", label: "Users", type: "multi-select", dynamic: "discord_channel_members", required: false, dependsOn: "channelId", placeholder: "Filter by users (optional)", showWhen: { channelId: "!empty" } },
      { name: "keywords", label: "Keywords", type: "tag-input", required: false, placeholder: "Enter keywords and press Enter", description: "Delete messages containing any of these keywords" }
    ]
  },
  {
    type: "discord_action_fetch_messages",
    title: "Fetch Messages",
    description: "List recent messages from a Discord channel with optional filters.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", placeholder: "Select a channel" },
      { name: "limit", label: "Limit", type: "number", required: false, placeholder: "Number of messages (max 100)", defaultValue: 20 },
      { name: "filterType", label: "Filter Type", type: "select", required: false, options: [
        { value: "none", label: "No Filter" },
        { value: "author", label: "Filter by Author" },
        { value: "content", label: "Filter by Content" },
        { value: "has_attachments", label: "Has Attachments" },
        { value: "has_embeds", label: "Has Embeds" },
        { value: "is_pinned", label: "Pinned Messages" },
        { value: "from_bots", label: "From Bots" },
        { value: "from_humans", label: "From Humans" },
        { value: "has_reactions", label: "Has Reactions" }
      ], defaultValue: "none" },
      { name: "filterAuthor", label: "Author", type: "select", dynamic: "discord_members", required: false, dependsOn: "guildId", placeholder: "Select an author to filter by", description: "Only show messages from this user" },
      { name: "filterContent", label: "Content Contains", type: "text", required: false, placeholder: "Text to search for in messages", description: "Only show messages containing this text" },
      { name: "caseSensitive", label: "Case Sensitive Search", type: "boolean", required: false, defaultValue: false, description: "Whether content search should be case sensitive" }
    ]
  }
]