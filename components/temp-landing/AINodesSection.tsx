"use client"

import { GitBranch, MessageSquare, Bot, FileSearch, ArrowRight, ImageIcon } from 'lucide-react'

const nodes = [
  {
    icon: GitBranch,
    title: 'AI Router',
    description: 'Routes data based on meaning, not rigid rules. Handles edge cases that would break traditional if/then logic.',
    example: {
      input: '"Customer is frustrated about billing"',
      output: 'Routes to: #billing-urgent',
    },
    capabilities: ['Priority classification', 'Sentiment detection', 'Multi-path routing'],
    color: 'bg-blue-50 border-blue-200 text-blue-600',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
    screenshotHint: 'CAPTURE: Screenshot of the AI Router node config panel in /workflows/builder. Show the routing prompt field and the output paths (e.g. Urgent, Normal, Low priority) with connected downstream nodes.',
  },
  {
    icon: MessageSquare,
    title: 'AI Message',
    description: 'Generates personalized content using your data and brand voice. Every message reads like a human wrote it.',
    example: {
      input: 'Order #4821 shipped',
      output: '"Hi Sarah, your order is on the way!"',
    },
    capabilities: ['Brand voice matching', 'Dynamic personalization', 'Multi-language'],
    color: 'bg-purple-50 border-purple-200 text-purple-600',
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-500',
    screenshotHint: 'CAPTURE: Screenshot of the AI Message node config in /workflows/builder. Show the prompt/template field with variable references like {{trigger.customerName}} and a preview of the generated output.',
  },
  {
    icon: Bot,
    title: 'AI Agent',
    description: 'An autonomous agent that uses your other nodes as tools. Give it a goal, it figures out the steps.',
    example: {
      input: 'Goal: Resolve support ticket',
      output: 'Search docs → Draft reply → Route',
    },
    capabilities: ['Multi-step reasoning', 'Tool selection', 'Goal-oriented'],
    color: 'bg-orange-50 border-orange-200 text-orange-600',
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    screenshotHint: 'CAPTURE: Screenshot of the AI Agent node config in /workflows/builder. Show the goal field and the list of available tools/nodes the agent can use, with the agent\'s execution plan visible.',
  },
  {
    icon: FileSearch,
    title: 'AI Data',
    description: 'Summarizes, classifies, extracts, and translates. Turns unstructured content into structured actions.',
    example: {
      input: '3-page contract PDF',
      output: 'Key terms: renewal date, amount, parties',
    },
    capabilities: ['Text extraction', 'Classification', 'Summarization'],
    color: 'bg-green-50 border-green-200 text-green-600',
    iconBg: 'bg-green-50',
    iconColor: 'text-green-500',
    screenshotHint: 'CAPTURE: Screenshot of the AI Data Processing node config in /workflows/builder. Show the operation type selector (Summarize/Classify/Extract) and the input/output field mapping.',
  },
]

export function AINodesSection() {
  return (
    <section id="ai-nodes" className="bg-slate-950 px-4 sm:px-6 lg:px-8 py-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
            AI-native, not AI-bolted-on
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Four AI node types that understand your data, not just move it
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {nodes.map((node) => {
            const Icon = node.icon
            return (
              <div
                key={node.title}
                className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden transition-shadow duration-200 hover:shadow-md hover:shadow-slate-900/50 flex flex-col"
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-lg ${node.iconBg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${node.iconColor}`} />
                    </div>
                    <h3 className="text-base font-semibold text-white">
                      {node.title}
                    </h3>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-slate-400 leading-relaxed mb-4">
                    {node.description}
                  </p>

                  {/* Example */}
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2 mb-1.5">
                      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider flex-shrink-0 mt-0.5">In</span>
                      <span className="text-xs text-slate-400">{node.example.input}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-3 h-3 text-slate-600 mt-0.5 flex-shrink-0" />
                      <span className="text-xs font-medium text-slate-200">{node.example.output}</span>
                    </div>
                  </div>

                  {/* Capabilities */}
                  <div className="flex flex-wrap gap-1.5">
                    {node.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${node.color}`}
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Screenshot placeholder */}
                <div className="bg-slate-950 border-t border-slate-800 flex flex-col items-center justify-center gap-2 px-6 py-8 aspect-[5/4]">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4 text-slate-500" />
                  </div>
                  <p className="text-[11px] text-slate-500 text-center max-w-[260px] leading-relaxed">
                    {node.screenshotHint}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
