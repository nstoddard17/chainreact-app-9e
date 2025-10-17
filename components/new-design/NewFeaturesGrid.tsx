"use client"

import React from 'react'
import {
  Zap,
  Puzzle,
  Shield,
  Clock,
  GitBranch,
  Bell,
  BarChart,
  Users,
  Box,
  Code,
  Database,
  Globe
} from 'lucide-react'

const features = [
  {
    icon: Puzzle,
    title: 'Visual Workflow Builder',
    description: 'Design complex workflows with an intuitive drag-and-drop interface. No coding required.',
  },
  {
    icon: Zap,
    title: 'Instant Execution',
    description: 'Workflows trigger and execute in real-time with webhook support and sub-second latency.',
  },
  {
    icon: Code,
    title: 'Custom Code',
    description: 'Write JavaScript or Python when you need full control. Extend workflows with custom logic.',
  },
  {
    icon: Database,
    title: 'Data Transformation',
    description: 'Parse, filter, and transform data between apps. Built-in support for JSON, XML, CSV.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'SOC 2 compliant with AES-256 encryption. OAuth 2.0 for all integrations.',
  },
  {
    icon: Clock,
    title: 'Flexible Scheduling',
    description: 'Run workflows on cron schedules, intervals, or specific dates. Full timezone support.',
  },
  {
    icon: GitBranch,
    title: 'Conditional Logic',
    description: 'Build smart workflows with if/else branches, loops, and error handling.',
  },
  {
    icon: Bell,
    title: 'Smart Alerts',
    description: 'Get notified via email, Slack, or SMS when workflows succeed or fail.',
  },
  {
    icon: BarChart,
    title: 'Performance Analytics',
    description: 'Monitor execution times, success rates, and identify bottlenecks.',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description: 'Share workflows, manage permissions, and collaborate with your team.',
  },
  {
    icon: Box,
    title: 'Version Control',
    description: 'Track changes, rollback to previous versions, and maintain workflow history.',
  },
  {
    icon: Globe,
    title: '100+ Integrations',
    description: 'Connect to popular tools like Gmail, Slack, Shopify, Stripe, and more.',
  },
]

export function NewFeaturesGrid() {
  return (
    <section id="features" className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-24">
        {/* Header */}
        <div className="max-w-3xl mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-neutral-900 dark:text-white">
            Everything you need to automate
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-400">
            Enterprise-grade features built for reliability, scalability, and developer productivity.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
          {features.map((feature, index) => (
            <div key={index} className="flex gap-4">
              {/* Icon */}
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-md bg-blue-600 flex items-center justify-center">
                  {React.createElement(feature.icon, {
                    className: 'w-5 h-5 text-white',
                  })}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold mb-2 text-neutral-900 dark:text-white">
                  {feature.title}
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
