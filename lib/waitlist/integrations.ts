/**
 * Comprehensive list of integrations for waitlist selection
 * Organized by category like Zapier
 */

export interface Integration {
  id: string
  name: string
  category: string
  description?: string
}

export const integrationCategories = [
  'Communication',
  'CRM',
  'Marketing',
  'Project Management',
  'Productivity',
  'Development',
  'Analytics',
  'E-commerce',
  'Finance',
  'HR',
  'Social Media',
  'Storage',
  'Calendar & Scheduling',
  'Forms & Surveys',
  'Databases',
  'Support',
  'Video & Audio',
  'AI & Machine Learning',
  'Other',
] as const

export const integrations: Integration[] = [
  // Communication
  { id: 'gmail', name: 'Gmail', category: 'Communication', description: 'Email management' },
  { id: 'outlook', name: 'Outlook', category: 'Communication', description: 'Microsoft email' },
  { id: 'slack', name: 'Slack', category: 'Communication', description: 'Team messaging' },
  { id: 'discord', name: 'Discord', category: 'Communication', description: 'Community chat' },
  { id: 'microsoft-teams', name: 'Microsoft Teams', category: 'Communication', description: 'Team collaboration' },
  { id: 'telegram', name: 'Telegram', category: 'Communication', description: 'Messaging app' },
  { id: 'whatsapp', name: 'WhatsApp Business', category: 'Communication', description: 'Business messaging' },
  { id: 'twilio', name: 'Twilio', category: 'Communication', description: 'SMS & Voice' },
  { id: 'sendgrid', name: 'SendGrid', category: 'Communication', description: 'Email delivery' },
  { id: 'mailchimp', name: 'Mailchimp', category: 'Communication', description: 'Email marketing' },

  // CRM
  { id: 'salesforce', name: 'Salesforce', category: 'CRM', description: 'Sales CRM' },
  { id: 'hubspot', name: 'HubSpot', category: 'CRM', description: 'Marketing & Sales' },
  { id: 'pipedrive', name: 'Pipedrive', category: 'CRM', description: 'Sales pipeline' },
  { id: 'zoho-crm', name: 'Zoho CRM', category: 'CRM', description: 'Customer management' },
  { id: 'monday-crm', name: 'Monday CRM', category: 'CRM', description: 'Visual CRM' },
  { id: 'copper', name: 'Copper', category: 'CRM', description: 'Google Workspace CRM' },
  { id: 'close', name: 'Close', category: 'CRM', description: 'Sales engagement' },

  // Marketing
  { id: 'klaviyo', name: 'Klaviyo', category: 'Marketing', description: 'Email & SMS marketing' },
  { id: 'activecampaign', name: 'ActiveCampaign', category: 'Marketing', description: 'Marketing automation' },
  { id: 'constant-contact', name: 'Constant Contact', category: 'Marketing', description: 'Email marketing' },
  { id: 'convertkit', name: 'ConvertKit', category: 'Marketing', description: 'Creator marketing' },
  { id: 'drip', name: 'Drip', category: 'Marketing', description: 'E-commerce marketing' },
  { id: 'intercom', name: 'Intercom', category: 'Marketing', description: 'Customer messaging' },
  { id: 'drift', name: 'Drift', category: 'Marketing', description: 'Conversational marketing' },

  // Project Management
  { id: 'asana', name: 'Asana', category: 'Project Management', description: 'Task management' },
  { id: 'trello', name: 'Trello', category: 'Project Management', description: 'Visual boards' },
  { id: 'monday', name: 'Monday.com', category: 'Project Management', description: 'Work OS' },
  { id: 'clickup', name: 'ClickUp', category: 'Project Management', description: 'All-in-one workspace' },
  { id: 'jira', name: 'Jira', category: 'Project Management', description: 'Agile project tracking' },
  { id: 'basecamp', name: 'Basecamp', category: 'Project Management', description: 'Project collaboration' },
  { id: 'wrike', name: 'Wrike', category: 'Project Management', description: 'Work management' },
  { id: 'smartsheet', name: 'Smartsheet', category: 'Project Management', description: 'Spreadsheet PM' },
  { id: 'height', name: 'Height', category: 'Project Management', description: 'Autonomous PM' },
  { id: 'linear', name: 'Linear', category: 'Project Management', description: 'Issue tracking' },

  // Productivity
  { id: 'notion', name: 'Notion', category: 'Productivity', description: 'All-in-one workspace' },
  { id: 'evernote', name: 'Evernote', category: 'Productivity', description: 'Note taking' },
  { id: 'onenote', name: 'OneNote', category: 'Productivity', description: 'Microsoft notes' },
  { id: 'todoist', name: 'Todoist', category: 'Productivity', description: 'To-do lists' },
  { id: 'any-do', name: 'Any.do', category: 'Productivity', description: 'Task manager' },
  { id: 'things', name: 'Things', category: 'Productivity', description: 'Task management' },
  { id: 'omnifocus', name: 'OmniFocus', category: 'Productivity', description: 'Getting things done' },
  { id: 'coda', name: 'Coda', category: 'Productivity', description: 'Docs & automation' },
  { id: 'craft', name: 'Craft', category: 'Productivity', description: 'Document editor' },

  // Development
  { id: 'github', name: 'GitHub', category: 'Development', description: 'Code hosting' },
  { id: 'gitlab', name: 'GitLab', category: 'Development', description: 'DevOps platform' },
  { id: 'bitbucket', name: 'Bitbucket', category: 'Development', description: 'Git solution' },
  { id: 'jenkins', name: 'Jenkins', category: 'Development', description: 'CI/CD automation' },
  { id: 'circleci', name: 'CircleCI', category: 'Development', description: 'Continuous integration' },
  { id: 'vercel', name: 'Vercel', category: 'Development', description: 'Deployment platform' },
  { id: 'netlify', name: 'Netlify', category: 'Development', description: 'Web hosting' },
  { id: 'heroku', name: 'Heroku', category: 'Development', description: 'Cloud platform' },
  { id: 'aws', name: 'AWS', category: 'Development', description: 'Cloud services' },
  { id: 'azure', name: 'Azure', category: 'Development', description: 'Microsoft cloud' },
  { id: 'gcp', name: 'Google Cloud Platform', category: 'Development', description: 'Google cloud' },
  { id: 'docker', name: 'Docker', category: 'Development', description: 'Containerization' },
  { id: 'kubernetes', name: 'Kubernetes', category: 'Development', description: 'Container orchestration' },

  // Analytics
  { id: 'google-analytics', name: 'Google Analytics', category: 'Analytics', description: 'Web analytics' },
  { id: 'mixpanel', name: 'Mixpanel', category: 'Analytics', description: 'Product analytics' },
  { id: 'amplitude', name: 'Amplitude', category: 'Analytics', description: 'Digital analytics' },
  { id: 'segment', name: 'Segment', category: 'Analytics', description: 'Customer data platform' },
  { id: 'heap', name: 'Heap', category: 'Analytics', description: 'Digital insights' },
  { id: 'hotjar', name: 'Hotjar', category: 'Analytics', description: 'Behavior analytics' },
  { id: 'posthog', name: 'PostHog', category: 'Analytics', description: 'Product OS' },
  { id: 'plausible', name: 'Plausible', category: 'Analytics', description: 'Privacy-friendly analytics' },

  // E-commerce
  { id: 'shopify', name: 'Shopify', category: 'E-commerce', description: 'Online store' },
  { id: 'woocommerce', name: 'WooCommerce', category: 'E-commerce', description: 'WordPress e-commerce' },
  { id: 'bigcommerce', name: 'BigCommerce', category: 'E-commerce', description: 'E-commerce platform' },
  { id: 'magento', name: 'Magento', category: 'E-commerce', description: 'Commerce platform' },
  { id: 'square', name: 'Square', category: 'E-commerce', description: 'Payment processing' },
  { id: 'stripe', name: 'Stripe', category: 'E-commerce', description: 'Payment infrastructure' },
  { id: 'paypal', name: 'PayPal', category: 'E-commerce', description: 'Payment platform' },
  { id: 'amazon', name: 'Amazon Seller', category: 'E-commerce', description: 'Amazon marketplace' },
  { id: 'ebay', name: 'eBay', category: 'E-commerce', description: 'Online marketplace' },
  { id: 'etsy', name: 'Etsy', category: 'E-commerce', description: 'Handmade marketplace' },

  // Finance
  { id: 'quickbooks', name: 'QuickBooks', category: 'Finance', description: 'Accounting software' },
  { id: 'xero', name: 'Xero', category: 'Finance', description: 'Accounting platform' },
  { id: 'freshbooks', name: 'FreshBooks', category: 'Finance', description: 'Invoicing & accounting' },
  { id: 'wave', name: 'Wave', category: 'Finance', description: 'Free accounting' },
  { id: 'expensify', name: 'Expensify', category: 'Finance', description: 'Expense management' },
  { id: 'brex', name: 'Brex', category: 'Finance', description: 'Corporate cards' },
  { id: 'ramp', name: 'Ramp', category: 'Finance', description: 'Finance automation' },
  { id: 'bill-com', name: 'Bill.com', category: 'Finance', description: 'AP/AR automation' },

  // HR
  { id: 'bamboohr', name: 'BambooHR', category: 'HR', description: 'HR software' },
  { id: 'gusto', name: 'Gusto', category: 'HR', description: 'Payroll & benefits' },
  { id: 'rippling', name: 'Rippling', category: 'HR', description: 'HR platform' },
  { id: 'workday', name: 'Workday', category: 'HR', description: 'Enterprise HR' },
  { id: 'adp', name: 'ADP', category: 'HR', description: 'Payroll & HR' },
  { id: 'greenhouse', name: 'Greenhouse', category: 'HR', description: 'Recruiting software' },
  { id: 'lever', name: 'Lever', category: 'HR', description: 'Talent acquisition' },
  { id: 'lattice', name: 'Lattice', category: 'HR', description: 'Performance management' },
  { id: 'culture-amp', name: 'Culture Amp', category: 'HR', description: 'Employee engagement' },

  // Social Media
  { id: 'twitter', name: 'Twitter / X', category: 'Social Media', description: 'Social networking' },
  { id: 'facebook', name: 'Facebook', category: 'Social Media', description: 'Social network' },
  { id: 'instagram', name: 'Instagram', category: 'Social Media', description: 'Photo sharing' },
  { id: 'linkedin', name: 'LinkedIn', category: 'Social Media', description: 'Professional network' },
  { id: 'youtube', name: 'YouTube', category: 'Social Media', description: 'Video platform' },
  { id: 'tiktok', name: 'TikTok', category: 'Social Media', description: 'Short video' },
  { id: 'pinterest', name: 'Pinterest', category: 'Social Media', description: 'Visual discovery' },
  { id: 'reddit', name: 'Reddit', category: 'Social Media', description: 'Discussion platform' },
  { id: 'buffer', name: 'Buffer', category: 'Social Media', description: 'Social media management' },
  { id: 'hootsuite', name: 'Hootsuite', category: 'Social Media', description: 'Social media tools' },

  // Storage
  { id: 'google-drive', name: 'Google Drive', category: 'Storage', description: 'Cloud storage' },
  { id: 'dropbox', name: 'Dropbox', category: 'Storage', description: 'File hosting' },
  { id: 'onedrive', name: 'OneDrive', category: 'Storage', description: 'Microsoft storage' },
  { id: 'box', name: 'Box', category: 'Storage', description: 'Cloud content' },
  { id: 'icloud', name: 'iCloud', category: 'Storage', description: 'Apple storage' },
  { id: 's3', name: 'Amazon S3', category: 'Storage', description: 'Object storage' },
  { id: 'backblaze', name: 'Backblaze', category: 'Storage', description: 'Cloud backup' },

  // Calendar & Scheduling
  { id: 'google-calendar', name: 'Google Calendar', category: 'Calendar & Scheduling', description: 'Calendar app' },
  { id: 'outlook-calendar', name: 'Outlook Calendar', category: 'Calendar & Scheduling', description: 'Microsoft calendar' },
  { id: 'calendly', name: 'Calendly', category: 'Calendar & Scheduling', description: 'Scheduling tool' },
  { id: 'cal-com', name: 'Cal.com', category: 'Calendar & Scheduling', description: 'Open source scheduling' },
  { id: 'acuity', name: 'Acuity Scheduling', category: 'Calendar & Scheduling', description: 'Appointment booking' },
  { id: 'chili-piper', name: 'Chili Piper', category: 'Calendar & Scheduling', description: 'Meeting scheduler' },
  { id: 'doodle', name: 'Doodle', category: 'Calendar & Scheduling', description: 'Poll scheduling' },

  // Forms & Surveys
  { id: 'typeform', name: 'Typeform', category: 'Forms & Surveys', description: 'Interactive forms' },
  { id: 'google-forms', name: 'Google Forms', category: 'Forms & Surveys', description: 'Survey tool' },
  { id: 'jotform', name: 'Jotform', category: 'Forms & Surveys', description: 'Form builder' },
  { id: 'surveymonkey', name: 'SurveyMonkey', category: 'Forms & Surveys', description: 'Survey platform' },
  { id: 'formstack', name: 'Formstack', category: 'Forms & Surveys', description: 'Form automation' },
  { id: 'cognito-forms', name: 'Cognito Forms', category: 'Forms & Surveys', description: 'Online forms' },
  { id: 'tally', name: 'Tally', category: 'Forms & Surveys', description: 'Simple forms' },

  // Databases
  { id: 'airtable', name: 'Airtable', category: 'Databases', description: 'Spreadsheet-database' },
  { id: 'google-sheets', name: 'Google Sheets', category: 'Databases', description: 'Online spreadsheets' },
  { id: 'excel', name: 'Microsoft Excel', category: 'Databases', description: 'Spreadsheet software' },
  { id: 'postgresql', name: 'PostgreSQL', category: 'Databases', description: 'Relational database' },
  { id: 'mysql', name: 'MySQL', category: 'Databases', description: 'Database system' },
  { id: 'mongodb', name: 'MongoDB', category: 'Databases', description: 'NoSQL database' },
  { id: 'redis', name: 'Redis', category: 'Databases', description: 'In-memory database' },
  { id: 'supabase', name: 'Supabase', category: 'Databases', description: 'Open source Firebase' },
  { id: 'firebase', name: 'Firebase', category: 'Databases', description: 'Google BaaS' },

  // Support
  { id: 'zendesk', name: 'Zendesk', category: 'Support', description: 'Customer service' },
  { id: 'freshdesk', name: 'Freshdesk', category: 'Support', description: 'Support software' },
  { id: 'help-scout', name: 'Help Scout', category: 'Support', description: 'Customer support' },
  { id: 'front', name: 'Front', category: 'Support', description: 'Team inbox' },
  { id: 'crisp', name: 'Crisp', category: 'Support', description: 'Customer messaging' },
  { id: 'tidio', name: 'Tidio', category: 'Support', description: 'Live chat' },
  { id: 'livechat', name: 'LiveChat', category: 'Support', description: 'Chat software' },

  // Video & Audio
  { id: 'zoom', name: 'Zoom', category: 'Video & Audio', description: 'Video conferencing' },
  { id: 'google-meet', name: 'Google Meet', category: 'Video & Audio', description: 'Video meetings' },
  { id: 'loom', name: 'Loom', category: 'Video & Audio', description: 'Video messaging' },
  { id: 'riverside', name: 'Riverside', category: 'Video & Audio', description: 'Podcast recording' },
  { id: 'spotify', name: 'Spotify', category: 'Video & Audio', description: 'Music streaming' },
  { id: 'soundcloud', name: 'SoundCloud', category: 'Video & Audio', description: 'Audio platform' },
  { id: 'vimeo', name: 'Vimeo', category: 'Video & Audio', description: 'Video platform' },

  // AI & Machine Learning
  { id: 'openai', name: 'OpenAI', category: 'AI & Machine Learning', description: 'GPT models' },
  { id: 'anthropic', name: 'Anthropic', category: 'AI & Machine Learning', description: 'Claude AI' },
  { id: 'cohere', name: 'Cohere', category: 'AI & Machine Learning', description: 'NLP platform' },
  { id: 'huggingface', name: 'Hugging Face', category: 'AI & Machine Learning', description: 'ML models' },
  { id: 'replicate', name: 'Replicate', category: 'AI & Machine Learning', description: 'ML deployment' },
  { id: 'stability-ai', name: 'Stability AI', category: 'AI & Machine Learning', description: 'Image generation' },
  { id: 'midjourney', name: 'Midjourney', category: 'AI & Machine Learning', description: 'AI art' },
  { id: 'elevenlabs', name: 'ElevenLabs', category: 'AI & Machine Learning', description: 'Voice AI' },
]

/**
 * Get integrations grouped by category
 */
export function getIntegrationsByCategory(): Record<string, Integration[]> {
  return integrations.reduce((acc, integration) => {
    if (!acc[integration.category]) {
      acc[integration.category] = []
    }
    acc[integration.category].push(integration)
    return acc
  }, {} as Record<string, Integration[]>)
}

/**
 * Search integrations by name
 */
export function searchIntegrations(query: string): Integration[] {
  const lowerQuery = query.toLowerCase()
  return integrations.filter(
    (integration) =>
      integration.name.toLowerCase().includes(lowerQuery) ||
      integration.description?.toLowerCase().includes(lowerQuery)
  )
}
