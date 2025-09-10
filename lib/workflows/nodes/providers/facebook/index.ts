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
  description: "Create a new post on a Facebook page with optional media and monetization",
  icon: Share,
  providerId: "facebook",
  requiredScopes: ["pages_manage_posts"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    // Page selection - always visible and loads immediately
    { name: "pageId", label: "Select Facebook Page", type: "select", dynamic: true, required: true, placeholder: "Choose which page to post to", loadOnMount: true, description: "The Facebook page where your content will be published" },
    
    // Main content fields - only visible after page selection
    { name: "message", label: "Post Message", type: "textarea", required: true, placeholder: "What's on your mind?", dependsOn: "pageId", hidden: true, description: "The main text content of your Facebook post" },
    { name: "mediaFile", label: "Attach Photo or Video", type: "file", required: false, accept: "image/*,video/*", maxSize: 10485760, dependsOn: "pageId", hidden: true, description: "Add visual content to make your post more engaging (Max 10MB)" },
    
    // Schedule options
    { name: "scheduledPublishTime", label: "Schedule for Later", type: "datetime-local", required: false, placeholder: "Leave empty to post immediately", dependsOn: "pageId", hidden: true, description: "Schedule your post for the optimal time when your audience is most active" },
    
    // Share to groups - Note: Facebook API has limited group access
    { name: "shareToGroups", label: "Cross-post to Groups", type: "multi-select", dynamic: true, required: false, placeholder: "Select groups where you're an admin", description: "Share your post to multiple Facebook groups simultaneously (Limited to groups where you have admin access)", dependsOn: "pageId", hidden: true },
    
    // Monetization section with clear descriptions
    { name: "enableMonetization", label: "💰 Enable Monetization Features", type: "boolean", required: false, defaultValue: false, dependsOn: "pageId", hidden: true, description: "Turn on advanced monetization options to add product links, promo codes, and partnership disclosures to your post" },
    { name: "productLinkUrl", label: "Product Link", type: "text", required: true, placeholder: "https://example.com/product", dependsOn: "pageId", showWhen: { field: "enableMonetization", value: true }, hidden: true, description: "The URL where users can purchase or learn more about your product" },
    { name: "productLinkName", label: "Call-to-Action Text", type: "text", required: false, placeholder: "e.g., 'Shop Now' or 'Learn More'", dependsOn: "pageId", showWhen: { field: "enableMonetization", value: true }, hidden: true, description: "Custom text for your product link button (optional)" },
    { name: "productPromoCode", label: "Discount Code", type: "text", required: false, placeholder: "e.g., SAVE20", dependsOn: "pageId", showWhen: { field: "enableMonetization", value: true }, hidden: true, description: "Share an exclusive promo code with your audience (optional)" },
    { name: "paidPartnershipLabel", label: "🤝 Paid Partnership Disclosure", type: "boolean", required: false, defaultValue: false, dependsOn: "pageId", showWhen: { field: "enableMonetization", value: true }, hidden: true, description: "Add a 'Paid partnership' label to comply with advertising disclosure requirements" }
  ]
}

