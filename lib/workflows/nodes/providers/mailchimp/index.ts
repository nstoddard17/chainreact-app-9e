import { Users, MailOpen } from "lucide-react"
import { NodeComponent } from "../../types"

export const mailchimpNodes: NodeComponent[] = [
  {
    type: "mailchimp_trigger_new_subscriber",
    title: "New subscriber added",
    description: "Triggers when a new subscriber is added to an audience",
    icon: Users,
    providerId: "mailchimp",
    category: "Email",
    isTrigger: true,
  },
  {
    type: "mailchimp_trigger_email_opened",
    title: "Email campaign opened",
    description: "Triggers when a subscriber opens an email campaign",
    icon: MailOpen,
    providerId: "mailchimp",
    category: "Email",
    isTrigger: true,
  }
]