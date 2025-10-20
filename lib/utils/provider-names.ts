export function getProviderDisplayName(provider: string): string {
  const displayNames: Record<string, string> = {
    google: "Google",
    gmail: "Gmail",
    'google-drive': "Google Drive",
    'google_drive': "Google Drive",
    'google-calendar': "Google Calendar",
    'google_calendar': "Google Calendar",
    'google-sheets': "Google Sheets",
    'google_sheets': "Google Sheets",
    'google-docs': "Google Docs",
    'google_docs': "Google Docs",
    teams: "Microsoft Teams",
    'microsoft-teams': "Microsoft Teams",
    onedrive: "OneDrive",
    'microsoft-outlook': "Microsoft Outlook",
    outlook: "Outlook",
    'microsoft-onenote': "Microsoft OneNote",
    onenote: "OneNote",
    'microsoft-excel': "Microsoft Excel",
    slack: "Slack",
    discord: "Discord",
    dropbox: "Dropbox",
    github: "GitHub",
    twitter: "X",
    x: "X",
    linkedin: "LinkedIn",
    facebook: "Facebook",
    instagram: "Instagram",
    tiktok: "TikTok",
    'youtube-studio': "YouTube Studio",
    youtube: "YouTube",
    paypal: "PayPal",
    stripe: "Stripe",
    shopify: "Shopify",
    trello: "Trello",
    notion: "Notion",
    docker: "Docker",
    gitlab: "GitLab",
    airtable: "Airtable",
    hubspot: "HubSpot",
    zoom: "Zoom",
    twilio: "Twilio",
    sendgrid: "SendGrid",
    mailchimp: "Mailchimp",
    box: "Box",
    blackbaud: "Blackbaud",
    beehiiv: "beehiiv",
    kit: "Kit",
    gumroad: "Gumroad",
    manychat: "ManyChat"
  }

  // Normalize the provider string (handle both hyphens and underscores)
  const normalizedProvider = provider.toLowerCase().replace(/_/g, '-')

  return displayNames[normalizedProvider] ||
    displayNames[provider.toLowerCase()] ||
    provider.charAt(0).toUpperCase() + provider.slice(1).replace(/[-_]/g, ' ')
}