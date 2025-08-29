import { NodeComponent } from "../../types"
import {
  Video,
  Edit,
  BarChart,
  Plus
} from "lucide-react"

// YouTube Triggers
const youtubeTriggerNewVideo: NodeComponent = {
  type: "youtube_trigger_new_video",
  title: "New Video by Channel",
  description: "Triggers when a new video is uploaded to a channel",
  icon: Video,
  providerId: "youtube",
  category: "Social",
  isTrigger: true,
  configSchema: [
    {
      name: "channelId",
      label: "Channel",
      type: "select",
      dynamic: "youtube_channels",
      required: true,
      placeholder: "Select a channel from your YouTube account",
      description: "Choose from your connected YouTube channels"
    }
  ]
}

const youtubeTriggerNewComment: NodeComponent = {
  type: "youtube_trigger_new_comment",
  title: "New Comment on Video",
  description: "Triggers when a new comment is posted on a video",
  icon: Video,
  providerId: "youtube",
  category: "Social",
  isTrigger: true,
  configSchema: [
    {
      name: "videoId",
      label: "Video",
      type: "select",
      dynamic: "youtube_videos",
      required: true,
      placeholder: "Select a video from your YouTube account",
      description: "Choose from your uploaded YouTube videos"
    }
  ]
}

// YouTube Actions
const youtubeActionUpdateVideo: NodeComponent = {
  type: "youtube_action_update_video",
  title: "Update Video Details",
  description: "Update the title, description, privacy, or tags of a video",
  icon: Edit,
  providerId: "youtube",
  requiredScopes: ["https://www.googleapis.com/auth/youtube"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "videoId", label: "Video", type: "select", dynamic: "youtube_videos", required: true, placeholder: "Select a video to update" },
    { name: "title", label: "Title", type: "text", required: false, placeholder: "New title (optional)" },
    { name: "description", label: "Description", type: "textarea", required: false, placeholder: "New description (optional)" },
    { name: "privacyStatus", label: "Privacy Status", type: "select", required: false, options: [ 
      { value: "public", label: "Public" }, 
      { value: "unlisted", label: "Unlisted" }, 
      { value: "private", label: "Private" } 
    ]},
    { name: "tags", label: "Tags", type: "text", required: false, placeholder: "Comma-separated tags (optional)" }
  ]
}

const youtubeActionDeleteVideo: NodeComponent = {
  type: "youtube_action_delete_video",
  title: "Delete Video",
  description: "Delete a video from your YouTube channel",
  icon: Edit,
  providerId: "youtube",
  requiredScopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "videoId", label: "Video", type: "select", dynamic: "youtube_videos", required: true, placeholder: "Select a video to delete" }
  ]
}

const youtubeActionGetVideoAnalytics: NodeComponent = {
  type: "youtube_action_get_video_analytics",
  title: "Get Video Analytics",
  description: "Fetch analytics for a selected video",
  icon: BarChart,
  providerId: "youtube",
  requiredScopes: ["https://www.googleapis.com/auth/youtube.readonly"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "videoId", label: "Video", type: "select", dynamic: "youtube_videos", required: true, placeholder: "Select a video to get analytics for" }
  ]
}

const youtubeActionAddToPlaylist: NodeComponent = {
  type: "youtube_action_add_to_playlist",
  title: "Add Video to Playlist",
  description: "Add a video to a playlist",
  icon: Plus,
  providerId: "youtube",
  requiredScopes: ["https://www.googleapis.com/auth/youtube"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    { name: "videoId", label: "Video", type: "select", dynamic: "youtube_videos", required: true, placeholder: "Select a video to add" },
    { name: "playlistId", label: "Playlist", type: "select", dynamic: "youtube_playlists", required: true, placeholder: "Select a playlist" }
  ]
}

const youtubeActionListPlaylists: NodeComponent = {
  type: "youtube_action_list_playlists",
  title: "List My Playlists",
  description: "List all playlists from your YouTube account",
  icon: Video,
  providerId: "youtube",
  requiredScopes: ["https://www.googleapis.com/auth/youtube.readonly"],
  category: "Social",
  isTrigger: false,
  configSchema: []
}

// Export all YouTube nodes
export const youtubeNodes: NodeComponent[] = [
  // Triggers (2)
  youtubeTriggerNewVideo,
  youtubeTriggerNewComment,
  
  // Actions (5)
  youtubeActionUpdateVideo,
  youtubeActionDeleteVideo,
  youtubeActionGetVideoAnalytics,
  youtubeActionAddToPlaylist,
  youtubeActionListPlaylists,
]