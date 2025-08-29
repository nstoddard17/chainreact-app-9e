import { NodeComponent } from "../../types"
import { MessageSquare, BarChart, Shield } from "lucide-react"

// YouTube Studio Triggers
const youtubeStudioTriggerNewComment: NodeComponent = {
  type: "youtube-studio_trigger_new_comment",
  title: "New Comment",
  description: "Triggers when a new comment is posted on your YouTube video",
  icon: MessageSquare,
  providerId: "youtube-studio",
  category: "Social",
  isTrigger: true,
  configSchema: [
    { name: "videoId", label: "Video", type: "select", dynamic: "youtube_videos", required: true, placeholder: "Select a video to monitor" }
  ]
}

const youtubeStudioTriggerChannelAnalytics: NodeComponent = {
  type: "youtube-studio_trigger_channel_analytics",
  title: "Channel Analytics Update",
  description: "Triggers when channel analytics reach certain thresholds",
  icon: BarChart,
  providerId: "youtube-studio",
  category: "Social",
  isTrigger: true,
  configSchema: [
    { name: "metric", label: "Metric", type: "select", required: true, defaultValue: "subscribers", options: [
      { value: "subscribers", label: "Subscribers" },
      { value: "views", label: "Views" },
      { value: "watch_time", label: "Watch Time" }
    ]},
    { name: "threshold", label: "Threshold", type: "number", required: true, placeholder: "Enter threshold value" }
  ]
}

// YouTube Studio Actions
const youtubeStudioActionModerateComment: NodeComponent = {
  type: "youtube-studio_action_moderate_comment",
  title: "Moderate Comment",
  description: "Moderate a comment on your YouTube video",
  icon: Shield,
  providerId: "youtube-studio",
  requiredScopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "commentId", label: "Comment ID", type: "text", required: true, placeholder: "Enter comment ID" },
    { name: "action", label: "Action", type: "select", required: true, defaultValue: "approve", options: [
      { value: "approve", label: "Approve" },
      { value: "reject", label: "Reject" },
      { value: "spam", label: "Mark as Spam" }
    ]}
  ]
}

const youtubeStudioActionGetChannelAnalytics: NodeComponent = {
  type: "youtube-studio_action_get_channel_analytics",
  title: "Get Channel Analytics",
  description: "Get detailed analytics for your YouTube channel",
  icon: BarChart,
  providerId: "youtube-studio",
  requiredScopes: ["https://www.googleapis.com/auth/youtube.readonly"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "startDate", label: "Start Date", type: "date", required: true },
    { name: "endDate", label: "End Date", type: "date", required: true },
    { name: "metrics", label: "Metrics", type: "multi-select", required: true, options: [
      { value: "views", label: "Views" },
      { value: "watch_time", label: "Watch Time" },
      { value: "subscribers", label: "Subscribers" },
      { value: "revenue", label: "Revenue" }
    ]}
  ]
}

// Export all YouTube Studio nodes
export const youtubeStudioNodes: NodeComponent[] = [
  // Triggers (2)
  youtubeStudioTriggerNewComment,
  youtubeStudioTriggerChannelAnalytics,
  
  // Actions (2)
  youtubeStudioActionModerateComment,
  youtubeStudioActionGetChannelAnalytics,
]