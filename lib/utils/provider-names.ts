export function getProviderDisplayName(provider: string): string {
  const displayNames: Record<string, string> = {
    google: "Google",
    gmail: "Gmail",
    google_drive: "Google Drive",
    teams: "Microsoft Teams",
    onedrive: "OneDrive",
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
    paypal: "PayPal",
    stripe: "Stripe",
    shopify: "Shopify",
    trello: "Trello",
    notion: "Notion",
    youtube: "YouTube",
    docker: "Docker",
    gitlab: "GitLab",
    airtable: "Airtable",
    hubspot: "HubSpot",
    zoom: "Zoom",
    twilio: "Twilio",
    sendgrid: "SendGrid",
    mailchimp: "Mailchimp"
  }
  
  return displayNames[provider.toLowerCase()] || 
    provider.charAt(0).toUpperCase() + provider.slice(1).replace(/_/g, ' ')
}