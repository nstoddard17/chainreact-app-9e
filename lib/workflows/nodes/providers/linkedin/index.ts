import { NodeComponent } from "../../types"
import {
  PenSquare,
  MessageSquare,
  Share,
  Building
} from "lucide-react"

// LinkedIn Triggers
const linkedinTriggerNewPost: NodeComponent = {
  type: "linkedin_trigger_new_post",
  title: "New post published",
  description: "Triggers when a new post is published to a company page",
  icon: PenSquare,
  providerId: "linkedin",
  category: "Social",
  isTrigger: true,
  comingSoon: true,
  requiredScopes: ["w_member_social"],
}

const linkedinTriggerNewComment: NodeComponent = {
  type: "linkedin_trigger_new_comment",
  title: "New comment or reaction",
  description: "Triggers on a new comment or reaction on a company page post",
  icon: MessageSquare,
  providerId: "linkedin",
  category: "Social",
  isTrigger: true,
  comingSoon: true,
  requiredScopes: ["w_member_social"],
}

// LinkedIn Actions
const linkedinActionSharePost: NodeComponent = {
  type: "linkedin_action_share_post",
  title: "Share Post",
  description: "Share a post on LinkedIn",
  icon: Share,
  providerId: "linkedin",
  requiredScopes: ["w_member_social"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "text", label: "Post Text", type: "textarea", required: true, placeholder: "Enter your LinkedIn post" },
    { name: "visibility", label: "Visibility", type: "select", required: true, defaultValue: "PUBLIC", options: [
      { value: "PUBLIC", label: "Public" },
      { value: "CONNECTIONS", label: "Connections" }
    ]}
  ]
}

const linkedinActionCreateCompanyPost: NodeComponent = {
  type: "linkedin_action_create_company_post",
  title: "Create Company Post",
  description: "Create a post on a LinkedIn company page",
  icon: Building,
  providerId: "linkedin",
  requiredScopes: ["w_organization_social"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "organizationId", label: "Organization ID", type: "text", required: true, placeholder: "Enter organization ID" },
    { name: "text", label: "Post Text", type: "textarea", required: true, placeholder: "Enter your company post" },
    { name: "visibility", label: "Visibility", type: "select", required: true, defaultValue: "PUBLIC", options: [
      { value: "PUBLIC", label: "Public" },
      { value: "LOGGED_IN", label: "Logged-in users" }
    ]}
  ]
}

// Export all LinkedIn nodes
export const linkedinNodes: NodeComponent[] = [
  // Triggers (2)
  linkedinTriggerNewPost,
  linkedinTriggerNewComment,
  
  // Actions (2)
  linkedinActionSharePost,
  linkedinActionCreateCompanyPost,
]