const facebookActionGetPageInsights: NodeComponent = {
  type: "facebook_action_get_page_insights",
  title: "Fetch Page Insights",
  description: "Fetch analytics data for a Facebook page",
  icon: BarChart,
  providerId: "facebook",
  requiredScopes: ["pages_read_engagement", "read_insights"],
  category: "Social",
  isTrigger: false,
  configSchema: [
    // Page selection - always visible and loads immediately
    { name: "pageId", label: "Page", type: "select", dynamic: true, required: true, placeholder: "Select a Facebook page", loadOnMount: true },
    
    // Metric selection - only visible after page selection
    { name: "metric", label: "Metric", type: "select", required: true, defaultValue: "page_impressions", dependsOn: "pageId", hidden: true, options: [
      // Engagement Metrics
      { value: "page_engaged_users", label: "📊 Engaged Users" },
      { value: "page_post_engagements", label: "📊 Post Engagements" },
      { value: "page_consumptions", label: "📊 Page Clicks" },
      { value: "page_consumptions_unique", label: "📊 Unique Page Clicks" },
      { value: "page_negative_feedback", label: "📊 Negative Feedback" },
      { value: "page_positive_feedback_by_type", label: "📊 Positive Feedback by Type" },
      
      // Reach & Impressions
      { value: "page_impressions", label: "👁️ Page Impressions" },
      { value: "page_impressions_unique", label: "👁️ Unique Page Impressions" },
      { value: "page_impressions_paid", label: "👁️ Paid Impressions" },
      { value: "page_impressions_organic", label: "👁️ Organic Impressions" },
      { value: "page_impressions_viral", label: "👁️ Viral Impressions" },
      { value: "page_views_total", label: "👁️ Total Page Views" },
      
      // Page Fans & Followers
      { value: "page_fans", label: "👥 Total Page Fans" },
      { value: "page_fans_locale", label: "👥 Fans by Language" },
      { value: "page_fans_city", label: "👥 Fans by City" },
      { value: "page_fans_country", label: "👥 Fans by Country" },
      { value: "page_fans_gender_age", label: "👥 Fans by Age and Gender" },
      { value: "page_fan_adds", label: "👥 New Page Fans" },
      { value: "page_fan_removes", label: "👥 Page Unfollows" },
      { value: "page_fans_online", label: "👥 Fans Online" },
      
      // Post Performance
      { value: "page_posts_impressions", label: "📝 Post Impressions" },
      { value: "page_posts_impressions_unique", label: "📝 Unique Post Impressions" },
      { value: "page_posts_impressions_paid", label: "📝 Paid Post Impressions" },
      { value: "page_posts_impressions_organic", label: "📝 Organic Post Impressions" },
      { value: "page_posts_impressions_viral", label: "📝 Viral Post Impressions" },
      
      // Video Metrics
      { value: "page_video_views", label: "🎥 Video Views" },
      { value: "page_video_views_paid", label: "🎥 Paid Video Views" },
      { value: "page_video_views_organic", label: "🎥 Organic Video Views" },
      { value: "page_video_views_autoplayed", label: "🎥 Autoplayed Video Views" },
      { value: "page_video_views_click_to_play", label: "🎥 Click-to-Play Video Views" },
      { value: "page_video_complete_views_30s", label: "🎥 30-Second Video Views" },
      { value: "page_video_repeat_views", label: "🎥 Repeat Video Views" },
      
      // Reactions Breakdown
      { value: "page_actions_post_reactions_like_total", label: "❤️ Total Likes" },
      { value: "page_actions_post_reactions_love_total", label: "❤️ Total Love Reactions" },
      { value: "page_actions_post_reactions_wow_total", label: "❤️ Total Wow Reactions" },
      { value: "page_actions_post_reactions_haha_total", label: "❤️ Total Haha Reactions" },
      { value: "page_actions_post_reactions_sorry_total", label: "❤️ Total Sad Reactions" },
      { value: "page_actions_post_reactions_anger_total", label: "❤️ Total Angry Reactions" },
      
      // Demographics & Reach
      { value: "page_impressions_by_age_gender_unique", label: "📈 Reach by Age and Gender" },
      { value: "page_impressions_by_country_unique", label: "📈 Reach by Country" },
      { value: "page_impressions_by_city_unique", label: "📈 Reach by City" },
      { value: "page_impressions_by_locale_unique", label: "📈 Reach by Language" },
      
      // CTA Clicks
      { value: "page_call_phone_clicks", label: "☎️ Phone Call Clicks" },
      { value: "page_get_directions_clicks", label: "📍 Get Directions Clicks" },
      { value: "page_website_clicks", label: "🌐 Website Clicks" },
      { value: "page_cta_clicks_logged_in", label: "🔘 Call-to-Action Button Clicks" },
      
      // Check-ins & Visits
      { value: "page_places_checkin_total", label: "📍 Total Check-ins" },
      { value: "page_places_checkin_mobile", label: "📍 Mobile Check-ins" }
    ]},
    
    // Time period settings - visible after page selection
    { name: "period", label: "Period", type: "select", required: true, defaultValue: "day", dependsOn: "pageId", hidden: true, options: [
      { value: "day", label: "Daily" },
      { value: "week", label: "Weekly" },
      { value: "days_28", label: "28 Days" },
      { value: "month", label: "Monthly" },
      { value: "lifetime", label: "Lifetime (where available)" }
    ]},
    
    // Date range for custom period
    { name: "dateRange", label: "Date Range", type: "select", required: false, defaultValue: "last_7_days", dependsOn: "pageId", hidden: true, options: [
      { value: "today", label: "Today" },
      { value: "yesterday", label: "Yesterday" },
      { value: "last_7_days", label: "Last 7 Days" },
      { value: "last_14_days", label: "Last 14 Days" },
      { value: "last_28_days", label: "Last 28 Days" },
      { value: "last_30_days", label: "Last 30 Days" },
      { value: "last_90_days", label: "Last 90 Days" },
      { value: "this_month", label: "This Month" },
      { value: "last_month", label: "Last Month" },
      { value: "custom", label: "Custom Date Range" }
    ]},
    
    // Custom date range (only shown when dateRange is "custom")
    { name: "since", label: "Start Date", type: "date", required: false, dependsOn: "pageId", showWhen: { field: "dateRange", value: "custom" }, hidden: true },
    { name: "until", label: "End Date", type: "date", required: false, dependsOn: "pageId", showWhen: { field: "dateRange", value: "custom" }, hidden: true }
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
    { name: "pageId", label: "Page", type: "select", dynamic: true, required: true, placeholder: "Select a Facebook page", uiTab: "basic" },
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
    { name: "pageId", label: "Page", type: "select", dynamic: true, required: true, placeholder: "Select a Facebook page", uiTab: "basic" },
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