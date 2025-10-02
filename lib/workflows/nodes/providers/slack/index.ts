import { MessageSquare, Hash, Heart, HeartOff, UserPlus, UserMinus, MessageCircle } from "lucide-react"
import { NodeComponent } from "../../types"

// Import action schemas
import { sendMessageActionSchema } from "./actions/sendMessage.schema"
import { createChannelActionSchema } from "./actions/createChannel.schema"
import { getMessagesActionSchema } from "./actions/getMessages.schema"

// Import trigger schemas
import { newMessageChannelTriggerSchema } from "./triggers/newMessageChannel.schema"
import { reactionAddedTriggerSchema } from "./triggers/reactionAdded.schema"

// Apply icons to action schemas
const sendMessage: NodeComponent = {
  ...sendMessageActionSchema,
  icon: MessageSquare
}

const createChannel: NodeComponent = {
  ...createChannelActionSchema,
  icon: Hash
}

const getMessages: NodeComponent = {
  ...getMessagesActionSchema,
  icon: MessageCircle
}

// Apply icons to trigger schemas
const newMessageChannel: NodeComponent = {
  ...newMessageChannelTriggerSchema,
  icon: MessageSquare
}

const reactionAdded: NodeComponent = {
  ...reactionAddedTriggerSchema,
  icon: Heart
}

// Note: Additional Slack nodes exist but haven't been migrated yet:
// - New Message in Private Channel (slack_trigger_message_groups)
// - New Direct Message (slack_trigger_message_im)
// - New Group Direct Message (slack_trigger_message_mpim)
// - Reaction Removed (slack_trigger_reaction_removed)
// - Channel Created (slack_trigger_channel_created)
// - Member Joined Channel (slack_trigger_member_joined_channel)
// - Member Left Channel (slack_trigger_member_left_channel)
// - Slash Command (slack_trigger_slash_command)
// - Post Interactive Blocks (slack_action_post_interactive)

// Export all Slack nodes
export const slackNodes: NodeComponent[] = [
  // Actions
  sendMessage,
  createChannel,
  getMessages,

  // Triggers
  newMessageChannel,
  reactionAdded,

  // Add more as they are migrated
]

// Export individual nodes for direct access
export {
  sendMessage,
  createChannel,
  getMessages,
  newMessageChannel,
  reactionAdded,
}