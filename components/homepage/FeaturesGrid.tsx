"use client"

import React from 'react'
import { motion } from 'framer-motion'
import {
  Zap,
  Puzzle,
  Brain,
  Shield,
  Clock,
  Users,
  Sparkles,
  GitBranch,
  Bell,
  BarChart,
  Lock,
  Rocket
} from 'lucide-react'

const features = [
  {
    icon: Puzzle,
    title: 'Drag & Drop Builder',
    description: 'Build complex workflows visually with our intuitive node-based editor. No coding required.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Brain,
    title: 'AI-Powered Actions',
    description: 'Leverage AI to generate content, analyze data, and make intelligent decisions in your workflows.',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Zap,
    title: 'Real-Time Execution',
    description: 'Workflows trigger instantly and run in milliseconds, keeping your business moving fast.',
    color: 'from-yellow-500 to-orange-500',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Bank-level encryption, OAuth 2.0 authentication, and SOC 2 compliance keep your data safe.',
    color: 'from-green-500 to-emerald-500',
  },
  {
    icon: Clock,
    title: 'Smart Scheduling',
    description: 'Set workflows to run on schedules, at specific times, or based on custom conditions.',
    color: 'from-indigo-500 to-purple-500',
  },
  {
    icon: GitBranch,
    title: 'Conditional Logic',
    description: 'Create branching workflows with if/then conditions, loops, and error handling.',
    color: 'from-pink-500 to-rose-500',
  },
  {
    icon: Bell,
    title: 'Smart Notifications',
    description: 'Get alerts when workflows complete, fail, or need attention across all your channels.',
    color: 'from-cyan-500 to-blue-500',
  },
  {
    icon: BarChart,
    title: 'Analytics Dashboard',
    description: 'Track performance, identify bottlenecks, and optimize your workflows with detailed insights.',
    color: 'from-orange-500 to-red-500',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description: 'Share workflows, set permissions, and collaborate with your team in real-time.',
    color: 'from-teal-500 to-green-500',
  },
]

export function FeaturesGrid() {
  return (
    <section id="features" className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 mb-6">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">Features</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Everything You Need to Automate
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Powerful features that make automation simple, reliable, and scalable for teams of any size
            </p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              className="group relative"
            >
              <div className="h-full bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-white/10 p-6 hover:border-gray-300 dark:hover:border-white/20 transition-all duration-300 hover:shadow-xl dark:hover:shadow-2xl dark:hover:shadow-purple-500/10">
                {/* Icon */}
                <div className="mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} p-2.5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    {React.createElement(feature.icon, {
                      className: 'w-full h-full text-white',
                    })}
                  </div>
                </div>

                {/* Content */}
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                  {feature.description}
                </p>

                {/* Hover Effect Gradient */}
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300 pointer-events-none`} />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center mt-12"
        >
          <p className="text-gray-600 dark:text-gray-400">
            And that's just the beginning. New features are added every week.
          </p>
        </motion.div>
      </div>
    </section>
  )
}