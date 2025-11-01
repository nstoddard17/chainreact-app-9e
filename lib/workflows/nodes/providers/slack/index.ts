import { MessageSquare, Hash, Heart, HeartOff, UserPlus, UserMinus, MessageCircle, Layout, Terminal, User, Edit, Trash2, Bell, FileText, Target, Pin, PinOff, Upload } from "lucide-react"
import { NodeComponent } from "../../types"

// Import action schemas
import { sendMessageActionSchema } from "./actions/sendMessage.schema"
import { createChannelActionSchema } from "./actions/createChannel.schema"
import { getMessagesActionSchema } from "./actions/getMessages.schema"
import { postInteractiveBlocksActionSchema } from "./actions/postInteractiveBlocks.schema"
import { findUserActionSchema } from "./actions/findUser.schema"
import { updateMessageActionSchema } from "./actions/updateMessage.schema"
import { deleteMessageActionSchema } from "./actions/deleteMessage.schema"
import { getThreadMessagesActionSchema } from "./actions/getThreadMessages.schema"
import { addReminderActionSchema } from "./actions/addReminder.schema"
import { setChannelTopicActionSchema } from "./actions/setChannelTopic.schema"
import { setChannelPurposeActionSchema } from "./actions/setChannelPurpose.schema"
import { pinMessageActionSchema } from "./actions/pinMessage.schema"
import { unpinMessageActionSchema } from "./actions/unpinMessage.schema"
import { uploadFileActionSchema } from "./actions/uploadFile.schema"

// Import trigger schemas
import { newMessageChannelTriggerSchema } from "./triggers/newMessageChannel.schema"
import { reactionAddedTriggerSchema } from "./triggers/reactionAdded.schema"
import { newMessagePrivateChannelTriggerSchema } from "./triggers/newMessagePrivateChannel.schema"
import { newDirectMessageTriggerSchema } from "./triggers/newDirectMessage.schema"
import { newGroupDirectMessageTriggerSchema } from "./triggers/newGroupDirectMessage.schema"
import { reactionRemovedTriggerSchema } from "./triggers/reactionRemoved.schema"
import { channelCreatedTriggerSchema } from "./triggers/channelCreated.schema"
import { memberJoinedChannelTriggerSchema } from "./triggers/memberJoinedChannel.schema"
import { memberLeftChannelTriggerSchema } from "./triggers/memberLeftChannel.schema"
import { slashCommandTriggerSchema } from "./triggers/slashCommand.schema"

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

const postInteractiveBlocks: NodeComponent = {
  ...postInteractiveBlocksActionSchema,
  icon: Layout
}

const findUser: NodeComponent = {
  ...findUserActionSchema,
  icon: User
}

const updateMessage: NodeComponent = {
  ...updateMessageActionSchema,
  icon: Edit
}

const deleteMessage: NodeComponent = {
  ...deleteMessageActionSchema,
  icon: Trash2
}

const getThreadMessages: NodeComponent = {
  ...getThreadMessagesActionSchema,
  icon: MessageCircle
}

const addReminder: NodeComponent = {
  ...addReminderActionSchema,
  icon: Bell
}

const setChannelTopic: NodeComponent = {
  ...setChannelTopicActionSchema,
  icon: FileText
}

const setChannelPurpose: NodeComponent = {
  ...setChannelPurposeActionSchema,
  icon: Target
}

const pinMessage: NodeComponent = {
  ...pinMessageActionSchema,
  icon: Pin
}

const unpinMessage: NodeComponent = {
  ...unpinMessageActionSchema,
  icon: PinOff
}

const uploadFile: NodeComponent = {
  ...uploadFileActionSchema,
  icon: Upload
}

// Apply icons to trigger schemas
const newMessageChannel: NodeComponent = {
  ...newMessageChannelTriggerSchema,
  icon: MessageSquare
}

const newMessagePrivateChannel: NodeComponent = {
  ...newMessagePrivateChannelTriggerSchema,
  icon: MessageSquare
}

const newDirectMessage: NodeComponent = {
  ...newDirectMessageTriggerSchema,
  icon: MessageSquare
}

const newGroupDirectMessage: NodeComponent = {
  ...newGroupDirectMessageTriggerSchema,
  icon: MessageSquare
}

const reactionAdded: NodeComponent = {
  ...reactionAddedTriggerSchema,
  icon: Heart
}

const reactionRemoved: NodeComponent = {
  ...reactionRemovedTriggerSchema,
  icon: HeartOff
}

const channelCreated: NodeComponent = {
  ...channelCreatedTriggerSchema,
  icon: Hash
}

const memberJoinedChannel: NodeComponent = {
  ...memberJoinedChannelTriggerSchema,
  icon: UserPlus
}

const memberLeftChannel: NodeComponent = {
  ...memberLeftChannelTriggerSchema,
  icon: UserMinus
}

const slashCommand: NodeComponent = {
  ...slashCommandTriggerSchema,
  icon: Terminal
}

// Export all Slack nodes
export const slackNodes: NodeComponent[] = [
  // Actions
  sendMessage,
  createChannel,
  getMessages,
  postInteractiveBlocks,
  findUser,
  updateMessage,
  deleteMessage,
  getThreadMessages,
  addReminder,
  setChannelTopic,
  setChannelPurpose,
  pinMessage,
  unpinMessage,
  uploadFile,

  // Triggers
  newMessageChannel,
  newMessagePrivateChannel,
  newDirectMessage,
  newGroupDirectMessage,
  reactionAdded,
  reactionRemoved,
  channelCreated,
  memberJoinedChannel,
  memberLeftChannel,
  slashCommand,
]

// Export individual nodes for direct access
export {
  // Actions
  sendMessage,
  createChannel,
  getMessages,
  postInteractiveBlocks,
  findUser,
  updateMessage,
  deleteMessage,
  getThreadMessages,
  addReminder,
  setChannelTopic,
  setChannelPurpose,
  pinMessage,
  unpinMessage,
  uploadFile,

  // Triggers
  newMessageChannel,
  newMessagePrivateChannel,
  newDirectMessage,
  newGroupDirectMessage,
  reactionAdded,
  reactionRemoved,
  channelCreated,
  memberJoinedChannel,
  memberLeftChannel,
  slashCommand,
}
