"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { GitBranch, MessageSquare, Bot, FileSearch } from 'lucide-react'

const nodes = [
  {
    icon: GitBranch,
    title: 'AI Router',
    description: 'Routes data down different paths based on AI understanding — not rigid if/then rules.',
    example: {
      label: 'Example routing:',
      items: ['Urgent → #support-critical', 'Billing → #finance', 'Feature request → Backlog'],
    },
  },
  {
    icon: MessageSquare,
    title: 'AI Message',
    description: 'Generates personalized emails, Slack messages, and notifications using your data.',
    example: {
      label: 'Output preview:',
      items: ['"Hi Sarah, your order #4821 has shipped..."', 'Auto-matches your brand voice'],
    },
  },
  {
    icon: Bot,
    title: 'AI Agent',
    description: 'Uses your other workflow nodes as tools. Give it a goal and it figures out the steps.',
    example: {
      label: 'Agent workflow:',
      items: ['Goal: Resolve support ticket', 'Tools: Search docs, Draft reply, Update CRM'],
    },
  },
  {
    icon: FileSearch,
    title: 'AI Data Processing',
    description: 'Summarize, classify, extract, or translate. Turn unstructured content into actions.',
    example: {
      label: 'Processing modes:',
      items: ['Summarize long emails', 'Extract invoice amounts', 'Classify sentiment'],
    },
  },
]

export function AINodesSection() {
  return (
    <section id="ai-nodes" className="relative px-4 sm:px-6 lg:px-8 py-16">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <h2 className="font-[var(--font-space-grotesk)] text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-3 text-center">
            AI that works inside your workflows
          </h2>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-lg mx-auto text-center">
            Four AI-powered nodes that make your automations intelligent.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {nodes.map((node, index) => {
            const Icon = node.icon
            return (
              <motion.div
                key={node.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.06 }}
                className="rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900/60 p-5 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-[var(--font-space-grotesk)] text-base font-semibold text-slate-900 dark:text-white mb-1">
                      {node.title}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                      {node.description}
                    </p>
                    {/* Inline example */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5 border border-slate-100 dark:border-slate-700/50">
                      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">{node.example.label}</span>
                      <div className="mt-1.5 space-y-1">
                        {node.example.items.map((item, i) => (
                          <div key={i} className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-8 italic">
          Plus: Human-in-the-Loop — when AI is unsure, it pauses and asks you. Your correction becomes permanent knowledge.
        </p>
      </div>
    </section>
  )
}
