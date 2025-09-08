import { AtSign, UserPlus, MessageCircle, Search, MessageSquare, PenSquare, Reply, Repeat, RotateCcw, Heart, HeartOff, UserMinus, Clock } from "lucide-react"
import { NodeComponent } from "../../types"

export const twitterNodes: NodeComponent[] = [
  // Triggers
  {
    type: "twitter_trigger_new_mention",
    title: "New Mention",
    description: "Triggers when someone mentions your account in a tweet",
    icon: AtSign,
    providerId: "twitter",
    category: "Social",
    isTrigger: true,
    comingSoon: true,
    outputSchema: [
      { name: "tweetId", label: "Tweet ID", type: "string", description: "The ID of the tweet that mentioned you" },
      { name: "tweetText", label: "Tweet Text", type: "string", description: "The text content of the tweet" },
      { name: "authorId", label: "Author ID", type: "string", description: "The ID of the user who mentioned you" },
      { name: "authorUsername", label: "Author Username", type: "string", description: "The username of the user who mentioned you" },
      { name: "authorName", label: "Author Name", type: "string", description: "The display name of the user who mentioned you" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the tweet was created (ISO 8601 format)" },
      { name: "retweetCount", label: "Retweet Count", type: "number", description: "Number of retweets" },
      { name: "likeCount", label: "Like Count", type: "number", description: "Number of likes" },
      { name: "replyCount", label: "Reply Count", type: "number", description: "Number of replies" }
    ]
  },
  {
    type: "twitter_trigger_new_follower",
    title: "New Follower",
    description: "Triggers when someone follows your account",
    icon: UserPlus,
    providerId: "twitter",
    category: "Social",
    isTrigger: true,
    comingSoon: true,
    outputSchema: [
      { name: "followerId", label: "Follower ID", type: "string", description: "The ID of the new follower" },
      { name: "followerUsername", label: "Follower Username", type: "string", description: "The username of the new follower" },
      { name: "followerName", label: "Follower Name", type: "string", description: "The display name of the new follower" },
      { name: "followerBio", label: "Follower Bio", type: "string", description: "The bio of the new follower" },
      { name: "followerProfileImage", label: "Follower Profile Image", type: "string", description: "URL of the follower's profile image" },
      { name: "followedAt", label: "Followed At", type: "string", description: "When they followed you (ISO 8601 format)" }
    ]
  },
  {
    type: "twitter_trigger_new_direct_message",
    title: "New Direct Message",
    description: "Triggers when you receive a new direct message",
    icon: MessageCircle,
    providerId: "twitter",
    category: "Social",
    isTrigger: true,
    comingSoon: true,
    outputSchema: [
      { name: "messageId", label: "Message ID", type: "string", description: "The ID of the direct message" },
      { name: "messageText", label: "Message Text", type: "string", description: "The text content of the message" },
      { name: "senderId", label: "Sender ID", type: "string", description: "The ID of the message sender" },
      { name: "senderUsername", label: "Sender Username", type: "string", description: "The username of the message sender" },
      { name: "senderName", label: "Sender Name", type: "string", description: "The display name of the message sender" },
      { name: "sentAt", label: "Sent At", type: "string", description: "When the message was sent (ISO 8601 format)" },
      { name: "hasMedia", label: "Has Media", type: "boolean", description: "Whether the message contains media" }
    ]
  },
  {
    type: "twitter_trigger_search_match",
    title: "Tweet Matching Search",
    description: "Triggers when a tweet matches your search query",
    icon: Search,
    providerId: "twitter",
    category: "Social",
    isTrigger: true,
    comingSoon: true,
    configSchema: [
      { 
        name: "searchQuery", 
        label: "Search Query", 
        type: "text", 
        required: true, 
        placeholder: "Enter keywords, hashtags, or phrases to search for",
        description: "Search for tweets containing specific keywords, hashtags, or phrases"
      },
      { 
        name: "filters", 
        label: "Search Filters", 
        type: "multi-select", 
        required: false, 
        options: [
          { value: "verified", label: "Verified accounts only" },
          { value: "has:links", label: "Tweets with links" },
          { value: "has:media", label: "Tweets with media" },
          { value: "has:images", label: "Tweets with images" },
          { value: "has:videos", label: "Tweets with videos" },
          { value: "lang:en", label: "English tweets only" },
          { value: "is:retweet", label: "Retweets only" },
          { value: "is:reply", label: "Replies only" },
          { value: "is:quote", label: "Quote tweets only" }
        ],
        description: "Apply filters to narrow down search results"
      }
    ],
    outputSchema: [
      { name: "tweetId", label: "Tweet ID", type: "string", description: "The ID of the matching tweet" },
      { name: "tweetText", label: "Tweet Text", type: "string", description: "The text content of the tweet" },
      { name: "authorId", label: "Author ID", type: "string", description: "The ID of the tweet author" },
      { name: "authorUsername", label: "Author Username", type: "string", description: "The username of the tweet author" },
      { name: "authorName", label: "Author Name", type: "string", description: "The display name of the tweet author" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the tweet was created (ISO 8601 format)" },
      { name: "retweetCount", label: "Retweet Count", type: "number", description: "Number of retweets" },
      { name: "likeCount", label: "Like Count", type: "number", description: "Number of likes" },
      { name: "replyCount", label: "Reply Count", type: "number", description: "Number of replies" },
      { name: "hasMedia", label: "Has Media", type: "boolean", description: "Whether the tweet contains media" }
    ]
  },
  {
    type: "twitter_trigger_user_tweet",
    title: "User Tweet Posted",
    description: "Triggers when a specific user posts a tweet",
    icon: MessageSquare,
    providerId: "twitter",
    category: "Social",
    isTrigger: true,
    comingSoon: true,
    configSchema: [
      { 
        name: "username", 
        label: "Username", 
        type: "text", 
        required: true, 
        placeholder: "Enter the username to monitor (without @)",
        description: "The username of the account to monitor for new tweets"
      }
    ],
    outputSchema: [
      { name: "tweetId", label: "Tweet ID", type: "string", description: "The ID of the new tweet" },
      { name: "tweetText", label: "Tweet Text", type: "string", description: "The text content of the tweet" },
      { name: "authorId", label: "Author ID", type: "string", description: "The ID of the tweet author" },
      { name: "authorUsername", label: "Author Username", type: "string", description: "The username of the tweet author" },
      { name: "authorName", label: "Author Name", type: "string", description: "The display name of the tweet author" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the tweet was created (ISO 8601 format)" },
      { name: "retweetCount", label: "Retweet Count", type: "number", description: "Number of retweets" },
      { name: "likeCount", label: "Like Count", type: "number", description: "Number of likes" },
      { name: "replyCount", label: "Reply Count", type: "number", description: "Number of replies" },
      { name: "hasMedia", label: "Has Media", type: "boolean", description: "Whether the tweet contains media" }
    ]
  },

  // Actions
  {
    type: "twitter_action_post_tweet",
    title: "Post Tweet",
    description: "Post a new tweet to your account",
    icon: PenSquare,
    providerId: "twitter",
    requiredScopes: ["tweet.write"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      // Basic Tab - Essential tweet features
      { 
        name: "text", 
        label: "Tweet Text", 
        type: "textarea", 
        required: true, 
        placeholder: "What's happening?",
        description: "The text content of your tweet (max 280 characters)",
        uiTab: "basic"
      },
      { 
        name: "mediaFiles", 
        label: "Media Attachments", 
        type: "file", 
        required: false, 
        accept: "image/*,video/*,.gif",
        maxSize: 512 * 1024 * 1024, // 512MB for videos
        placeholder: "Upload images, videos, or GIFs",
        description: "Upload up to 4 media files (images: 5MB, GIFs: 15MB, videos: 512MB)",
        uiTab: "basic"
      },
      { 
        name: "replyToTweetId", 
        label: "Reply to Tweet ID", 
        type: "text", 
        required: false, 
        placeholder: "Enter tweet ID to reply to (optional)",
        description: "Make this tweet a reply to another tweet",
        uiTab: "basic"
      },
      { 
        name: "scheduledTime", 
        label: "Schedule Tweet", 
        type: "datetime", 
        required: false, 
        placeholder: "Select date and time",
        description: "Schedule your tweet for a future time",
        uiTab: "basic"
      },
      
      // Advanced Tab - Additional features
      { 
        name: "altTexts", 
        label: "Alt Text for Media", 
        type: "textarea", 
        required: false, 
        placeholder: "Describe your media for accessibility (one description per line)",
        description: "Provide alt text descriptions for each media file, one per line",
        uiTab: "advanced"
      },
      { 
        name: "pollQuestion", 
        label: "Poll Question", 
        type: "text", 
        required: false, 
        placeholder: "Ask a question for your poll",
        description: "Create a poll with your tweet",
        uiTab: "advanced"
      },
      { 
        name: "pollOptions", 
        label: "Poll Options", 
        type: "textarea", 
        required: false, 
        placeholder: "Option 1\nOption 2\nOption 3\nOption 4",
        description: "Enter 2-4 poll options, one per line",
        uiTab: "advanced"
      },
      { 
        name: "pollDuration", 
        label: "Poll Duration", 
        type: "select", 
        required: false, 
        options: [
          { value: "5", label: "5 minutes" },
          { value: "10", label: "10 minutes" },
          { value: "15", label: "15 minutes" },
          { value: "30", label: "30 minutes" },
          { value: "60", label: "1 hour" },
          { value: "120", label: "2 hours" },
          { value: "180", label: "3 hours" },
          { value: "360", label: "6 hours" },
          { value: "720", label: "12 hours" },
          { value: "1440", label: "1 day" },
          { value: "2880", label: "2 days" },
          { value: "4320", label: "3 days" },
          { value: "5760", label: "4 days" },
          { value: "7200", label: "5 days" },
          { value: "8640", label: "6 days" },
          { value: "10080", label: "7 days" }
        ],
        defaultValue: "1440",
        description: "How long should the poll run?",
        uiTab: "advanced"
      },
      { 
        name: "location", 
        label: "Location", 
        type: "location-autocomplete", 
        required: false, 
        placeholder: "Search for a location",
        description: "Add a location tag to your tweet",
        uiTab: "advanced"
      },
      { 
        name: "quoteTweetId", 
        label: "Quote Tweet ID", 
        type: "text", 
        required: false, 
        placeholder: "Enter tweet ID to quote",
        description: "Quote another tweet in your post",
        uiTab: "advanced"
      },
      { 
        name: "sensitiveMedia", 
        label: "Mark Media as Sensitive", 
        type: "boolean", 
        required: false, 
        defaultValue: false,
        description: "Mark your media as potentially sensitive content",
        uiTab: "advanced"
      },
      { 
        name: "replySettings", 
        label: "Who Can Reply", 
        type: "select", 
        required: false, 
        options: [
          { value: "everyone", label: "Everyone" },
          { value: "following", label: "People you follow" },
          { value: "mentioned", label: "Only people mentioned" }
        ],
        defaultValue: "everyone",
        description: "Control who can reply to your tweet",
        uiTab: "advanced"
      },
      { 
        name: "forSuperFollowersOnly", 
        label: "Super Followers Only", 
        type: "boolean", 
        required: false, 
        defaultValue: false,
        description: "Make this tweet visible only to Super Followers",
        uiTab: "advanced"
      },
      { 
        name: "circleTweetId", 
        label: "Twitter Circle", 
        type: "boolean", 
        required: false, 
        defaultValue: false,
        description: "Share this tweet only with your Twitter Circle",
        uiTab: "advanced"
      },
      { 
        name: "cardUrl", 
        label: "Card URL", 
        type: "text", 
        required: false, 
        placeholder: "https://example.com",
        description: "Add a Twitter Card with link preview",
        uiTab: "advanced"
      },
      { 
        name: "communityId", 
        label: "Community ID", 
        type: "text", 
        required: false, 
        placeholder: "Enter community ID",
        description: "Post to a specific Twitter Community",
        uiTab: "advanced"
      },
      { 
        name: "excludeReplyUserIds", 
        label: "Exclude Reply User IDs", 
        type: "textarea", 
        required: false, 
        placeholder: "Enter user IDs to exclude from reply (one per line)",
        description: "Exclude specific users from being able to reply",
        uiTab: "advanced"
      },
      { 
        name: "mediaTagUserIds", 
        label: "Tag Users in Media", 
        type: "textarea", 
        required: false, 
        placeholder: "Enter user IDs to tag in media (one per line)",
        description: "Tag up to 10 users in your media",
        uiTab: "advanced"
      },
      { 
        name: "directMessageDeepLink", 
        label: "Direct Message Deep Link", 
        type: "text", 
        required: false, 
        placeholder: "Enter deep link URL",
        description: "Add a direct message deep link to your tweet",
        uiTab: "advanced"
      }
    ]
  },
  {
    type: "twitter_action_reply_tweet",
    title: "Reply to Tweet",
    description: "Reply to an existing tweet",
    icon: Reply,
    providerId: "twitter",
    requiredScopes: ["tweet.write", "tweet.read", "users.read"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      {
        name: "tweetId",
        label: "Tweet to Reply To",
        type: "select",
        required: true,
        dynamic: "twitter_mentions",
        placeholder: "Select a tweet you were mentioned in",
        description: "Choose a recent tweet mentioning you to reply to"
      },
      {
        name: "text",
        label: "Reply Text",
        type: "textarea",
        required: true,
        placeholder: "Write your reply...",
        description: "The text content of your reply (max 280 characters)"
      },
      {
        name: "mediaFiles",
        label: "Media Attachments",
        type: "file",
        required: false,
        accept: "image/*,video/*,.gif",
        maxSize: 5 * 1024 * 1024,
        placeholder: "Upload images, videos, or GIFs",
        description: "Upload up to 4 media files (images, videos, or GIFs)"
      },
      {
        name: "altTexts",
        label: "Alt Text for Media",
        type: "textarea",
        required: false,
        placeholder: "Describe your media for accessibility (one description per line)",
        description: "Provide alt text descriptions for each media file, one per line"
      }
    ]
  },
  {
    type: "twitter_action_retweet",
    title: "Retweet",
    description: "Retweet an existing tweet",
    icon: Repeat,
    providerId: "twitter",
    requiredScopes: ["tweet.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "tweetId", 
        label: "Tweet ID to Retweet", 
        type: "text", 
        required: true, 
        placeholder: "Enter the ID of the tweet you want to retweet",
        description: "The ID of the tweet you want to retweet"
      }
    ]
  },
  {
    type: "twitter_action_unretweet",
    title: "Undo Retweet",
    description: "Remove a retweet from your timeline",
    icon: RotateCcw,
    providerId: "twitter",
    requiredScopes: ["tweet.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "tweetId", 
        label: "Tweet ID to Unretweet", 
        type: "text", 
        required: true, 
        placeholder: "Enter the ID of the tweet you want to unretweet",
        description: "The ID of the tweet you want to remove from your retweets"
      }
    ]
  },
  {
    type: "twitter_action_like_tweet",
    title: "Like Tweet",
    description: "Like an existing tweet",
    icon: Heart,
    providerId: "twitter",
    requiredScopes: ["tweet.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "tweetId", 
        label: "Tweet ID to Like", 
        type: "text", 
        required: true, 
        placeholder: "Enter the ID of the tweet you want to like",
        description: "The ID of the tweet you want to like"
      }
    ]
  },
  {
    type: "twitter_action_unlike_tweet",
    title: "Unlike Tweet",
    description: "Remove a like from a tweet",
    icon: HeartOff,
    providerId: "twitter",
    requiredScopes: ["tweet.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "tweetId", 
        label: "Tweet ID to Unlike", 
        type: "text", 
        required: true, 
        placeholder: "Enter the ID of the tweet you want to unlike",
        description: "The ID of the tweet you want to remove your like from"
      }
    ]
  },
  {
    type: "twitter_action_send_dm",
    title: "Send Direct Message",
    description: "Send a direct message to a user",
    icon: MessageCircle,
    providerId: "twitter",
    requiredScopes: ["dm.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "recipientId", 
        label: "Recipient User ID", 
        type: "text", 
        required: true, 
        placeholder: "Enter the user ID of the recipient",
        description: "The user ID of the person you want to send a DM to"
      },
      { 
        name: "message", 
        label: "Message", 
        type: "textarea", 
        required: true, 
        placeholder: "Write your message...",
        description: "The text content of your direct message"
      },
      { 
        name: "mediaFiles", 
        label: "Media Attachments", 
        type: "file", 
        required: false, 
        accept: "image/*,video/*,.gif",
        maxSize: 5 * 1024 * 1024,
        placeholder: "Upload images, videos, or GIFs",
        description: "Upload media files to include in your DM"
      }
    ]
  },
  {
    type: "twitter_action_follow_user",
    title: "Follow User",
    description: "Follow a user on Twitter",
    icon: UserPlus,
    providerId: "twitter",
    requiredScopes: ["users.read", "follows.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "userId", 
        label: "User ID to Follow", 
        type: "text", 
        required: true, 
        placeholder: "Enter the user ID of the person you want to follow",
        description: "The user ID of the person you want to follow"
      }
    ]
  },
  {
    type: "twitter_action_unfollow_user",
    title: "Unfollow User",
    description: "Unfollow a user on Twitter",
    icon: UserMinus,
    providerId: "twitter",
    requiredScopes: ["users.read", "follows.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "userId", 
        label: "User ID to Unfollow", 
        type: "text", 
        required: true, 
        placeholder: "Enter the user ID of the person you want to unfollow",
        description: "The user ID of the person you want to unfollow"
      }
    ]
  },
  {
    type: "twitter_action_search_tweets",
    title: "Search Tweets",
    description: "Search for tweets based on keywords, hashtags, and filters",
    icon: Search,
    providerId: "twitter",
    requiredScopes: ["tweet.read"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "query", 
        label: "Search Query", 
        type: "text", 
        required: true, 
        placeholder: "Enter keywords, hashtags, or phrases to search for",
        description: "Search for tweets containing specific keywords, hashtags, or phrases"
      },
      { 
        name: "filters", 
        label: "Search Filters", 
        type: "multi-select", 
        required: false, 
        options: [
          { value: "verified", label: "Verified accounts only" },
          { value: "has:links", label: "Tweets with links" },
          { value: "has:media", label: "Tweets with media" },
          { value: "has:images", label: "Tweets with images" },
          { value: "has:videos", label: "Tweets with videos" },
          { value: "lang:en", label: "English tweets only" },
          { value: "is:retweet", label: "Retweets only" },
          { value: "is:reply", label: "Replies only" },
          { value: "is:quote", label: "Quote tweets only" }
        ],
        description: "Apply filters to narrow down search results"
      },
      { 
        name: "maxResults", 
        label: "Maximum Results", 
        type: "number", 
        required: false, 
        defaultValue: 10,
        placeholder: "10",
        description: "Maximum number of tweets to return (1-100)"
      },
      { 
        name: "startTime", 
        label: "Start Time", 
        type: "datetime", 
        required: false, 
        placeholder: "Search tweets from this time onwards",
        description: "Only return tweets created after this time"
      },
      { 
        name: "endTime", 
        label: "End Time", 
        type: "datetime", 
        required: false, 
        placeholder: "Search tweets up to this time",
        description: "Only return tweets created before this time"
      }
    ]
  },
  {
    type: "twitter_action_get_user_timeline",
    title: "Get User Timeline",
    description: "Get tweets from a user's timeline",
    icon: Clock,
    providerId: "twitter",
    requiredScopes: ["tweet.read"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "userId", 
        label: "User ID", 
        type: "text", 
        required: true, 
        placeholder: "Enter the user ID to get timeline for",
        description: "The user ID to get the timeline for"
      },
      { 
        name: "maxResults", 
        label: "Maximum Results", 
        type: "number", 
        required: false, 
        defaultValue: 10,
        placeholder: "10",
        description: "Maximum number of tweets to return (1-100)"
      },
      { 
        name: "excludeRetweets", 
        label: "Exclude Retweets", 
        type: "boolean", 
        required: false, 
        defaultValue: false,
        description: "Exclude retweets from the results"
      },
      { 
        name: "excludeReplies", 
        label: "Exclude Replies", 
        type: "boolean", 
        required: false, 
        defaultValue: false,
        description: "Exclude replies from the results"
      }
    ]
  },
  {
    type: "twitter_action_get_mentions",
    title: "Get Mentions Timeline",
    description: "Get tweets that mention your account",
    icon: AtSign,
    providerId: "twitter",
    requiredScopes: ["tweet.read"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "maxResults", 
        label: "Maximum Results", 
        type: "number", 
        required: false, 
        defaultValue: 10,
        placeholder: "10",
        description: "Maximum number of mentions to return (1-100)"
      },
      { 
        name: "startTime", 
        label: "Start Time", 
        type: "datetime", 
        required: false, 
        placeholder: "Get mentions from this time onwards",
        description: "Only return mentions created after this time"
      },
      { 
        name: "endTime", 
        label: "End Time", 
        type: "datetime", 
        required: false, 
        placeholder: "Get mentions up to this time",
        description: "Only return mentions created before this time"
      }
    ]
  }
]