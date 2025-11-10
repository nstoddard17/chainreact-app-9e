import { MessageSquare, Hash, Heart, HeartOff, UserPlus, UserMinus, MessageCircle, Layout, Terminal, User, Edit, Trash2, Bell, FileText, Target, Pin, PinOff, Upload, Smile, Frown, Archive, ArchiveRestore, LogOut, LogIn, PencilLine, Info, Search, SearchCode, UserSearch, UserCircle, Activity, List, Users, Clock, XCircle, CalendarClock, Download, FileSearch } from "lucide-react"
import { NodeComponent } from "../../types"

// Import action schemas
import { sendMessageActionSchema } from "./actions/sendMessage.schema"
import { createChannelActionSchema } from "./actions/createChannel.schema"
import { getMessagesActionSchema } from "./actions/getMessages.schema"
import { postInteractiveBlocksActionSchema } from "./actions/postInteractiveBlocks.schema"
import { updateMessageActionSchema } from "./actions/updateMessage.schema"
import { deleteMessageActionSchema } from "./actions/deleteMessage.schema"
import { getThreadMessagesActionSchema } from "./actions/getThreadMessages.schema"
import { addReminderActionSchema } from "./actions/addReminder.schema"
import { setChannelTopicActionSchema } from "./actions/setChannelTopic.schema"
import { setChannelPurposeActionSchema } from "./actions/setChannelPurpose.schema"
import { pinMessageActionSchema } from "./actions/pinMessage.schema"
import { unpinMessageActionSchema } from "./actions/unpinMessage.schema"
import { uploadFileActionSchema } from "./actions/uploadFile.schema"
import { addReactionActionSchema } from "./actions/addReaction.schema"
import { removeReactionActionSchema } from "./actions/removeReaction.schema"
import { sendDirectMessageActionSchema } from "./actions/sendDirectMessage.schema"
import { inviteUsersToChannelActionSchema } from "./actions/inviteUsersToChannel.schema"
import { archiveChannelActionSchema } from "./actions/archiveChannel.schema"
import { unarchiveChannelActionSchema } from "./actions/unarchiveChannel.schema"
import { removeUserFromChannelActionSchema } from "./actions/removeUserFromChannel.schema"
import { leaveChannelActionSchema } from "./actions/leaveChannel.schema"
import { joinChannelActionSchema } from "./actions/joinChannel.schema"
import { renameChannelActionSchema } from "./actions/renameChannel.schema"
import { getChannelInfoActionSchema } from "./actions/getChannelInfo.schema"
import { findMessageActionSchema } from "./actions/findMessage.schema"
import { getUserInfoActionSchema } from "./actions/getUserInfo.schema"
import { updateUserStatusActionSchema } from "./actions/updateUserStatus.schema"
import { setUserPresenceActionSchema } from "./actions/setUserPresence.schema"
import { listChannelsActionSchema } from "./actions/listChannels.schema"
import { listUsersActionSchema } from "./actions/listUsers.schema"
import { scheduleMessageActionSchema } from "./actions/scheduleMessage.schema"
import { cancelScheduledMessageActionSchema } from "./actions/cancelScheduledMessage.schema"
import { listScheduledMessagesActionSchema } from "./actions/listScheduledMessages.schema"
import { downloadFileActionSchema } from "./actions/downloadFile.schema"
import { getFileInfoActionSchema } from "./actions/getFileInfo.schema"

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
import { fileUploadedTriggerSchema } from "./triggers/fileUploaded.schema"
import { userJoinedWorkspaceTriggerSchema } from "./triggers/userJoinedWorkspace.schema"

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

const addReaction: NodeComponent = {
  ...addReactionActionSchema,
  icon: Smile
}

const removeReaction: NodeComponent = {
  ...removeReactionActionSchema,
  icon: Frown
}

const sendDirectMessage: NodeComponent = {
  ...sendDirectMessageActionSchema,
  icon: MessageCircle
}

const inviteUsersToChannel: NodeComponent = {
  ...inviteUsersToChannelActionSchema,
  icon: UserPlus
}

const archiveChannel: NodeComponent = {
  ...archiveChannelActionSchema,
  icon: Archive
}

