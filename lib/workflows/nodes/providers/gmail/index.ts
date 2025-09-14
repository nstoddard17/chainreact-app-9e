import { Mail, Search } from "lucide-react"
import { NodeComponent } from "../../types"

// Import action schemas
import { sendEmailActionSchema } from "./actions/sendEmail.schema"
import { addLabelActionSchema } from "./actions/addLabel.schema"
import { searchEmailsActionSchema } from "./actions/searchEmails.schema"

// Import trigger schemas
import { newEmailTriggerSchema } from "./triggers/newEmail.schema"

// Apply icons to schemas
const newEmailTrigger: NodeComponent = {
  ...newEmailTriggerSchema,
  icon: Mail
}

const sendEmail: NodeComponent = {
  ...sendEmailActionSchema,
  icon: Mail
}

const addLabel: NodeComponent = {
  ...addLabelActionSchema,
  icon: Mail
}

const searchEmails: NodeComponent = {
  ...searchEmailsActionSchema,
  icon: Search
}

// Export all Gmail nodes
export const gmailNodes: NodeComponent[] = [
  newEmailTrigger,
  sendEmail,
  addLabel,
  searchEmails
]

// Export individual nodes for direct access
export {
  newEmailTrigger,
  sendEmail,
  addLabel,
  searchEmails
}