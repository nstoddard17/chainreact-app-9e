import { MessageSquare, Calendar, Hash, UserPlus, FileText, Users, Plus } from "lucide-react"
import { NodeComponent } from "../../types"

export const teamsNodes: NodeComponent[] = [
  {
    type: "teams_trigger_new_message",
    title: "New Message in Channel",
    description: "Triggers on a new message in a channel",
    icon: MessageSquare,
    providerId: "teams",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "channelId", label: "Channel", type: "select", dynamic: "teams_channels", required: true, placeholder: "Select a channel to monitor" }
    ],
    outputSchema: [
      { name: "messageId", label: "Message ID", type: "string", description: "The ID of the new message" },
      { name: "content", label: "Message Content", type: "string", description: "The content of the message" },
      { name: "senderId", label: "Sender ID", type: "string", description: "The ID of the message sender" },
      { name: "senderName", label: "Sender Name", type: "string", description: "The name of the message sender" },
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the channel where the message was posted" },
      { name: "channelName", label: "Channel Name", type: "string", description: "The name of the channel where the message was posted" },
      { name: "timestamp", label: "Message Time", type: "string", description: "When the message was posted (ISO 8601 format)" },
      { name: "attachments", label: "Attachments", type: "array", description: "Array of file attachments in the message" }
    ]
  },
  {
    type: "teams_trigger_user_joins_team",
    title: "User Joins Team",
    description: "Triggers when a new user joins a team",
    icon: Users,
    providerId: "teams",
    category: "Communication",
    isTrigger: true,
    configSchema: [
      { name: "teamId", label: "Team", type: "select", dynamic: "teams_teams", required: true, placeholder: "Select a team to monitor" }
    ],
    outputSchema: [
      { name: "userId", label: "User ID", type: "string", description: "The ID of the user who joined" },
      { name: "userName", label: "User Name", type: "string", description: "The name of the user who joined" },
      { name: "userEmail", label: "User Email", type: "string", description: "The email of the user who joined" },
      { name: "teamId", label: "Team ID", type: "string", description: "The ID of the team the user joined" },
      { name: "teamName", label: "Team Name", type: "string", description: "The name of the team the user joined" },
      { name: "joinTime", label: "Join Time", type: "string", description: "When the user joined the team (ISO 8601 format)" },
      { name: "role", label: "User Role", type: "string", description: "The role assigned to the user in the team" }
    ]
  },
  {
    type: "teams_action_send_message",
    title: "Send Channel Message",
    description: "Send a message to a channel",
    icon: MessageSquare,
    providerId: "teams",
    requiredScopes: ["Chat.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "channelId", label: "Channel", type: "select", dynamic: "teams_channels", required: true, placeholder: "Select a channel" },
      { name: "message", label: "Message", type: "textarea", required: true, placeholder: "Enter your message" },
      { name: "attachments", label: "Attachments", type: "file", required: false, accept: ".pdf,.doc,.docx,.txt,.jpg,.png,.gif", multiple: true, placeholder: "Add file attachments (optional)" }
    ],
    outputSchema: [
      { name: "messageId", label: "Message ID", type: "string", description: "The ID of the sent message" },
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the channel where the message was sent" },
      { name: "timestamp", label: "Sent Time", type: "string", description: "When the message was sent (ISO 8601 format)" },
      { name: "success", label: "Success Status", type: "boolean", description: "Whether the message was sent successfully" }
    ]
  },
  {
    type: "teams_action_create_meeting",
    title: "Create Meeting",
    description: "Create a new online meeting",
    icon: Calendar,
    providerId: "teams",
    requiredScopes: ["OnlineMeetings.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "subject", label: "Meeting Subject", type: "text", required: true, placeholder: "Enter meeting subject" },
      { name: "startTime", label: "Start Time", type: "datetime", required: true },
      { name: "endTime", label: "End Time", type: "datetime", required: true },
      { name: "attendees", label: "Attendees", type: "email-autocomplete", dynamic: "outlook-enhanced-recipients", required: false, placeholder: "Select or enter attendee email addresses" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Meeting description" },
      { name: "allowMeetingChat", label: "Allow Meeting Chat", type: "boolean", required: false, defaultValue: true },
      { name: "allowCamera", label: "Allow Camera", type: "boolean", required: false, defaultValue: true },
      { name: "allowMic", label: "Allow Microphone", type: "boolean", required: false, defaultValue: true }
    ],
    outputSchema: [
      { name: "meetingId", label: "Meeting ID", type: "string", description: "The ID of the created meeting" },
      { name: "joinUrl", label: "Join URL", type: "string", description: "The URL to join the meeting" },
      { name: "subject", label: "Meeting Subject", type: "string", description: "The subject of the meeting" },
      { name: "startTime", label: "Start Time", type: "string", description: "When the meeting starts (ISO 8601 format)" },
      { name: "endTime", label: "End Time", type: "string", description: "When the meeting ends (ISO 8601 format)" },
      { name: "success", label: "Success Status", type: "boolean", description: "Whether the meeting was created successfully" }
    ]
  },
  {
    type: "teams_action_send_chat_message",
    title: "Send Chat Message",
    description: "Send a message to a specific chat or user",
    icon: MessageSquare,
    providerId: "teams",
    requiredScopes: ["Chat.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "chatId", label: "Chat", type: "select", dynamic: "teams_chats", required: true, placeholder: "Select a chat" },
      { name: "message", label: "Message", type: "textarea", required: true, placeholder: "Enter your message" },
      { name: "attachments", label: "Attachments", type: "file", required: false, accept: ".pdf,.doc,.docx,.txt,.jpg,.png,.gif", multiple: true, placeholder: "Add file attachments (optional)" }
    ]
  },
  {
    type: "teams_action_create_channel",
    title: "Create Channel",
    description: "Create a new channel in a team",
    icon: Hash,
    providerId: "teams",
    requiredScopes: ["Channel.Create"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "teamId", label: "Team", type: "select", dynamic: "teams_teams", required: true, placeholder: "Select a team" },
      { name: "channelName", label: "Channel Name", type: "text", required: true, placeholder: "Enter channel name" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Channel description (optional)" },
      { name: "isPrivate", label: "Private Channel", type: "boolean", required: false, defaultValue: false }
    ],
    outputSchema: [
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the created channel" },
      { name: "channelName", label: "Channel Name", type: "string", description: "The name of the created channel" },
      { name: "teamId", label: "Team ID", type: "string", description: "The ID of the team where the channel was created" },
      { name: "isPrivate", label: "Is Private", type: "boolean", description: "Whether the channel is private" },
      { name: "success", label: "Success Status", type: "boolean", description: "Whether the channel was created successfully" }
    ]
  },
  {
    type: "teams_action_add_member_to_team",
    title: "Add Member to Team",
    description: "Add a user to a team",
    icon: UserPlus,
    providerId: "teams",
    requiredScopes: ["TeamMember.ReadWrite.All"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "teamId", label: "Team", type: "select", dynamic: "teams_teams", required: true, placeholder: "Select a team" },
      { name: "userEmail", label: "User Email", type: "email-autocomplete", dynamic: "outlook-enhanced-recipients", required: true, placeholder: "Select or enter user's email address" },
      { name: "role", label: "Role", type: "select", required: true, defaultValue: "member", options: [
        { value: "member", label: "Member" },
        { value: "owner", label: "Owner" }
      ] }
    ]
  },
  {
    type: "teams_action_schedule_meeting",
    title: "Schedule Meeting",
    description: "Schedule a meeting with participants",
    icon: Calendar,
    providerId: "teams",
    requiredScopes: ["Calendars.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "subject", label: "Meeting Subject", type: "text", required: true, placeholder: "Enter meeting subject" },
      { name: "startTime", label: "Start Time", type: "datetime", required: true },
      { name: "endTime", label: "End Time", type: "datetime", required: true },
      { name: "attendees", label: "Attendees", type: "email-autocomplete", dynamic: "outlook-enhanced-recipients", required: false, placeholder: "Select or enter attendee email addresses" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Meeting description" },
      { name: "isOnlineMeeting", label: "Online Meeting", type: "boolean", required: false, defaultValue: true }
    ]
  },
  {
    type: "teams_action_send_adaptive_card",
    title: "Send Adaptive Card",
    description: "Send a rich adaptive card message to a channel",
    icon: FileText,
    providerId: "teams",
    requiredScopes: ["Chat.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "channelId", label: "Channel", type: "select", dynamic: "teams_channels", required: true, placeholder: "Select a channel" },
      { name: "cardTitle", label: "Card Title", type: "text", required: true, placeholder: "Enter card title" },
      { name: "cardText", label: "Card Text", type: "textarea", required: true, placeholder: "Enter card content" },
      { name: "cardType", label: "Card Type", type: "select", required: true, defaultValue: "hero", options: [
        { value: "hero", label: "Hero Card" },
        { value: "thumbnail", label: "Thumbnail Card" },
        { value: "receipt", label: "Receipt Card" }
      ] }
    ]
  },
  {
    type: "teams_action_get_team_members",
    title: "Get Team Members",
    description: "Get all members of a team",
    icon: Users,
    providerId: "teams",
    requiredScopes: ["TeamMember.Read.All"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "teamId", label: "Team", type: "select", dynamic: "teams_teams", required: true, placeholder: "Select a team" }
    ],
    outputSchema: [
      { name: "members", label: "Team Members", type: "array", description: "Array of team member objects" },
      { name: "memberCount", label: "Member Count", type: "number", description: "Total number of team members" },
      { name: "teamId", label: "Team ID", type: "string", description: "The ID of the team" },
      { name: "success", label: "Success Status", type: "boolean", description: "Whether the members were retrieved successfully" }
    ]
  },
  {
    type: "teams_action_create_team",
    title: "Create Team",
    description: "Create a new team",
    icon: Plus,
    providerId: "teams",
    requiredScopes: ["Team.Create"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "displayName", label: "Team Name", type: "text", required: true, placeholder: "Enter team name" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Team description (optional)" },
      { name: "visibility", label: "Visibility", type: "select", required: true, defaultValue: "private", options: [
        { value: "private", label: "Private" },
        { value: "public", label: "Public" }
      ] }
    ]
  },
]