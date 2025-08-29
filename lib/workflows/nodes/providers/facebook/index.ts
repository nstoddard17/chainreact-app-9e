import { NodeComponent } from "../../types"
import {
  PenSquare,
  MessageSquare,
  Share,
  BarChart,
  MessageCircle
} from "lucide-react"

// Facebook Triggers
const facebookTriggerNewPost: NodeComponent = {
  type: "facebook_trigger_new_post",
  title: "New post published",
  description: "Triggers when a new post is published to a Page",
  icon: PenSquare,
  providerId: "facebook",
  category: "Social",
  isTrigger: true,
  requiredScopes: ["pages_read_engagement"],
}

const facebookTriggerNewComment: NodeComponent = {
  type: "facebook_trigger_new_comment",
  title: "New comment on post",
  description: "Triggers when a new comment is made on a Page post",
  icon: MessageSquare,
  providerId: "facebook",
  category: "Social",
  isTrigger: true,
  requiredScopes: ["pages_read_engagement"],
}

// Facebook Actions
const facebookActionCreatePost: NodeComponent = {
  type: "facebook_action_create_post",
  title: "Create Post",
  description: "Create a new post on a Facebook page",
  icon: Share,
  providerId: "facebook",
  requiredScopes: ["pages_manage_posts"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "pageId", label: "Page", type: "select", dynamic: "facebook_pages", required: true, placeholder: "Select a Facebook page", uiTab: "basic" },
    { name: "message", label: "Message", type: "textarea", required: true, placeholder: "Enter your post message", uiTab: "basic" },
    { name: "mediaFile", label: "Photo/Video", type: "file", required: false, accept: "image/*,video/*", maxSize: 10485760, uiTab: "basic" },
    { name: "scheduledPublishTime", label: "Schedule Publish Time", type: "datetime", required: false, uiTab: "basic", placeholder: "Select date and time for publishing" },
    // Monetization section
    { name: "productLinkUrl", label: "URL", type: "text", required: false, placeholder: "URL", uiTab: "monetization" },
    { name: "productLinkName", label: "Link name (optional)", type: "text", required: false, placeholder: "Link name (optional)", uiTab: "monetization" },
    { name: "productPromoCode", label: "Existing promo code (optional)", type: "text", required: false, placeholder: "Existing promo code (optional)", uiTab: "monetization" },
    { name: "paidPartnershipLabel", label: "Add paid partnership label", type: "boolean", required: false, defaultValue: false, uiTab: "monetization" }
  ]
}

const facebookActionGetPageInsights: NodeComponent = {
  type: "facebook_action_get_page_insights",
  title: "Fetch Page Insights",
  description: "Fetch analytics data for a Facebook page",
  icon: BarChart,
  providerId: "facebook",
  requiredScopes: ["pages_read_engagement"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "pageId", label: "Page", type: "select", dynamic: "facebook_pages", required: true, placeholder: "Select a Facebook page" },
    { name: "metric", label: "Metric", type: "select", required: true, defaultValue: "page_impressions", options: [
      { value: "page_impressions", label: "Page Impressions" },
      { value: "page_engaged_users", label: "Engaged Users" },
      { value: "page_post_engagements", label: "Post Engagements" },
      { value: "page_fans", label: "Page Fans" }
    ]},
    { name: "period", label: "Period", type: "select", required: true, defaultValue: "day", options: [
      { value: "day", label: "Day" },
      { value: "week", label: "Week" },
      { value: "month", label: "Month" }
    ]},
    { name: "periodCount", label: "Number of Days", type: "number", required: true, defaultValue: 7, placeholder: "7", dependsOn: "period" }
  ]
}

const facebookActionSendMessage: NodeComponent = {
  type: "facebook_action_send_message",
  title: "Send Message",
  description: "Send a message to a person who has a conversation with the page",
  icon: MessageSquare,
  providerId: "facebook",
  requiredScopes: ["pages_messaging"],
  category: "Social",
  isTrigger: false,
  comingSoon: true,
  configSchema: [
    { name: "pageId", label: "Page", type: "select", dynamic: "facebook_pages", required: true, placeholder: "Select a Facebook page", uiTab: "basic" },
    { name: "recipientId", label: "Message", type: "select", dynamic: "facebook_conversations", required: true, placeholder: "Select a conversation", uiTab: "basic", dependsOn: "pageId" },
    { name: "message", label: "Message", type: "textarea", required: true, placeholder: "Enter your message", uiTab: "basic" },
    { name: "quickReplies", label: "Quick Reply Options", type: "textarea", required: false, placeholder: "Enter quick reply options (one per line)", uiTab: "advanced" },
    { name: "typingIndicator", label: "Show Typing Indicator", type: "boolean", required: false, defaultValue: true, uiTab: "advanced" }
  ]
}

const facebookActionCommentOnPost: NodeComponent = {
  type: "facebook_action_comment_on_post",
  title: "Comment On Post",
  description: "Add a comment to a Facebook post",
  icon: MessageCircle,
  providerId: "facebook",
  requiredScopes: ["pages_manage_posts"],
  category: "Social",
  isTrigger: false,
  comingSoon: true,
  configSchema: [
    { name: "pageId", label: "Page", type: "select", dynamic: "facebook_pages", required: true, placeholder: "Select a Facebook page", uiTab: "basic" },
    { name: "postId", label: "Post", type: "select", dynamic: "facebook_posts", required: true, placeholder: "Select a post", uiTab: "basic", dependsOn: "pageId" },
    { name: "comment", label: "Comment", type: "textarea", required: true, placeholder: "Enter your comment", uiTab: "basic" },
    { name: "attachmentUrl", label: "Attachment URL", type: "text", required: false, placeholder: "URL to attach to the comment", uiTab: "advanced" },
    { name: "attachmentType", label: "Attachment Type", type: "select", required: false, options: [
      { value: "photo", label: "Photo" },
      { value: "video", label: "Video" },
      { value: "link", label: "Link" }
    ], uiTab: "advanced" }
  ]
}

// Export all Facebook nodes
export const facebookNodes: NodeComponent[] = [
  // Triggers (2)
  facebookTriggerNewPost,
  facebookTriggerNewComment,
  
  // Actions (4)
  facebookActionCreatePost,
  facebookActionGetPageInsights,
  facebookActionSendMessage,
  facebookActionCommentOnPost,
]