"use client"

import { GitBranch, MessageSquare, Bot, FileSearch } from 'lucide-react'

const nodes = [
  {
    icon: GitBranch,
    title: 'AI Router',
    description: 'Routes data based on meaning, not rigid rules',
  },
  {
    icon: MessageSquare,
    title: 'AI Message',
    description: 'Generates personalized emails, Slack messages, notifications',
  },
  {
    icon: Bot,
    title: 'AI Agent',
    description: 'Uses other workflow nodes as tools to accomplish goals',
  },
  {
    icon: FileSearch,
    title: 'AI Data',
    description: 'Summarizes, classifies, extracts, and translates content',
  },
]

export function AINodesSection() {
  return (
    <section id="ai-nodes" className="bg-white px-4 sm:px-6 lg:px-8 py-20">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-4">
            AI-native, not AI-bolted-on
          </h2>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            Four AI node types that understand your data, not just move it
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {nodes.map((node) => {
            const Icon = node.icon
            return (
              <div
                key={node.title}
                className="rounded-xl border border-slate-200 bg-white p-6 transition-shadow duration-200 hover:shadow-md"
              >
                <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-orange-500" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-1">
                  {node.title}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {node.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
