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
    color: 'from-blue-400 to-cyan-400',
  },
  {
    icon: Brain,
    title: 'AI-Powered Actions',
    description: 'Leverage AI to generate content, analyze data, and make intelligent decisions in your workflows.',
    color: 'from-purple-400 to-pink-400',
  },
  {
    icon: Zap,
    title: 'Real-Time Execution',
    description: 'Workflows trigger instantly and run in milliseconds, keeping your business moving fast.',
    color: 'from-yellow-400 to-orange-400',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Bank-level encryption, OAuth 2.0 authentication, and SOC 2 compliance keep your data safe.',
    color: 'from-green-400 to-emerald-400',
  },
  {
    icon: Clock,
    title: 'Smart Scheduling',
    description: 'Set workflows to run on schedules, at specific times, or based on custom conditions.',
    color: 'from-indigo-400 to-purple-400',
  },
  {
    icon: GitBranch,
    title: 'Conditional Logic',
    description: 'Create branching workflows with if/then conditions, loops, and error handling.',
    color: 'from-pink-400 to-rose-400',
  },
  {
    icon: Bell,
    title: 'Smart Notifications',
    description: 'Get alerts when workflows complete, fail, or need attention across all your channels.',
    color: 'from-cyan-400 to-blue-400',
  },
  {
    icon: BarChart,
    title: 'Analytics Dashboard',
    description: 'Track performance, identify bottlenecks, and optimize your workflows with detailed insights.',
    color: 'from-orange-400 to-red-400',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description: 'Share workflows, set permissions, and collaborate with your team in real-time.',
    color: 'from-teal-400 to-green-400',
  },
]

export function LightFeaturesGrid() {
  return (
    <section id="features" className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 border border-purple-300 mb-6">
              <Sparkles className="w-4 h-4 text-purple-700" />
              <span className="text-sm font-bold text-purple-800">Features</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              Everything You Need to Automate
            </h2>
            <p className="text-lg text-gray-700 font-medium max-w-2xl mx-auto">
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
              <div className="h-full bg-white rounded-2xl border border-gray-200 p-6 hover:border-gray-300 hover:shadow-xl transition-all duration-300">
                {/* Icon */}
                <div className="mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 p-2.5 group-hover:scale-110 group-hover:border-blue-300 group-hover:from-blue-50 group-hover:to-blue-100 transition-all duration-300">
                    <div className={`w-full h-full rounded-lg bg-gradient-to-br ${feature.color} p-1.5 flex items-center justify-center`}>
                      {React.createElement(feature.icon, {
                        className: 'w-full h-full text-white',
                      })}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
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
          <p className="text-gray-600 mb-6">
            And that's just the beginning. New features are added every week.
          </p>
          <a
            href="#workflow-demo"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            <Rocket className="w-5 h-5" />
            See it in action
          </a>
        </motion.div>
      </div>
    </section>
  )
}