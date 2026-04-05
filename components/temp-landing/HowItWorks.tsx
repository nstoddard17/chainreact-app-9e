"use client"

import { ImageIcon } from 'lucide-react'

const steps = [
  {
    number: '01',
    title: 'Describe what you need',
    description: 'Type what you want in plain English. No flowcharts, no configuration menus, no learning curve.',
    example: '"When I get a support email, classify the priority, search our docs for a solution, draft a reply, and route it for approval."',
    detail: 'Works with any integration. AI understands context, not just keywords.',
    screenshotHint: 'CAPTURE: Screenshot of the AI chat panel in /workflows/builder. Show the chat with a typed prompt before or just after sending. Include the empty or partially-built canvas in the background.',
  },
  {
    number: '02',
    title: 'Watch AI build it live',
    description: 'AI creates every node, fills in every field, and connects your tools on a visual canvas - in seconds.',
    example: null,
    detail: 'Nodes appear one by one. Fields auto-populate. Connections form automatically.',
    screenshotHint: 'CAPTURE: Screenshot or GIF of /workflows/builder mid-generation. Show 4-5 nodes already placed on canvas with connections between them and fields filled in. The chat panel should show the AI\'s "Building your workflow..." message.',
  },
  {
    number: '03',
    title: 'Refine and run',
    description: 'Tweak anything by just talking to it. Then hit activate. Your workflow runs 24/7.',
    example: '"Actually, route urgent tickets to #critical instead of #support"',
    detail: 'AI updates the workflow instantly. No rebuilding from scratch.',
    screenshotHint: 'CAPTURE: Screenshot of /workflows/builder showing a follow-up chat message (e.g. "Route urgent tickets to #critical") with the AI confirming the change. The canvas should show the completed workflow with the updated node.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-slate-900 px-4 sm:px-6 lg:px-8 py-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
            How it works
          </h2>
          <p className="text-lg text-slate-400 max-w-xl mx-auto">
            From idea to running workflow in 60 seconds
          </p>
        </div>

        <div className="space-y-6">
          {steps.map((step) => (
            <div
              key={step.number}
              className="grid lg:grid-cols-2 gap-8 items-start bg-slate-950 rounded-xl border border-slate-800 p-6 sm:p-8"
            >
              {/* Left: Text content */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-4xl font-bold bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent leading-none">
                    {step.number}
                  </span>
                  <h3 className="text-xl font-semibold text-white">
                    {step.title}
                  </h3>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed mb-4">
                  {step.description}
                </p>
                {step.example && (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 mb-4">
                    <p className="text-xs text-slate-400 italic leading-relaxed">
                      {step.example}
                    </p>
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  {step.detail}
                </p>
              </div>

              {/* Right: Screenshot placeholder */}
              <div className="rounded-lg border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-900/50 flex flex-col items-center justify-center gap-3 p-8 aspect-[4/3]">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-slate-500" />
                </div>
                <p className="text-xs text-slate-500 text-center max-w-[280px] leading-relaxed">
                  {step.screenshotHint}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
