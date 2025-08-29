import { MessageSquare, MessageCircle, Heart, HeartOff, Hash, UserPlus, UserMinus, FileText } from "lucide-react"
import { NodeComponent } from "../../types"

export const slackNodes: NodeComponent[] = [
  // Triggers
  {
    type: "slack_trigger_message_channels",
    title: "New Message in Public Channel",
    description: "Triggers when a message is posted to a public channel",
    icon: MessageSquare,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: false,
        dynamic: "slack_channels",
        description: "Optional: Filter to a specific channel. Leave empty to listen to all public channels."
      },
    ],
    outputSchema: [
      { name: "messageText", label: "Message Text", type: "string", description: "The content of the message" },
      { name: "userId", label: "User ID", type: "string", description: "The ID of the user who sent the message" },
      { name: "userName", label: "User Name", type: "string", description: "The display name of the user who sent the message" },
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the channel where the message was posted" },
      { name: "channelName", label: "Channel Name", type: "string", description: "The name of the channel where the message was posted" },
      { name: "timestamp", label: "Message Timestamp", type: "string", description: "The timestamp of the message" },
      { name: "threadTimestamp", label: "Thread Timestamp", type: "string", description: "The thread timestamp if this is part of a thread" },
      { name: "attachments", label: "Attachments", type: "array", description: "Any attachments included with the message" },
      { name: "mentions", label: "Mentions", type: "array", description: "Users mentioned in the message" }
    ]
  },
  {
    type: "slack_trigger_message_groups",
    title: "New Message in Private Channel",
    description: "Triggers when a message is posted to a private channel",
    icon: MessageSquare,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "channel",
        label: "Private Channel",
        type: "select",
        required: false,
        dynamic: "slack_channels",
        description: "Optional: Filter to a specific private channel. Leave empty to listen to all private channels."
      },
    ],
    outputSchema: [
      { name: "messageText", label: "Message Text", type: "string", description: "The content of the message" },
      { name: "userId", label: "User ID", type: "string", description: "The ID of the user who sent the message" },
      { name: "userName", label: "User Name", type: "string", description: "The display name of the user who sent the message" },
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the private channel where the message was posted" },
      { name: "channelName", label: "Channel Name", type: "string", description: "The name of the private channel where the message was posted" },
      { name: "timestamp", label: "Message Timestamp", type: "string", description: "The timestamp of the message" },
      { name: "threadTimestamp", label: "Thread Timestamp", type: "string", description: "The thread timestamp if this is part of a thread" },
      { name: "attachments", label: "Attachments", type: "array", description: "Any attachments included with the message" },
      { name: "mentions", label: "Mentions", type: "array", description: "Users mentioned in the message" }
    ]
  },
  {
    type: "slack_trigger_message_im",
    title: "New Direct Message",
    description: "Triggers when a direct message is sent",
    icon: MessageCircle,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "messageText", label: "Message Text", type: "string", description: "The content of the direct message" },
      { name: "userId", label: "User ID", type: "string", description: "The ID of the user who sent the message" },
      { name: "userName", label: "User Name", type: "string", description: "The display name of the user who sent the message" },
      { name: "channelId", label: "DM Channel ID", type: "string", description: "The ID of the direct message channel" },
      { name: "timestamp", label: "Message Timestamp", type: "string", description: "The timestamp of the message" },
      { name: "attachments", label: "Attachments", type: "array", description: "Any attachments included with the message" }
    ]
  },
  {
    type: "slack_trigger_message_mpim",
    title: "New Group Direct Message",
    description: "Triggers when a message is sent in a group direct message",
    icon: MessageCircle,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "messageText", label: "Message Text", type: "string", description: "The content of the group direct message" },
      { name: "userId", label: "User ID", type: "string", description: "The ID of the user who sent the message" },
      { name: "userName", label: "User Name", type: "string", description: "The display name of the user who sent the message" },
      { name: "channelId", label: "Group DM Channel ID", type: "string", description: "The ID of the group direct message channel" },
      { name: "timestamp", label: "Message Timestamp", type: "string", description: "The timestamp of the message" },
      { name: "attachments", label: "Attachments", type: "array", description: "Any attachments included with the message" }
    ]
  },
  {
    type: "slack_trigger_reaction_added",
    title: "Reaction Added",
    description: "Triggers when a reaction is added to a message",
    icon: Heart,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: false,
        dynamic: "slack_channels",
        description: "Optional: Filter to a specific channel. Leave empty to listen to all channels."
      },
      { 
        name: "emoji", 
        label: "Emoji", 
        type: "text", 
        required: false,
        placeholder: "e.g., thumbsup (without colons)",
        description: "Optional: Filter to a specific emoji. Leave empty to listen to all reactions."
      },
    ],
    outputSchema: [
      { name: "reaction", label: "Reaction Emoji", type: "string", description: "The emoji that was added (without colons)" },
      { name: "userId", label: "User ID", type: "string", description: "The ID of the user who added the reaction" },
      { name: "userName", label: "User Name", type: "string", description: "The display name of the user who added the reaction" },
      { name: "itemUserId", label: "Item User ID", type: "string", description: "The ID of the user who posted the original message" },
      { name: "itemUserName", label: "Item User Name", type: "string", description: "The display name of the user who posted the original message" },
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the channel containing the message" },
      { name: "channelName", label: "Channel Name", type: "string", description: "The name of the channel containing the message" },
      { name: "messageTimestamp", label: "Message Timestamp", type: "string", description: "The timestamp of the message that received the reaction" },
      { name: "eventTimestamp", label: "Event Timestamp", type: "string", description: "When the reaction was added" }
    ]
  },
  {
    type: "slack_trigger_reaction_removed",
    title: "Reaction Removed",
    description: "Triggers when a reaction is removed from a message",
    icon: HeartOff,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: false,
        dynamic: "slack_channels",
        description: "Optional: Filter to a specific channel. Leave empty to listen to all channels."
      },
      { 
        name: "emoji", 
        label: "Emoji", 
        type: "text", 
        required: false,
        placeholder: "e.g., thumbsup (without colons)",
        description: "Optional: Filter to a specific emoji. Leave empty to listen to all reactions."
      },
    ],
    outputSchema: [
      { name: "reaction", label: "Reaction Emoji", type: "string", description: "The emoji that was removed (without colons)" },
      { name: "userId", label: "User ID", type: "string", description: "The ID of the user who removed the reaction" },
      { name: "userName", label: "User Name", type: "string", description: "The display name of the user who removed the reaction" },
      { name: "itemUserId", label: "Item User ID", type: "string", description: "The ID of the user who posted the original message" },
      { name: "itemUserName", label: "Item User Name", type: "string", description: "The display name of the user who posted the original message" },
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the channel containing the message" },
      { name: "channelName", label: "Channel Name", type: "string", description: "The name of the channel containing the message" },
      { name: "messageTimestamp", label: "Message Timestamp", type: "string", description: "The timestamp of the message that lost the reaction" },
      { name: "eventTimestamp", label: "Event Timestamp", type: "string", description: "When the reaction was removed" }
    ]
  },
  {
    type: "slack_trigger_channel_created",
    title: "Channel Created",
    description: "Triggers when a new channel is created",
    icon: Hash,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the newly created channel" },
      { name: "channelName", label: "Channel Name", type: "string", description: "The name of the newly created channel" },
      { name: "creatorId", label: "Creator ID", type: "string", description: "The ID of the user who created the channel" },
      { name: "creatorName", label: "Creator Name", type: "string", description: "The display name of the user who created the channel" },
      { name: "created", label: "Created Timestamp", type: "string", description: "When the channel was created" },
      { name: "isPrivate", label: "Is Private", type: "boolean", description: "Whether the channel is private" }
    ]
  },
  {
    type: "slack_trigger_member_joined_channel",
    title: "Member Joined Channel",
    description: "Triggers when a user joins a channel",
    icon: UserPlus,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: false,
        dynamic: "slack_channels",
        description: "Optional: Filter to a specific channel. Leave empty to listen to all channels."
      },
    ],
    outputSchema: [
      { name: "userId", label: "User ID", type: "string", description: "The ID of the user who joined the channel" },
      { name: "userName", label: "User Name", type: "string", description: "The display name of the user who joined the channel" },
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the channel that was joined" },
      { name: "channelName", label: "Channel Name", type: "string", description: "The name of the channel that was joined" },
      { name: "inviterId", label: "Inviter ID", type: "string", description: "The ID of the user who invited them (if applicable)" },
      { name: "inviterName", label: "Inviter Name", type: "string", description: "The display name of the user who invited them (if applicable)" },
      { name: "timestamp", label: "Join Timestamp", type: "string", description: "When the user joined the channel" }
    ]
  },
  {
    type: "slack_trigger_member_left_channel",
    title: "Member Left Channel",
    description: "Triggers when a user leaves a channel",
    icon: UserMinus,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: false,
        dynamic: "slack_channels",
        description: "Optional: Filter to a specific channel. Leave empty to listen to all channels."
      },
    ],
    outputSchema: [
      { name: "userId", label: "User ID", type: "string", description: "The ID of the user who left the channel" },
      { name: "userName", label: "User Name", type: "string", description: "The display name of the user who left the channel" },
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the channel that was left" },
      { name: "channelName", label: "Channel Name", type: "string", description: "The name of the channel that was left" },
      { name: "timestamp", label: "Leave Timestamp", type: "string", description: "When the user left the channel" }
    ]
  },

  // Actions
  {
    type: "slack_action_send_message",
    title: "Send Message",
    description: "Send a message to a channel",
    icon: MessageSquare,
    providerId: "slack",
    requiredScopes: ["chat:write"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: true,
        dynamic: "slack_channels",
        description: "Select the Slack channel where you want to send the message"
      },
      {
        name: "message",
        label: "Message",
        type: "rich-text",
        required: true,
        placeholder: "Type your message...",
        description: "The message content with rich text formatting (bold, italic, links, etc.)"
      },
      { 
        name: "attachments", 
        label: "Attachments", 
        type: "file", 
        required: false,
        placeholder: "Select files to attach", 
        multiple: true,
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
        maxSize: 25 * 1024 * 1024, // 25MB limit
        description: "Attach files from your computer or select files from previous workflow nodes"
      },
      { 
        name: "sendAsBot", 
        label: "Send as Bot", 
        type: "boolean", 
        required: false,
        defaultValue: true,
        description: "Send the message as the bot user"
      },
      { 
        name: "username", 
        label: "Bot Username (Optional)", 
        type: "text", 
        required: false,
        placeholder: "Custom bot name",
        description: "Override the bot's username for this message"
      },
      { 
        name: "iconEmoji", 
        label: "Bot Icon Emoji (Optional)", 
        type: "text", 
        required: false,
        placeholder: ":robot_face:",
        description: "Override the bot's icon with an emoji"
      },
      { 
        name: "threadTimestamp", 
        label: "Thread Timestamp (Optional)", 
        type: "text", 
        required: false,
        placeholder: "1234567890.123456",
        description: "Reply in a thread by providing its timestamp"
      },
      { 
        name: "unfurlLinks", 
        label: "Unfurl Links", 
        type: "boolean", 
        required: false,
        defaultValue: true,
        description: "Enable link previews in the message"
      },
      { 
        name: "unfurlMedia", 
        label: "Unfurl Media", 
        type: "boolean", 
        required: false,
        defaultValue: true,
        description: "Enable media previews in the message"
      }
    ]
  },
  {
    type: "slack_action_create_channel",
    title: "Create Channel",
    description: "Create a new Slack channel with advanced options",
    icon: Hash,
    providerId: "slack",
    requiredScopes: ["groups:write", "users:read"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      {
        name: "workspace",
        label: "Workspace",
        type: "select",
        required: true,
        dynamic: "slack_workspaces",
        description: "Select the Slack workspace."
      },
      {
        name: "template",
        label: "Template",
        type: "combobox",
        required: true,
        defaultValue: "blank",
        options: [
          { value: "blank", label: "Blank Channel" },
          { value: "project-starter-kit", label: "Project Starter Kit" },
          { value: "help-requests-process", label: "Help Requests Process" },
          { value: "time-off-request-process", label: "Time Off Request Process" },
          { value: "employee-benefits-hub", label: "Employee Benefits Hub" },
          { value: "brand-guidelines-hub", label: "Brand Guidelines Hub" },
          { value: "bug-intake-and-triage", label: "Bug Intake And Triage" },
          { value: "sales-enablement-hub", label: "Sales Enablement Hub" },
          { value: "marketing-campaign-starter-kit", label: "Marketing Campaign Starter Kit" },
          { value: "ask-an-expert", label: "Ask An Expert" },
          { value: "event-prep-starter-kit", label: "Event Prep Starter Kit" },
          { value: "external-partner-starter-kit", label: "External Partner Starter Kit" },
          { value: "customer-support", label: "Customer Support" },
          { value: "sales-deal-tracking", label: "Sales Deal Tracking" },
          { value: "one-on-one-coaching", label: "One On One Coaching" },
          { value: "new-hire-onboarding", label: "New Hire Onboarding" },
          { value: "feedback-intake", label: "Feedback Intake" },
          { value: "team-support", label: "Team Support" },
        ] as const,
        description: "Choose a channel template."
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "text",
        required: true,
        placeholder: "e.g., project-alpha",
        description: "Enter the channel name (lowercase, no spaces, use hyphens)"
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        required: false,
        placeholder: "What's this channel about?",
        description: "Add a description to help others understand the channel's purpose"
      },
      {
        name: "isPrivate",
        label: "Make Private",
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "Create a private channel that requires invitation"
      },
      {
        name: "users",
        label: "Add Users",
        type: "multi-select",
        required: false,
        dynamic: "slack_users",
        placeholder: "Select users to add",
        description: "Choose users to add to the channel"
      }
    ]
  },
  {
    type: "slack_action_post_interactive",
    title: "Post Interactive Message",
    description: "Send an interactive message with buttons and actions",
    icon: FileText,
    providerId: "slack",
    requiredScopes: ["chat:write", "chat:write.public"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: true,
        dynamic: "slack_channels",
        description: "Select the channel to post the interactive message"
      },
      {
        name: "text",
        label: "Message Text",
        type: "textarea",
        required: true,
        placeholder: "Main message text",
        description: "The primary text of the message"
      },
      {
        name: "blocks",
        label: "Message Blocks",
        type: "json",
        required: false,
        placeholder: "Enter Block Kit JSON",
        description: "Advanced: Define custom Block Kit blocks for rich formatting"
      },
      {
        name: "attachments",
        label: "Attachments",
        type: "json",
        required: false,
        placeholder: "Enter attachments JSON",
        description: "Legacy attachments format (use blocks instead when possible)"
      }
    ]
  }
]