import { NodeComponent } from "../../types"
import {
  Video,
  MessageSquare,
  User,
  Upload,
  BarChart
} from "lucide-react"

// TikTok Triggers
const tiktokTriggerNewVideo: NodeComponent = {
  type: "tiktok_trigger_new_video",
  title: "New Video",
  description: "Triggers when a new video is uploaded to TikTok",
  icon: Video,
  providerId: "tiktok",
  category: "Social",
  isTrigger: true,
  configSchema: [
    { name: "username", label: "Username", type: "text", required: true, placeholder: "Enter TikTok username to monitor" }
  ]
}

const tiktokTriggerNewComment: NodeComponent = {
  type: "tiktok_trigger_new_comment",
  title: "New Comment",
  description: "Triggers when a new comment is posted on a TikTok video",
  icon: MessageSquare,
  providerId: "tiktok",
  category: "Social",
  isTrigger: true,
  configSchema: [
    { name: "videoId", label: "Video ID", type: "text", required: true, placeholder: "Enter TikTok video ID to monitor" }
  ]
}

// TikTok Actions
const tiktokActionGetUserInfo: NodeComponent = {
  type: "tiktok_action_get_user_info",
  title: "Get User Info",
  description: "Get information about a TikTok user",
  icon: User,
  providerId: "tiktok",
  requiredScopes: ["user.info.basic"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "username", label: "Username", type: "text", required: true, placeholder: "Enter TikTok username" }
  ]
}

const tiktokActionGetVideoList: NodeComponent = {
  type: "tiktok_action_get_video_list",
  title: "Get Video List",
  description: "Get a list of videos from a TikTok user",
  icon: Video,
  providerId: "tiktok",
  requiredScopes: ["video.list"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "username", label: "Username", type: "text", required: true, placeholder: "Enter TikTok username" },
    { name: "maxCount", label: "Max Count", type: "number", required: false, defaultValue: 20, placeholder: "20" }
  ]
}

const tiktokActionUploadVideo: NodeComponent = {
  type: "tiktok_action_upload_video",
  title: "Upload Video",
  description: "Upload a new video to TikTok",
  icon: Upload,
  providerId: "tiktok",
  requiredScopes: ["video.upload"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "videoFile", label: "Video File", type: "file", required: true, accept: "video/*", maxSize: 100 * 1024 * 1024 },
    { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Video description" },
    { name: "privacy", label: "Privacy", type: "select", required: false, defaultValue: "public", options: [
      { value: "public", label: "Public" },
      { value: "private", label: "Private" }
    ]}
  ]
}

const tiktokActionGetVideoAnalytics: NodeComponent = {
  type: "tiktok_action_get_video_analytics",
  title: "Get Video Analytics",
  description: "Get analytics data for a TikTok video",
  icon: BarChart,
  providerId: "tiktok",
  requiredScopes: ["video.list"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "videoId", label: "Video ID", type: "text", required: true, placeholder: "Enter TikTok video ID" },
    { name: "metric", label: "Metric", type: "select", required: true, defaultValue: "views", options: [
      { value: "views", label: "Views" },
      { value: "likes", label: "Likes" },
      { value: "comments", label: "Comments" },
      { value: "shares", label: "Shares" }
    ]}
  ]
}

// Export all TikTok nodes
export const tiktokNodes: NodeComponent[] = [
  // Triggers (2)
  tiktokTriggerNewVideo,
  tiktokTriggerNewComment,
  
  // Actions (4)
  tiktokActionGetUserInfo,
  tiktokActionGetVideoList,
  tiktokActionUploadVideo,
  tiktokActionGetVideoAnalytics,
]