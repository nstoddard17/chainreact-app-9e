import { FieldSchema } from '../../../ai/smartAIAgent';

export const createTweet: FieldSchema[] = [
  {
    name: 'text',
    type: 'string',
    required: true,
    description: 'Tweet content (max 280 characters for text-only tweets)',
    examples: [
      'Excited to announce our new product launch! 🚀 #innovation #startup',
      'Just shipped a major update with improved performance and new features. Check it out at https://ourapp.com',
      'Thank you to our amazing community for the feedback! We\'re listening and building based on your input 💙'
    ],
    priority: 'high'
  },
  {
    name: 'media',
    type: 'array',
    required: false,
    description: 'Array of media file paths or URLs to attach (images, videos, GIFs)',
    examples: [
      ['/path/to/product-screenshot.jpg'],
      ['https://example.com/demo-video.mp4'],
      ['image1.png', 'image2.png', 'image3.png']
    ],
    priority: 'medium'
  },
  {
    name: 'poll',
    type: 'object',
    required: false,
    description: 'Poll configuration with options and duration',
    examples: [
      {
        options: ['Option A', 'Option B', 'Option C'],
        duration_minutes: 1440
      },
      {
        options: ['Yes', 'No'],
        duration_minutes: 60
      }
    ],
    priority: 'low'
  },
  {
    name: 'reply_to_tweet_id',
    type: 'string',
    required: false,
    description: 'Tweet ID to reply to (creates a reply thread)',
    examples: ['1234567890123456789'],
    priority: 'medium'
  },
  {
    name: 'quote_tweet_id',
    type: 'string',
    required: false,
    description: 'Tweet ID to quote tweet',
    examples: ['1234567890123456789'],
    priority: 'medium'
  }
];

export const scheduleTweet: FieldSchema[] = [
  {
    name: 'text',
    type: 'string',
    required: true,
    description: 'Tweet content to be posted later',
    examples: [
      'Good morning! Here\'s what we\'re working on today... 🌅',
      'Weekly update: Our team accomplished amazing things this week!',
      'Don\'t forget to register for our webinar tomorrow at 2pm EST'
    ],
    priority: 'high'
  },
  {
    name: 'scheduled_at',
    type: 'date',
    required: true,
    description: 'Date and time to publish the tweet (ISO format)',
    examples: [
      '2024-03-15T10:00:00Z',
      '2024-03-16T14:30:00-05:00',
      '2024-03-17T09:00:00+01:00'
    ],
    priority: 'high'
  },
  {
    name: 'media',
    type: 'array',
    required: false,
    description: 'Media files to include with scheduled tweet',
    examples: [
      ['morning-photo.jpg'],
      ['update-graphic.png', 'team-photo.jpg']
    ],
    priority: 'medium'
  }
];

export const retweet: FieldSchema[] = [
  {
    name: 'tweet_id',
    type: 'string',
    required: true,
    description: 'ID of the tweet to retweet',
    examples: ['1234567890123456789', '9876543210987654321'],
    priority: 'high'
  },
  {
    name: 'quote_text',
    type: 'string',
    required: false,
    description: 'Optional comment to add when quote retweeting',
    examples: [
      'This is exactly what we\'ve been talking about!',
      'Great insights from the team 👏',
      'Couldn\'t agree more with this perspective'
    ],
    priority: 'medium'
  }
];

export const likeTweet: FieldSchema[] = [
  {
    name: 'tweet_id',
    type: 'string',
    required: true,
    description: 'ID of the tweet to like',
    examples: ['1234567890123456789', '9876543210987654321'],
    priority: 'high'
  }
];

export const followUser: FieldSchema[] = [
  {
    name: 'username',
    type: 'string',
    required: false,
    description: 'Twitter username to follow (without @)',
    examples: ['elonmusk', 'twitter', 'openai'],
    priority: 'high'
  },
  {
    name: 'user_id',
    type: 'string',
    required: false,
    description: 'Twitter user ID to follow (alternative to username)',
    examples: ['44196397', '783214', '1234567890'],
    priority: 'high',
    dependencies: ['username']
  }
];

export const sendDirectMessage: FieldSchema[] = [
  {
    name: 'recipient_username',
    type: 'string',
    required: false,
    description: 'Username of the message recipient (without @)',
    examples: ['johndoe', 'support_team', 'partner_company'],
    priority: 'high'
  },
  {
    name: 'recipient_user_id',
    type: 'string',
    required: false,
    description: 'User ID of the message recipient (alternative to username)',
    examples: ['1234567890', '9876543210'],
    priority: 'high',
    dependencies: ['recipient_username']
  },
  {
    name: 'text',
    type: 'string',
    required: true,
    description: 'Direct message content',
    examples: [
      'Hi! Thanks for your interest in our product. How can we help?',
      'Following up on our conversation about the partnership opportunity.',
      'Thank you for the feedback! We\'ll definitely consider this for our next update.'
    ],
    priority: 'high'
  },
  {
    name: 'media',
    type: 'array',
    required: false,
    description: 'Media files to attach to the direct message',
    examples: [
      ['product-demo.gif'],
      ['proposal.pdf', 'screenshots.png']
    ],
    priority: 'medium'
  }
];

export const searchTweets: FieldSchema[] = [
  {
    name: 'query',
    type: 'string',
    required: true,
    description: 'Search query using Twitter search operators',
    examples: [
      '#AI #MachineLearning',
      'from:openai lang:en',
      '"artificial intelligence" -bot',
      '@chainreact OR @ourcompany'
    ],
    priority: 'high'
  },
  {
    name: 'max_results',
    type: 'number',
    required: false,
    description: 'Maximum number of tweets to return (10-100)',
    examples: [10, 25, 50, 100],
    priority: 'medium'
  },
  {
    name: 'tweet_type',
    type: 'string',
    required: false,
    description: 'Type of tweets to include in search',
    examples: ['recent', 'popular', 'mixed'],
    priority: 'low'
  },
  {
    name: 'since_date',
    type: 'date',
    required: false,
    description: 'Only return tweets after this date',
    examples: ['2024-03-01', '2024-03-15T00:00:00Z'],
    priority: 'medium'
  },
  {
    name: 'until_date',
    type: 'date',
    required: false,
    description: 'Only return tweets before this date',
    examples: ['2024-03-31', '2024-03-15T23:59:59Z'],
    priority: 'medium'
  }
];