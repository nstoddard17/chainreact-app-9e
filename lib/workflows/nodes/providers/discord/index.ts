import { MessageSquare } from "lucide-react"
import { NodeComponent } from "../../types"

export const discordNodes: NodeComponent[] = [
  // Triggers
  {
    type: "discord_trigger_member_join",
    title: "User Joined Server",
    description: "Triggers when a user joins a Discord server. Tracks which invite was used.",
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
        required: true,
        loadOnMount: true
      },
      {
        name: "inviteFilter",
        label: "Specific Invite Code (Optional)",
        type: "text",
        description: "Only trigger when users join via this invite (accepts code or full https://discord.gg/ URL)",
        placeholder: "e.g., abc123 or https://discord.gg/abc123",
        required: false
      }
    ],
    outputSchema: [
      { name: "memberId", label: "Member ID", type: "string", description: "The unique ID of the member who joined" },
      { name: "memberTag", label: "Member Tag", type: "string", description: "The full tag of the member (username#discriminator)" },
      { name: "memberUsername", label: "Username", type: "string", description: "The username of the member" },
      { name: "memberDiscriminator", label: "Discriminator", type: "string", description: "The discriminator of the member" },
      { name: "memberAvatar", label: "Avatar Hash", type: "string", description: "The avatar hash of the member" },
      { name: "guildId", label: "Server ID", type: "string", description: "The ID of the Discord server" },
      { name: "guildName", label: "Server Name", type: "string", description: "The name of the Discord server" },
      { name: "joinedAt", label: "Join Time", type: "string", description: "When the member joined (ISO 8601 format)" },
      { name: "inviteCode", label: "Invite Code", type: "string", description: "The invite code used to join (if trackable)" },
      { name: "inviteUrl", label: "Invite URL", type: "string", description: "The full invite URL used (if trackable)" },
      { name: "inviterTag", label: "Inviter Tag", type: "string", description: "The tag of who created the invite (if trackable)" },
      { name: "inviterId", label: "Inviter ID", type: "string", description: "The ID of who created the invite (if trackable)" },
      { name: "inviteUses", label: "Invite Uses", type: "number", description: "Number of times the invite has been used" },
      { name: "inviteMaxUses", label: "Invite Max Uses", type: "number", description: "Maximum uses allowed for the invite" },
      { name: "timestamp", label: "Event Time", type: "string", description: "When this event occurred (ISO 8601 format)" }
    ]
  },
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
        required: true,
        loadOnMount: true
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
    configSchema: [
      {
        name: "guildId",
        label: "Discord Server",
        type: "select",
        description: "Server where the slash command will be used",
        placeholder: "Select a server",
        dynamic: "discord_guilds",
        required: true,
        uiTab: "basic",
        loadOnMount: true
      },
      {
        name: "command",
        label: "Slash Command",
        type: "combobox",
        description: "Pick an existing command or type a new one to create",
        placeholder: "/your-command",
        dynamic: "discord_commands",
        dependsOn: "guildId",
        creatable: true,
        required: true,
        uiTab: "basic"
      },
      {
        name: "commandDescription",
        label: "Command Description",
        type: "text",
        placeholder: "Describe what this command does",
        description: "Shown in Discord’s UI when users browse slash commands",
        uiTab: "basic"
      },
      {
        name: "commandOptions",
        label: "Options / Subcommands (JSON)",
        type: "json",
        placeholder: "[]",
        description: "Advanced: Define Discord application command options and nested subcommands as JSON array",
        uiTab: "advanced",
        helpText: "Use Discord’s Application Command Options schema. Example: [{ \"type\": 3, \"name\": \"query\", \"description\": \"Search text\", \"required\": true }] or subcommand groups."
      }
    ],
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
        placeholder: "Select a Discord server",
        loadOnMount: true
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
    description: "Edit a bot's own message in a Discord channel. Note: Discord API only allows bots to edit their own messages.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server", loadOnMount: true },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", placeholder: "Select a channel" },
      { name: "messageId", label: "Message (Bot's Own)", type: "select", dynamic: "discord_messages", required: true, dependsOn: "channelId", placeholder: "Select a bot message to edit" },
      { name: "content", label: "New Content", type: "discord-rich-text", provider: "discord", required: true, placeholder: "Enter new message content with formatting, mentions, and emojis" }
    ],
    outputSchema: [
      {
        name: "messageId",
        label: "Message ID",
        type: "string",
        description: "The ID of the edited message"
      },
      {
        name: "content",
        label: "Updated Content",
        type: "string",
        description: "The new message content"
      },
      {
        name: "channelId",
        label: "Channel ID",
        type: "string",
        description: "The ID of the channel containing the message"
      },
      {
        name: "timestamp",
        label: "Edit Timestamp",
        type: "string",
        description: "When the message was edited"
      },
      {
        name: "success",
        label: "Success",
        type: "boolean",
        description: "Whether the message was edited successfully"
      }
    ]
  },
  {
    type: "discord_action_delete_message",
    title: "Delete Message(s)",
    description: "Delete messages in a Discord channel. Can bulk delete up to 100 recent messages based on filters.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server", loadOnMount: true },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", placeholder: "Select a channel" },
      { name: "messageIds", label: "Messages", type: "multi-select", dynamic: "discord_messages", required: false, dependsOn: "channelId", placeholder: "Select specific messages OR use filters below", description: "Leave empty to use user/keyword filters instead" },
      { name: "userIds", label: "Users", type: "multi-select", dynamic: "discord_members", required: false, dependsOn: "guildId", placeholder: "Filter by users (optional)", description: "Delete all messages from selected users (last 100 messages)" },
      { name: "keywords", label: "Keywords", type: "tag-input", required: false, placeholder: "Enter keywords and press Enter", description: "Delete messages containing these keywords (case-insensitive, partial match)" },
      { name: "keywordMatchType", label: "Keyword Match Type", type: "select", required: false, options: [
        { value: "partial", label: "Partial Match (default) - 'trans' matches 'transistor'" },
        { value: "whole", label: "Whole Word - 'trans' won't match 'transistor'" },
        { value: "exact", label: "Exact Match - case-sensitive exact match" }
      ], defaultValue: "partial", description: "How to match keywords in messages" }
    ],
    outputSchema: [
      {
        name: "deletedCount",
        label: "Deleted Count",
        type: "number",
        description: "Number of messages deleted"
      },
      {
        name: "messageIds",
        label: "Deleted Message IDs",
        type: "array",
        description: "Array of IDs of deleted messages"
      },
      {
        name: "channelId",
        label: "Channel ID",
        type: "string",
        description: "The ID of the channel where messages were deleted"
      },
      {
        name: "timestamp",
        label: "Deletion Timestamp",
        type: "string",
        description: "When the deletion occurred"
      },
      {
        name: "success",
        label: "Success",
        type: "boolean",
        description: "Whether the deletion was successful"
      }
    ]
  },
  {
    type: "discord_action_fetch_messages",
    title: "Get Messages",
    description: "List recent messages from a Discord channel with optional filters.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server", loadOnMount: true },
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
    ],
    outputSchema: [
      {
        name: "messages",
        label: "Messages",
        type: "array",
        description: "Array of message objects from the channel"
      },
      {
        name: "count",
        label: "Message Count",
        type: "number",
        description: "Number of messages retrieved"
      },
      {
        name: "channelId",
        label: "Channel ID",
        type: "string",
        description: "The ID of the channel"
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "string",
        description: "The name of the channel"
      },
      {
        name: "hasMore",
        label: "Has More Messages",
        type: "boolean",
        description: "Whether there are more messages available beyond the limit"
      }
    ]
  },
  {
    type: "discord_action_assign_role",
    title: "Assign Role",
    description: "Assign a role to a Discord user in a server.",
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
        placeholder: "Select a Discord server",
        loadOnMount: true
      },
      {
        name: "userId",
        label: "User",
        type: "select",
        dynamic: "discord_members",
        required: true,
        dependsOn: "guildId",
        placeholder: "Select a user",
        description: "The user to assign the role to",
        hidden: true // Hide until guildId is selected
      },
      {
        name: "roleId",
        label: "Role",
        type: "select",
        dynamic: "discord_roles",
        required: true,
        dependsOn: "guildId",
        placeholder: "Select a role to assign",
        description: "The role to assign to the user",
        hidden: true // Hide until guildId is selected
      }
    ],
    outputSchema: [
      {
        name: "success",
        label: "Success",
        type: "boolean",
        description: "Whether the role was assigned successfully"
      },
      {
        name: "guildId",
        label: "Server ID",
        type: "string",
        description: "The ID of the Discord server"
      },
      {
        name: "userId",
        label: "User ID",
        type: "string",
        description: "The ID of the user"
      },
      {
        name: "roleId",
        label: "Role ID",
        type: "string",
        description: "The ID of the role assigned"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the role was assigned"
      }
    ]
  }
]
