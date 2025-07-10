import React from "react"

interface SlackTemplatePreviewProps {
  template: string
  channelName: string
  visibility: string
}

const bannerMap: Record<string, string> = {
  "project-starter-kit": "/slack-banners/project-starter-kit.jpg",
  "help-requests-process": "/slack-banners/help-requests-process.jpg",
  "team-support": "/slack-banners/team-support.jpg",
  "feedback-intake": "/slack-banners/feedback-intake.jpg",
  "new-hire-onboarding": "/slack-banners/new-hire-onboarding.jpg",
  "one-on-one-coaching": "/slack-banners/one-on-one-coaching.jpg",
  "sales-deal-tracking": "/slack-banners/sales-deal-tracking.jpg",
}

export default function SlackTemplatePreview({ template, channelName, visibility }: SlackTemplatePreviewProps) {
  const name = channelName || (template === "blank" ? "channel-name" : template.replace(/-/g, " "))
  const vis = visibility === "private" ? "Private" : "Public"

  switch (template) {
    case "project-starter-kit":
      return (
        <div className="rounded-2xl bg-[#22242a] border border-zinc-800 shadow-lg max-w-2xl mx-auto overflow-hidden">
          <img src={bannerMap[template]} alt="Project starter kit banner" className="w-full h-32 object-cover" />
          <div className="px-8 pt-6 pb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-500 font-semibold text-xs uppercase">{vis}</span>
              <span className="text-muted-foreground text-xs">Channel</span>
            </div>
            <div className="text-2xl font-bold text-white mb-2">#{name}</div>
            <div className="flex gap-6 border-b border-zinc-700 mb-4">
              {["Messages", "Project overview", "Project tracker", "Workflows"].map(tab => (
                <div key={tab} className={"pb-2 px-1 text-sm font-medium " + (tab === "Project overview" ? "text-white border-b-2 border-indigo-400" : "text-zinc-400")}>{tab}</div>
              ))}
            </div>
            <div className="text-xl font-bold text-white mb-2 flex items-center gap-2">📝 Project overview</div>
            <div className="text-base text-zinc-200 mb-4">This canvas includes everything you need to know about this project along with links to important resources and people.</div>
            <div className="mb-3">
              <div className="font-semibold text-white flex items-center gap-2">✍️ Project description</div>
              <div className="text-sm text-zinc-300 ml-1">Add a brief summary of your project.</div>
            </div>
            <div className="mb-3">
              <div className="font-semibold text-white flex items-center gap-2">🔗 Key resources</div>
              <div className="text-sm text-zinc-300 ml-1">Link to docs, files, and other important resources.</div>
            </div>
            <div className="mb-3">
              <div className="font-semibold text-white flex items-center gap-2">👥 Team members</div>
              <div className="text-sm text-zinc-300 ml-1">List the people involved in this project.</div>
            </div>
          </div>
        </div>
      )
    case "help-requests-process":
      return (
        <div className="rounded-2xl bg-[#22242a] border border-zinc-800 shadow-lg max-w-2xl mx-auto overflow-hidden">
          <img src={bannerMap[template]} alt="Help requests process banner" className="w-full h-32 object-cover" />
          <div className="px-8 pt-6 pb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-orange-500 font-semibold text-xs uppercase">{vis}</span>
              <span className="text-muted-foreground text-xs">Channel</span>
            </div>
            <div className="text-2xl font-bold text-white mb-2">#{name}</div>
            <div className="flex gap-6 border-b border-zinc-700 mb-4">
              {["Messages", "Help instructions", "Help requests tracker", "Workflows"].map(tab => (
                <div key={tab} className={"pb-2 px-1 text-sm font-medium " + (tab === "Help requests tracker" ? "text-white border-b-2 border-indigo-400" : "text-zinc-400")}>{tab}</div>
              ))}
            </div>
            <div className="text-xl font-bold text-white mb-4 flex items-center gap-2">🆘 Help request tracker</div>
            <div className="flex gap-4">
              <div className="bg-[#18191c] rounded-xl p-4 w-1/2">
                <div className="font-semibold text-white mb-1">New <span className="text-xs text-zinc-400">1 item</span></div>
                <div className="bg-[#23242a] rounded-lg p-3 mb-2">
                  <div className="font-bold text-white">Teleporter only works halfway</div>
                  <div className="flex gap-2 text-xs text-zinc-400 mb-1">
                    <span className="bg-red-700 text-white rounded px-2 py-0.5">High</span>
                    <span>Submitted by <span className="inline-block w-5 h-5 rounded-full bg-yellow-300 align-middle"></span></span>
                    <span>Date submitted <span className="inline-block align-middle"><span className="bg-zinc-700 text-white rounded px-2 py-0.5">1 year ago</span></span></span>
                  </div>
                  <div className="text-sm text-zinc-300">Person leaves ship but never arrives at destination</div>
                  <div className="text-xs text-zinc-400">Assignee <span className="inline-block w-5 h-5 rounded-full bg-pink-300 align-middle"></span></div>
                </div>
              </div>
              <div className="bg-[#1a1b22] rounded-xl p-4 w-1/2">
                <div className="font-semibold text-white mb-1">Not started <span className="text-xs text-zinc-400">1 item</span></div>
                <div className="bg-[#23242a] rounded-lg p-3 mb-2">
                  <div className="font-bold text-white">Deck 6 airlock randomly opens</div>
                  <div className="flex gap-2 text-xs text-zinc-400 mb-1">
                    <span className="bg-purple-700 text-white rounded px-2 py-0.5">Medium</span>
                    <span>Submitted by <span className="inline-block w-5 h-5 rounded-full bg-blue-300 align-middle"></span></span>
                    <span>Date submitted <span className="inline-block align-middle"><span className="bg-zinc-700 text-white rounded px-2 py-0.5">1 year ago</span></span></span>
                  </div>
                  <div className="text-sm text-zinc-300">Happens once a week, unsure how to reproduce.</div>
                  <div className="text-xs text-zinc-400">Assignee <span className="inline-block w-5 h-5 rounded-full bg-green-300 align-middle"></span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    case "team-support":
      return (
        <div className="rounded-2xl bg-[#22242a] border border-zinc-800 shadow-lg max-w-2xl mx-auto overflow-hidden">
          <img src={bannerMap[template]} alt="Team support banner" className="w-full h-32 object-cover" />
          <div className="px-8 pt-6 pb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-500 font-semibold text-xs uppercase">{vis}</span>
              <span className="text-muted-foreground text-xs">Channel</span>
            </div>
            <div className="text-2xl font-bold text-white mb-2">#{name}</div>
            <div className="flex gap-6 border-b border-zinc-700 mb-4">
              {["Messages", "Shared resources", "Team priorities", "Workflows"].map(tab => (
                <div key={tab} className={"pb-2 px-1 text-sm font-medium " + (tab === "Shared resources" ? "text-white border-b-2 border-indigo-400" : "text-zinc-400")}>{tab}</div>
              ))}
            </div>
            <div className="text-xl font-bold text-white mb-2 flex items-center gap-2">📚 Shared resources</div>
            <div className="text-base text-zinc-200 mb-4">Add a few words to describe the resources your team can find in this canvas.</div>
            <div className="mb-3">
              <div className="font-semibold text-white flex items-center gap-2">Canvases</div>
              <div className="text-sm text-zinc-300 ml-1">👋Hey everyone! When someone new joins the team, let’s use this canvas to make sure they have everything they need in their first few weeks on the job.</div>
            </div>
          </div>
        </div>
      )
    case "feedback-intake":
      return (
        <div className="rounded-2xl bg-[#22242a] border border-zinc-800 shadow-lg max-w-2xl mx-auto overflow-hidden">
          <img src={bannerMap[template]} alt="Feedback intake banner" className="w-full h-32 object-cover" />
          <div className="px-8 pt-6 pb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-500 font-semibold text-xs uppercase">{vis}</span>
              <span className="text-muted-foreground text-xs">Channel</span>
            </div>
            <div className="text-2xl font-bold text-white mb-2">#{name}</div>
            <div className="flex gap-6 border-b border-zinc-700 mb-4">
              {["Messages", "Feedback", "Triage", "Workflows"].map(tab => (
                <div key={tab} className={"pb-2 px-1 text-sm font-medium " + (tab === "Feedback" ? "text-white border-b-2 border-indigo-400" : "text-zinc-400")}>{tab}</div>
              ))}
            </div>
            <div className="text-xl font-bold text-white mb-2 flex items-center gap-2">📝 Feedback intake</div>
            <div className="text-base text-zinc-200 mb-4">Collect and triage feedback from your team or customers here.</div>
            <div className="mb-3">
              <div className="font-semibold text-white flex items-center gap-2">Feedback items</div>
              <div className="text-sm text-zinc-300 ml-1">Add, review, and prioritize feedback for your product or service.</div>
            </div>
          </div>
        </div>
      )
    case "new-hire-onboarding":
      return (
        <div className="rounded-2xl bg-[#22242a] border border-zinc-800 shadow-lg max-w-2xl mx-auto overflow-hidden">
          <img src={bannerMap[template]} alt="New hire onboarding banner" className="w-full h-32 object-cover" />
          <div className="px-8 pt-6 pb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-500 font-semibold text-xs uppercase">{vis}</span>
              <span className="text-muted-foreground text-xs">Channel</span>
            </div>
            <div className="text-2xl font-bold text-white mb-2">#{name}</div>
            <div className="flex gap-6 border-b border-zinc-700 mb-4">
              {["Messages", "Onboarding", "Resources", "Workflows"].map(tab => (
                <div key={tab} className={"pb-2 px-1 text-sm font-medium " + (tab === "Onboarding" ? "text-white border-b-2 border-indigo-400" : "text-zinc-400")}>{tab}</div>
              ))}
            </div>
            <div className="text-xl font-bold text-white mb-2 flex items-center gap-2">👋 New hire onboarding</div>
            <div className="text-base text-zinc-200 mb-4">Welcome new team members and help them get up to speed quickly.</div>
            <div className="mb-3">
              <div className="font-semibold text-white flex items-center gap-2">Checklist</div>
              <div className="text-sm text-zinc-300 ml-1">Share a checklist of tasks for new hires to complete in their first week.</div>
            </div>
          </div>
        </div>
      )
    case "one-on-one-coaching":
      return (
        <div className="rounded-2xl bg-[#22242a] border border-zinc-800 shadow-lg max-w-2xl mx-auto overflow-hidden">
          <img src={bannerMap[template]} alt="1-1 Coaching banner" className="w-full h-32 object-cover" />
          <div className="px-8 pt-6 pb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-500 font-semibold text-xs uppercase">{vis}</span>
              <span className="text-muted-foreground text-xs">Channel</span>
            </div>
            <div className="text-2xl font-bold text-white mb-2">#{name}</div>
            <div className="flex gap-6 border-b border-zinc-700 mb-4">
              {["Messages", "Coaching", "Goals", "Workflows"].map(tab => (
                <div key={tab} className={"pb-2 px-1 text-sm font-medium " + (tab === "Coaching" ? "text-white border-b-2 border-indigo-400" : "text-zinc-400")}>{tab}</div>
              ))}
            </div>
            <div className="text-xl font-bold text-white mb-2 flex items-center gap-2">🎯 1-1 Coaching</div>
            <div className="text-base text-zinc-200 mb-4">Track coaching sessions, goals, and progress for team members.</div>
            <div className="mb-3">
              <div className="font-semibold text-white flex items-center gap-2">Session notes</div>
              <div className="text-sm text-zinc-300 ml-1">Document key takeaways and action items from each session.</div>
            </div>
          </div>
        </div>
      )
    case "sales-deal-tracking":
      return (
        <div className="rounded-2xl bg-[#22242a] border border-zinc-800 shadow-lg max-w-2xl mx-auto overflow-hidden">
          <img src={bannerMap[template]} alt="Sales deal tracking banner" className="w-full h-32 object-cover" />
          <div className="px-8 pt-6 pb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-500 font-semibold text-xs uppercase">{vis}</span>
              <span className="text-muted-foreground text-xs">Channel</span>
            </div>
            <div className="text-2xl font-bold text-white mb-2">#{name}</div>
            <div className="flex gap-6 border-b border-zinc-700 mb-4">
              {["Messages", "Deals", "Pipeline", "Workflows"].map(tab => (
                <div key={tab} className={"pb-2 px-1 text-sm font-medium " + (tab === "Deals" ? "text-white border-b-2 border-indigo-400" : "text-zinc-400")}>{tab}</div>
              ))}
            </div>
            <div className="text-xl font-bold text-white mb-2 flex items-center gap-2">💼 Sales deal tracking</div>
            <div className="text-base text-zinc-200 mb-4">Track sales opportunities, deals, and progress through your pipeline.</div>
            <div className="mb-3">
              <div className="font-semibold text-white flex items-center gap-2">Deals</div>
              <div className="text-sm text-zinc-300 ml-1">Add, update, and monitor deals as they move through stages.</div>
            </div>
          </div>
        </div>
      )
    case "blank":
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
    default:
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
} 