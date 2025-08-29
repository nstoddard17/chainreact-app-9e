import { NodeComponent } from "../../types"
import {
  Video,
  MessageSquare,
  Camera,
  BarChart
} from "lucide-react"

// Instagram Triggers
const instagramTriggerNewMedia: NodeComponent = {
  type: "instagram_trigger_new_media",
  title: "New photo or video posted",
  description: "Triggers when a new photo or video is posted",
  icon: Video,
  providerId: "instagram",
  category: "Social",
  isTrigger: true,
  requiredScopes: ["user_media"],
}

const instagramTriggerNewComment: NodeComponent = {
  type: "instagram_trigger_new_comment",
  title: "New comment on a post",
  description: "Triggers when a new comment is made on your media",
  icon: MessageSquare,
  providerId: "instagram",
  category: "Social",
  isTrigger: true,
  requiredScopes: ["user_media"],
}

// Instagram Actions
const instagramActionCreateStory: NodeComponent = {
  type: "instagram_action_create_story",
  title: "Create Story",
  description: "Create a new Instagram story",
  icon: Camera,
  providerId: "instagram",
  requiredScopes: ["instagram_business_content_publish"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "imageUrl", label: "Image URL", type: "text", required: true, placeholder: "https://example.com/image.jpg" },
    { name: "caption", label: "Caption", type: "textarea", required: false, placeholder: "Story caption" },
    { name: "locationId", label: "Location ID", type: "text", required: false, placeholder: "Instagram location ID" }
  ]
}

const instagramActionGetMediaInsights: NodeComponent = {
  type: "instagram_action_get_media_insights",
  title: "Get Media Insights",
  description: "Get analytics for Instagram media",
  icon: BarChart,
  providerId: "instagram",
  requiredScopes: ["instagram_basic"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "mediaId", label: "Media ID", type: "text", required: true, placeholder: "Enter Instagram media ID" },
    { name: "metric", label: "Metric", type: "select", required: true, defaultValue: "impressions", options: [
      { value: "impressions", label: "Impressions" },
      { value: "reach", label: "Reach" },
      { value: "engagement", label: "Engagement" },
      { value: "saved", label: "Saved" }
    ]}
  ]
}

// Export all Instagram nodes
export const instagramNodes: NodeComponent[] = [
  // Triggers (2)
  instagramTriggerNewMedia,
  instagramTriggerNewComment,
  
  // Actions (2)
  instagramActionCreateStory,
  instagramActionGetMediaInsights,
]