const unarchiveChannel: NodeComponent = {
  ...unarchiveChannelActionSchema,
  icon: ArchiveRestore
}

const removeUserFromChannel: NodeComponent = {
  ...removeUserFromChannelActionSchema,
  icon: UserMinus
}

const leaveChannel: NodeComponent = {
  ...leaveChannelActionSchema,
  icon: LogOut
}

const joinChannel: NodeComponent = {
  ...joinChannelActionSchema,
  icon: LogIn
}

const renameChannel: NodeComponent = {
  ...renameChannelActionSchema,
  icon: PencilLine
}

const getChannelInfo: NodeComponent = {
  ...getChannelInfoActionSchema,
  icon: Info
}

const findMessage: NodeComponent = {
  ...findMessageActionSchema,
  icon: Search
}

const getUserInfo: NodeComponent = {
  ...getUserInfoActionSchema,
  icon: UserSearch
}

const updateUserStatus: NodeComponent = {
  ...updateUserStatusActionSchema,
  icon: UserCircle
}

const setUserPresence: NodeComponent = {
  ...setUserPresenceActionSchema,
  icon: Activity
}

const listChannels: NodeComponent = {
  ...listChannelsActionSchema,
  icon: List
}

const listUsers: NodeComponent = {
  ...listUsersActionSchema,
  icon: Users
}

const scheduleMessage: NodeComponent = {
  ...scheduleMessageActionSchema,
  icon: Clock
}

const cancelScheduledMessage: NodeComponent = {
  ...cancelScheduledMessageActionSchema,
  icon: XCircle
}

const listScheduledMessages: NodeComponent = {
  ...listScheduledMessagesActionSchema,
  icon: CalendarClock
}

const downloadFile: NodeComponent = {
  ...downloadFileActionSchema,
  icon: Download
}

const getFileInfo: NodeComponent = {
  ...getFileInfoActionSchema,
  icon: FileSearch
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

const fileUploaded: NodeComponent = {
  ...fileUploadedTriggerSchema,
  icon: Upload
}

const userJoinedWorkspace: NodeComponent = {
  ...userJoinedWorkspaceTriggerSchema,
  icon: UserPlus
}

// Export all Slack nodes
export const slackNodes: NodeComponent[] = [
  // Actions
  sendMessage,
  sendDirectMessage,
  createChannel,
  getMessages,
  postInteractiveBlocks,
  getUserInfo,
  updateMessage,
  deleteMessage,
  getThreadMessages,
  addReminder,
  addReaction,
  removeReaction,
  setChannelTopic,
  setChannelPurpose,
  pinMessage,
  unpinMessage,
  uploadFile,
  inviteUsersToChannel,
  archiveChannel,
  unarchiveChannel,
  removeUserFromChannel,
  leaveChannel,
  joinChannel,
  renameChannel,
  getChannelInfo,
  findMessage,
  updateUserStatus,
  setUserPresence,
  listChannels,
  listUsers,
  scheduleMessage,
  cancelScheduledMessage,
  listScheduledMessages,
  downloadFile,
  getFileInfo,

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
  fileUploaded,
  userJoinedWorkspace,
]

// Export individual nodes for direct access
export {
  // Actions
  sendMessage,
  sendDirectMessage,
  createChannel,
  getMessages,
  postInteractiveBlocks,
  getUserInfo,
  updateMessage,
  deleteMessage,
  getThreadMessages,
  addReminder,
  addReaction,
  removeReaction,
  setChannelTopic,
  setChannelPurpose,
  pinMessage,
  unpinMessage,
  uploadFile,
  inviteUsersToChannel,
  archiveChannel,
  unarchiveChannel,
  removeUserFromChannel,
  leaveChannel,
  joinChannel,
  renameChannel,
  getChannelInfo,
  findMessage,
  updateUserStatus,
  setUserPresence,
  listChannels,
  listUsers,
  scheduleMessage,
  cancelScheduledMessage,
  listScheduledMessages,
  downloadFile,
  getFileInfo,

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
  fileUploaded,
  userJoinedWorkspace,
}
