import { Mail, Search, FileEdit, Reply, Archive, Trash2, Tag, Tags, Plus, X, Paperclip, Star, Download, PenTool, MailOpen } from "lucide-react"
import { NodeComponent } from "../../types"

// Import action schemas
import { sendEmailActionSchema } from "./actions/sendEmail.schema"
import { addLabelActionSchema } from "./actions/addLabel.schema"
import { searchEmailsActionSchema } from "./actions/searchEmails.schema"
import { createDraftActionSchema } from "./actions/createDraft.schema"
import { createDraftReplyActionSchema } from "./actions/createDraftReply.schema"
import { archiveEmailActionSchema } from "./actions/archiveEmail.schema"
import { deleteEmailActionSchema } from "./actions/deleteEmail.schema"
import { removeLabelActionSchema } from "./actions/removeLabel.schema"
import { createLabelActionSchema } from "./actions/createLabel.schema"
import { replyToEmailActionSchema } from "./actions/replyToEmail.schema"
import { getAttachmentActionSchema } from "./actions/getAttachment.schema"
import { downloadAttachmentActionSchema } from "./actions/downloadAttachment.schema"
import { advancedSearchActionSchema } from "./actions/advancedSearch.schema"
import { updateSignatureActionSchema } from "./actions/updateSignature.schema"
import { markAsReadActionSchema } from "./actions/markAsRead.schema"
import { markAsUnreadActionSchema } from "./actions/markAsUnread.schema"

// Import trigger schemas
import { newEmailTriggerSchema } from "./triggers/newEmail.schema"
import { newAttachmentTriggerSchema } from "./triggers/newAttachment.schema"
import { newStarredEmailTriggerSchema } from "./triggers/newStarredEmail.schema"
import { newLabeledEmailTriggerSchema } from "./triggers/newLabeledEmail.schema"

// Apply icons to trigger schemas
const newEmailTrigger: NodeComponent = {
  ...newEmailTriggerSchema,
  icon: Mail
}

const newAttachmentTrigger: NodeComponent = {
  ...newAttachmentTriggerSchema,
  icon: Paperclip
}

const newStarredEmailTrigger: NodeComponent = {
  ...newStarredEmailTriggerSchema,
  icon: Star
}

const newLabeledEmailTrigger: NodeComponent = {
  ...newLabeledEmailTriggerSchema,
  icon: Tag
}

// Apply icons to action schemas
const sendEmail: NodeComponent = {
  ...sendEmailActionSchema,
  icon: Mail
}

const createDraft: NodeComponent = {
  ...createDraftActionSchema,
  icon: FileEdit
}

const createDraftReply: NodeComponent = {
  ...createDraftReplyActionSchema,
  icon: Reply
}

const replyToEmail: NodeComponent = {
  ...replyToEmailActionSchema,
  icon: Reply
}

const archiveEmail: NodeComponent = {
  ...archiveEmailActionSchema,
  icon: Archive
}

const deleteEmail: NodeComponent = {
  ...deleteEmailActionSchema,
  icon: Trash2
}

const addLabel: NodeComponent = {
  ...addLabelActionSchema,
  icon: Tag
}

const removeLabel: NodeComponent = {
  ...removeLabelActionSchema,
  icon: X
}

const createLabel: NodeComponent = {
  ...createLabelActionSchema,
  icon: Plus
}

const searchEmails: NodeComponent = {
  ...searchEmailsActionSchema,
  icon: Search
}

const getAttachment: NodeComponent = {
  ...getAttachmentActionSchema,
  icon: Paperclip
}

const downloadAttachment: NodeComponent = {
  ...downloadAttachmentActionSchema,
  icon: Download
}

const advancedSearch: NodeComponent = {
  ...advancedSearchActionSchema,
  icon: Search
}

const updateSignature: NodeComponent = {
  ...updateSignatureActionSchema,
  icon: PenTool
}

const markAsRead: NodeComponent = {
  ...markAsReadActionSchema,
  icon: MailOpen
}

const markAsUnread: NodeComponent = {
  ...markAsUnreadActionSchema,
  icon: Mail
}

// Export all Gmail nodes
export const gmailNodes: NodeComponent[] = [
  // Triggers
  newEmailTrigger,
  newAttachmentTrigger,
  newStarredEmailTrigger,
  newLabeledEmailTrigger,

  // Actions
  sendEmail,
  replyToEmail,
  createDraft,
  createDraftReply,
  archiveEmail,
  deleteEmail,
  addLabel,
  removeLabel,
  createLabel,
  searchEmails,
  getAttachment,
  downloadAttachment,
  advancedSearch,
  updateSignature,
  markAsRead,
  markAsUnread,
]

// Export individual nodes for direct access
export {
  // Triggers
  newEmailTrigger,
  newAttachmentTrigger,
  newStarredEmailTrigger,
  newLabeledEmailTrigger,

  // Actions
  sendEmail,
  replyToEmail,
  createDraft,
  createDraftReply,
  archiveEmail,
  deleteEmail,
  addLabel,
  removeLabel,
  createLabel,
  searchEmails,
  getAttachment,
  downloadAttachment,
  advancedSearch,
  updateSignature,
  markAsRead,
  markAsUnread,
}
