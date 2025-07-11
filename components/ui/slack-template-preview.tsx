import React from "react"

interface SlackTemplatePreviewProps {
  template: string
  channelName: string
  visibility: string
}

const bannerMap: Record<string, string> = {
  "project-starter-kit": "/slack-banners/project-starter-kit.jpg",
  "help-requests-process": "/slack-banners/help-requests-process.jpg",
  "time-off-request-process": "/slack-banners/time-off-request-process.jpg",
  "employee-benefits-hub": "/slack-banners/employee-benefits-hub.jpg",
  "brand-guidelines-hub": "/slack-banners/brand-guidelines-hub.jpg",
  "bug-intake-and-triage": "/slack-banners/bug-intake-and-triage.jpg",
  "sales-enablement-hub": "/slack-banners/sales-enablement-hub.jpg",
  "marketing-campaign-starter-kit": "/slack-banners/marketing-campaign-starter-kit.jpg",
  "ask-an-expert": "/slack-banners/ask-an-expert.jpg",
  "event-prep-starter-kit": "/slack-banners/event-prep-starter-kit.jpg",
  "external-partner-starter-kit": "/slack-banners/external-partner-starter-kit.jpg",
  "customer-support": "/slack-banners/customer-support.jpg",
  "sales-deal-tracking": "/slack-banners/sales-deal-tracking.jpg",
  "one-on-one-coaching": "/slack-banners/one-on-one-coaching.jpg",
  "new-hire-onboarding": "/slack-banners/new-hire-onboarding.jpg",
  "feedback-intake": "/slack-banners/feedback-intake.jpg",
  "team-support": "/slack-banners/team-support.jpg",
}

const templateTitles: Record<string, string> = {
  "project-starter-kit": "Project Starter Kit",
  "help-requests-process": "Help Requests Process",
  "time-off-request-process": "Time Off Request Process",
  "employee-benefits-hub": "Employee Benefits Hub",
  "brand-guidelines-hub": "Brand Guidelines Hub",
  "bug-intake-and-triage": "Bug Intake And Triage",
  "sales-enablement-hub": "Sales Enablement Hub",
  "marketing-campaign-starter-kit": "Marketing Campaign Starter Kit",
  "ask-an-expert": "Ask An Expert",
  "event-prep-starter-kit": "Event Prep Starter Kit",
  "external-partner-starter-kit": "External Partner Starter Kit",
  "customer-support": "Customer Support",
  "sales-deal-tracking": "Sales Deal Tracking",
  "one-on-one-coaching": "One On One Coaching",
  "new-hire-onboarding": "New Hire Onboarding",
  "feedback-intake": "Feedback Intake",
  "team-support": "Team Support",
}

export default function SlackTemplatePreview({ template, channelName, visibility }: SlackTemplatePreviewProps) {
  const name = channelName || (template === "blank" ? "channel-name" : template.replace(/-/g, " "))
  const vis = visibility === "private" ? "Private" : "Public"
  const banner = bannerMap[template]
  const title = templateTitles[template] || (template ? template.replace(/-/g, " ") : "")

  if (banner) {
    return (
      <div className="rounded-2xl bg-[#22242a] border border-zinc-800 shadow-lg max-w-3xl mx-auto overflow-hidden">
        <img src={banner} alt={`${title} banner`} className="w-full h-56 object-cover" />
        <div className="px-12 pt-8 pb-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-green-500 font-semibold text-xs uppercase">{vis}</span>
            <span className="text-muted-foreground text-xs">Channel</span>
          </div>
          <div className="text-2xl font-bold text-white mb-2">#{name}</div>
          <div className="flex gap-6 border-b border-zinc-700 mb-4">
            <span className="pb-2 px-1 text-sm font-medium text-white border-b-2 border-indigo-400">{title}</span>
          </div>
        </div>
      </div>
    )
  }

  if (template === "blank") {
    return (
      <div className="rounded-2xl bg-[#22242a] border border-zinc-800 shadow-lg max-w-xl mx-auto overflow-hidden">
        <div className="px-8 pt-8 pb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-green-500 font-semibold text-xs uppercase">{vis}</span>
            <span className="text-muted-foreground text-xs">Channel</span>
          </div>
          <div className="text-2xl font-bold text-white mb-2">#{name}</div>
          <div className="text-base text-zinc-200 mb-4">Start with a blank channel and customize it for your team.</div>
        </div>
      </div>
    )
  }

  // Default preview if template not recognized
  return (
    <div className="rounded-2xl bg-[#22242a] border border-zinc-800 shadow-lg max-w-xl mx-auto overflow-hidden">
      <div className="px-8 pt-8 pb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-green-500 font-semibold text-xs uppercase">{vis}</span>
          <span className="text-muted-foreground text-xs">Channel</span>
        </div>
        <div className="text-2xl font-bold text-white mb-2">#{name}</div>
        <div className="text-base text-zinc-200 mb-4">Select a template to see a preview.</div>
      </div>
    </div>
  )
} 