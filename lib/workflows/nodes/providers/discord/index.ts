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
    title: "Delete Message",
    description: "Delete a message in a Discord channel.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", placeholder: "Select a channel" },
      { name: "messageId", label: "Message", type: "select", dynamic: "discord_messages", required: true, dependsOn: "channelId", placeholder: "Select a message" }
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
  },
  {
    type: "discord_action_add_reaction",
    title: "Add Reaction",
    description: "Add an emoji reaction to a message.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", placeholder: "Select a channel" },
      { name: "messageId", label: "Message", type: "select", dynamic: "discord_messages", required: true, dependsOn: "channelId", placeholder: "Select a message" },
      { 
        name: "emoji", 
        label: "Reaction", 
        type: "select", 
        required: true, 
        placeholder: "Select a reaction to add",
        options: [
          { value: "👍", label: "👍 Thumbs Up" },
          { value: "👎", label: "👎 Thumbs Down" },
          { value: "❤️", label: "❤️ Heart" },
          { value: "🔥", label: "🔥 Fire" },
          { value: "😄", label: "😄 Grinning Face" },
          { value: "😢", label: "😢 Crying Face" },
          { value: "😡", label: "😡 Angry Face" },
          { value: "🎉", label: "🎉 Party Popper" },
          { value: "👏", label: "👏 Clapping Hands" },
          { value: "🙏", label: "🙏 Folded Hands" },
          { value: "🤔", label: "🤔 Thinking Face" },
          { value: "😱", label: "😱 Face Screaming in Fear" },
          { value: "😴", label: "😴 Sleeping Face" },
          { value: "🤮", label: "🤮 Face Vomiting" },
          { value: "💯", label: "💯 Hundred Points" },
          { value: "💪", label: "💪 Flexed Biceps" },
          { value: "👀", label: "👀 Eyes" },
          { value: "👻", label: "👻 Ghost" },
          { value: "🤖", label: "🤖 Robot" },
          { value: "👾", label: "👾 Alien Monster" },
          { value: "🎮", label: "🎮 Video Game" },
          { value: "🎯", label: "🎯 Direct Hit" },
          { value: "🎪", label: "🎪 Circus Tent" },
          { value: "🎨", label: "🎨 Artist Palette" },
          { value: "⚡", label: "⚡ High Voltage" },
          { value: "💥", label: "💥 Collision" },
          { value: "🌟", label: "🌟 Glowing Star" },
          { value: "✨", label: "✨ Sparkles" },
          { value: "💎", label: "💎 Gem Stone" },
          { value: "🏆", label: "🏆 Trophy" },
          { value: "🥇", label: "🥇 1st Place Medal" },
          { value: "🥈", label: "🥈 2nd Place Medal" },
          { value: "🚀", label: "🚀 Rocket" }
        ]
      }
    ]
  },
  {
    type: "discord_action_remove_reaction",
    title: "Remove Reaction",
    description: "Remove an emoji reaction from a message.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", placeholder: "Select a channel" },
      { name: "messageId", label: "Message", type: "select", dynamic: "discord_messages", required: true, dependsOn: "channelId", placeholder: "Select a message" },
      { name: "emoji", label: "Reaction to Remove", type: "hidden", required: true }
    ]
  },
  {
    type: "discord_action_create_channel",
    title: "Create Channel",
    description: "Create a new Discord channel with advanced configuration options.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      // Basic Settings Tab
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, uiTab: "basic", placeholder: "Select a Discord server" },
      { name: "name", label: "Channel Name", type: "text", required: true, uiTab: "basic" },
      { name: "type", label: "Channel Type", type: "select", options: [
        { value: "0", label: "Text Channel" },
        { value: "2", label: "Voice Channel" },
        { value: "5", label: "Announcement Channel" },
        { value: "13", label: "Stage Channel" },
        { value: "15", label: "Forum Channel" },
        { value: "16", label: "Media Channel" }
      ], required: true, defaultValue: "0", uiTab: "basic" },
      { name: "parentId", label: "Category", type: "select", dynamic: "discord_categories", required: false, uiTab: "basic", description: "Category to place this channel in", dependsOn: "guildId", placeholder: "Select a category (optional)" },
      
      // Advanced Settings Tab
      { name: "topic", label: "Topic", type: "text", required: false, uiTab: "advanced", description: "Channel description (text channels only)" },
      { name: "nsfw", label: "Age-Restricted Channel", type: "boolean", required: false, uiTab: "advanced", description: "Mark channel as age-restricted (NSFW)", defaultValue: false },
      
      // Text Channel Specific Fields
      { name: "rateLimitPerUser", label: "Rate Limit Per User", type: "number", required: false, uiTab: "advanced", description: "Slowmode in seconds (0-21600)", min: 0, max: 21600 },
      { name: "defaultAutoArchiveDuration", label: "Default Auto-Archive Duration", type: "select", required: false, uiTab: "advanced", options: [
        { value: "60", label: "1 Hour" },
        { value: "1440", label: "24 Hours" },
        { value: "4320", label: "3 Days" },
        { value: "10080", label: "1 Week" }
      ], description: "Default auto-archive duration for threads" },
      
      // Voice Channel Specific Fields
      { name: "bitrate", label: "Bitrate", type: "number", required: false, uiTab: "advanced", description: "Voice channel bitrate (8000-128000)", min: 8000, max: 128000, defaultValue: 64000 },
      { name: "userLimit", label: "User Limit", type: "number", required: false, uiTab: "advanced", description: "Maximum number of users (0-99, 0 = no limit)", min: 0, max: 99 },
      { name: "rtcRegion", label: "Voice Region", type: "text", required: false, uiTab: "advanced", description: "Voice region ID (auto, us-east, us-west, etc.)" },
      
      // Forum Channel Specific Fields
      { name: "defaultReactionEmoji", label: "Default Reaction Emoji", type: "text", required: false, uiTab: "advanced", description: "Default reaction emoji for forum posts" },
      { name: "defaultThreadRateLimitPerUser", label: "Default Thread Rate Limit", type: "number", required: false, uiTab: "advanced", description: "Default rate limit per user for threads", min: 0, max: 21600 },
      { name: "defaultSortOrder", label: "Default Sort Order", type: "select", required: false, uiTab: "advanced", options: [
        { value: "0", label: "Latest Activity" },
        { value: "1", label: "Creation Date" }
      ], description: "Default sort order for forum posts" },
      { name: "defaultForumLayout", label: "Default Forum Layout", type: "select", required: false, uiTab: "advanced", options: [
        { value: "0", label: "Not Set" },
        { value: "1", label: "List View" },
        { value: "2", label: "Gallery View" }
      ], description: "Default layout for forum posts" },
      
      // Advanced Settings
      { name: "permissionOverwrites", label: "Permission Overwrites", type: "textarea", required: false, uiTab: "advanced", description: "JSON array of permission overwrites" },
      { name: "availableTags", label: "Available Tags", type: "textarea", required: false, uiTab: "advanced", description: "JSON array of available tags for forum channels" }
    ]
  },
  {
    type: "discord_action_update_channel",
    title: "Update Channel",
    description: "Update a channel's name, topic, or permissions.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      // Basic Settings Tab
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, uiTab: "basic", placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", uiTab: "basic", placeholder: "Select a channel" },
      { name: "name", label: "New Name", type: "text", required: false, uiTab: "basic" },
      
      // Advanced Settings Tab
      { name: "topic", label: "Topic", type: "text", required: false, uiTab: "advanced", description: "Channel description (text channels only)" },
      { name: "nsfw", label: "Age-Restricted Channel", type: "boolean", required: false, uiTab: "advanced", description: "Mark channel as age-restricted (NSFW)", defaultValue: false },
      
      // Text Channel Specific Fields
      { name: "rateLimitPerUser", label: "Rate Limit Per User", type: "number", required: false, uiTab: "advanced", description: "Slowmode in seconds (0-21600)", min: 0, max: 21600 },
      { name: "defaultAutoArchiveDuration", label: "Default Auto-Archive Duration", type: "select", required: false, uiTab: "advanced", options: [
        { value: "60", label: "1 Hour" },
        { value: "1440", label: "24 Hours" },
        { value: "4320", label: "3 Days" },
        { value: "10080", label: "1 Week" }
      ], description: "Default auto-archive duration for threads" },
      
      // Voice Channel Specific Fields
      { name: "bitrate", label: "Bitrate", type: "number", required: false, uiTab: "advanced", description: "Voice channel bitrate (8000-128000)", min: 8000, max: 128000, defaultValue: 64000 },
      { name: "userLimit", label: "User Limit", type: "number", required: false, uiTab: "advanced", description: "Maximum number of users (0-99, 0 = no limit)", min: 0, max: 99 },
      { name: "rtcRegion", label: "Voice Region", type: "text", required: false, uiTab: "advanced", description: "Voice region ID (auto, us-east, us-west, etc.)" },
      
      // Forum Channel Specific Fields
      { name: "defaultReactionEmoji", label: "Default Reaction Emoji", type: "text", required: false, uiTab: "advanced", description: "Default reaction emoji for forum posts" },
      { name: "defaultThreadRateLimitPerUser", label: "Default Thread Rate Limit", type: "number", required: false, uiTab: "advanced", description: "Default rate limit per user for threads", min: 0, max: 21600 },
      { name: "defaultSortOrder", label: "Default Sort Order", type: "select", required: false, uiTab: "advanced", options: [
        { value: "0", label: "Latest Activity" },
        { value: "1", label: "Creation Date" }
      ], description: "Default sort order for forum posts" },
      { name: "defaultForumLayout", label: "Default Forum Layout", type: "select", required: false, uiTab: "advanced", options: [
        { value: "0", label: "Not Set" },
        { value: "1", label: "List View" },
        { value: "2", label: "Gallery View" }
      ], description: "Default layout for forum posts" },
      
      // Advanced Settings
      { name: "position", label: "Position", type: "number", required: false, uiTab: "advanced", description: "Channel position in the list" },
      { name: "permissionOverwrites", label: "Permission Overwrites", type: "textarea", required: false, uiTab: "advanced", description: "JSON array of permission overwrites" },
      { name: "availableTags", label: "Available Tags", type: "textarea", required: false, uiTab: "advanced", description: "JSON array of available tags for forum channels" }
    ]
  },
  {
    type: "discord_action_delete_channel",
    title: "Delete Channel",
    description: "Delete a channel in a Discord server with optional filtering.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      // Basic Settings Tab
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, uiTab: "basic", placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", uiTab: "basic", placeholder: "Select a channel" },
      
      // Advanced Settings Tab
      { name: "channelTypes", label: "Channel Types", type: "multi-select", required: false, uiTab: "advanced", description: "Filter by channel types", options: [
        { value: "0", label: "Text Channels" },
        { value: "2", label: "Voice Channels" },
        { value: "4", label: "Categories" },
        { value: "5", label: "Announcement Channels" },
        { value: "13", label: "Stage Channels" },
        { value: "15", label: "Forum Channels" }
      ]},
      { name: "nameFilter", label: "Name Filter", type: "text", required: false, uiTab: "advanced", description: "Filter channels by name (case-insensitive)", placeholder: "e.g., general, admin, support" },
      { name: "parentCategory", label: "Parent Category", type: "select", dynamic: "discord_categories", required: false, uiTab: "advanced", description: "Only show channels in this category", dependsOn: "guildId", placeholder: "Select a category (optional)" }
    ]
  },
  {
    type: "discord_action_create_category",
    title: "Create Category",
    description: "Create a new Discord category to organize channels.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, uiTab: "basic", placeholder: "Select a Discord server" },
      { name: "name", label: "Category Name", type: "text", required: true, uiTab: "basic" },
      { name: "private", label: "Private Category", type: "boolean", required: false, uiTab: "basic", description: "Make this category private (only visible to specific roles)", defaultValue: false },
      
      // Advanced Settings Tab
      { name: "position", label: "Position", type: "number", required: false, uiTab: "advanced", description: "Category position in the list" },
      { name: "permissionOverwrites", label: "Permission Overwrites", type: "textarea", required: false, uiTab: "advanced", description: "JSON array of permission overwrites" }
    ]
  },
  {
    type: "discord_action_delete_category",
    title: "Delete Category",
    description: "Delete a Discord category and optionally move its channels with optional filtering.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      // Basic Settings Tab
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, uiTab: "basic", placeholder: "Select a Discord server" },
      { name: "categoryId", label: "Category", type: "select", dynamic: "discord_categories", required: true, dependsOn: "guildId", uiTab: "basic", placeholder: "Select a category" },
      { name: "moveChannels", label: "Move Channels to General", type: "boolean", required: false, uiTab: "basic", description: "Move channels from this category to the general area before deleting", defaultValue: true },
      
      // Advanced Settings Tab
      { name: "nameFilter", label: "Name Filter", type: "text", required: false, uiTab: "advanced", description: "Filter categories by name (case-insensitive)", placeholder: "e.g., admin, public, private" },
      { name: "sortBy", label: "Sort By", type: "select", required: false, uiTab: "advanced", description: "How to sort the categories", options: [
        { value: "position", label: "Position (default)" },
        { value: "name", label: "Name (A-Z)" },
        { value: "name_desc", label: "Name (Z-A)" },
        { value: "created", label: "Newest First" },
        { value: "created_old", label: "Oldest First" }
      ], defaultValue: "position" }
    ]
  },
  {
    type: "discord_action_fetch_guild_members",
    title: "Fetch Guild Members",
    description: "List members in a Discord server with optional filtering.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      // Basic Settings Tab
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, uiTab: "basic", placeholder: "Select a Discord server" },
      { name: "limit", label: "Limit", type: "number", required: false, defaultValue: 50, placeholder: "Number of members (max 1000)", uiTab: "basic" },
      
      // Advanced Settings Tab
      { name: "nameFilter", label: "Name Filter", type: "text", required: false, uiTab: "advanced", description: "Filter members by username or nickname (case-insensitive)", placeholder: "e.g., admin, moderator, john" },
      { name: "roleFilter", label: "Role Filter", type: "select", dynamic: "discord_roles", required: false, uiTab: "advanced", description: "Only show members with this role", dependsOn: "guildId", placeholder: "Select a role (optional)" },
      { name: "sortBy", label: "Sort By", type: "select", required: false, uiTab: "advanced", description: "How to sort the members", options: [
        { value: "joined", label: "Join Date (newest first)" },
        { value: "joined_old", label: "Join Date (oldest first)" },
        { value: "name", label: "Name (A-Z)" },
        { value: "name_desc", label: "Name (Z-A)" },
        { value: "username", label: "Username (A-Z)" },
        { value: "username_desc", label: "Username (Z-A)" }
      ], defaultValue: "joined" },
      { name: "includeBots", label: "Include Bots", type: "boolean", required: false, uiTab: "advanced", description: "Include bot users in results", defaultValue: false }
    ]
  },
  {
    type: "discord_action_assign_role",
    title: "Assign Role to Member",
    description: "Assign a role to a member in a Discord server.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "userId", label: "Member", type: "select", dynamic: "discord_members", required: true, dependsOn: "guildId", placeholder: "Select a member", hasVariablePicker: true },
      { name: "roleId", label: "Role", type: "select", dynamic: "discord_roles", required: true, dependsOn: "guildId", placeholder: "Select a role" }
    ]
  },
  {
    type: "discord_action_remove_role",
    title: "Remove Role from Member",
    description: "Remove a role from a member in a Discord server.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "userId", label: "Member", type: "select", dynamic: "discord_members", required: true, dependsOn: "guildId", placeholder: "Select a member", hasVariablePicker: true },
      { name: "roleId", label: "Role", type: "select", dynamic: "discord_roles", required: true, dependsOn: "guildId", placeholder: "Select a role" }
    ]
  },
  {
    type: "discord_action_kick_member",
    title: "Kick Member",
    description: "Kick a member from a Discord server.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "userId", label: "Member", type: "select", dynamic: "discord_members", required: true, dependsOn: "guildId", placeholder: "Select a member" },
      { name: "reason", label: "Reason", type: "text", required: false, placeholder: "Reason for kicking (optional)" }
    ]
  },
  {
    type: "discord_action_ban_member",
    title: "Ban Member",
    description: "Ban a member from a Discord server.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "userId", label: "Member", type: "select", dynamic: "discord_members", required: true, dependsOn: "guildId", placeholder: "Select a member" },
      { name: "reason", label: "Reason", type: "text", required: false, placeholder: "Reason for banning (optional)" },
      { name: "deleteMessageSeconds", label: "Delete Messages", type: "select", required: false, placeholder: "Select message deletion option", options: [
        { value: "0", label: "Don't delete any messages" },
        { value: "3600", label: "Delete messages from last hour" },
        { value: "86400", label: "Delete messages from last day" },
        { value: "604800", label: "Delete messages from last week" },
        { value: "2592000", label: "Delete messages from last month" },
        { value: "7776000", label: "Delete messages from last 3 months" },
        { value: "31536000", label: "Delete all messages (1 year)" }
      ], defaultValue: "0" }
    ]
  },
  {
    type: "discord_action_unban_member",
    title: "Unban Member",
    description: "Unban a member from a Discord server.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "userId", label: "Banned User", type: "select", dynamic: "discord_banned_users", required: true, dependsOn: "guildId", placeholder: "Select a banned user" }
    ]
  }
]