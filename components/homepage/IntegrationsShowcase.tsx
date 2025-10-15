"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Link2, Sparkles } from 'lucide-react'

const integrations = [
  { name: 'Gmail', logo: '📧', color: 'from-red-500 to-red-600' },
  { name: 'Slack', logo: '💬', color: 'from-purple-500 to-purple-600' },
  { name: 'Discord', logo: '🎮', color: 'from-indigo-500 to-indigo-600' },
  { name: 'Notion', logo: '📝', color: 'from-gray-600 to-gray-700' },
  { name: 'Google Drive', logo: '📁', color: 'from-blue-500 to-blue-600' },
  { name: 'Trello', logo: '📋', color: 'from-blue-400 to-blue-500' },
  { name: 'Airtable', logo: '📊', color: 'from-yellow-500 to-yellow-600' },
  { name: 'Stripe', logo: '💳', color: 'from-purple-600 to-indigo-600' },
  { name: 'HubSpot', logo: '🎯', color: 'from-orange-500 to-orange-600' },
  { name: 'Shopify', logo: '🛍️', color: 'from-green-500 to-green-600' },
  { name: 'Twitter', logo: '🐦', color: 'from-sky-400 to-sky-500' },
  { name: 'LinkedIn', logo: '💼', color: 'from-blue-700 to-blue-800' },
  { name: 'Instagram', logo: '📷', color: 'from-pink-500 to-purple-500' },
  { name: 'Facebook', logo: '👥', color: 'from-blue-600 to-blue-700' },
  { name: 'Microsoft Teams', logo: '👨‍💼', color: 'from-indigo-600 to-purple-600' },
  { name: 'OneDrive', logo: '☁️', color: 'from-blue-500 to-sky-500' },
  { name: 'Outlook', logo: '📮', color: 'from-blue-600 to-cyan-600' },
  { name: 'Jira', logo: '🎫', color: 'from-blue-500 to-blue-600' },
  { name: 'GitHub', logo: '🐙', color: 'from-gray-700 to-gray-900' },
  { name: 'Zoom', logo: '📹', color: 'from-blue-500 to-blue-600' },
]

export function IntegrationsShowcase() {
  return (
    <section id="integrations" className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
              <Link2 className="w-4 h-4 text-green-400" />
              <span className="text-sm font-semibold text-green-300">Integrations</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
              Connect All Your Tools
            </h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto">
              Seamlessly integrate with 20+ popular apps and services. More added every month.
            </p>
          </motion.div>
        </div>

        {/* Scrolling Integration Cards */}
        <div className="relative">
          {/* Fade edges */}
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-slate-950 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-slate-950 to-transparent z-10 pointer-events-none" />

          {/* First Row - Scrolling Right */}
          <div className="mb-8 overflow-hidden">
            <motion.div
              animate={{ x: ['0%', '-50%'] }}
              transition={{
                x: {
                  repeat: Infinity,
                  repeatType: 'loop',
                  duration: 30,
                  ease: 'linear',
                },
              }}
              className="flex gap-4"
            >
              {[...integrations, ...integrations].map((integration, index) => (
                <div
                  key={`row1-${index}`}
                  className="flex-shrink-0 w-48 h-24 bg-slate-900/50 backdrop-blur-xl rounded-xl border border-white/10 flex items-center justify-center gap-3 hover:border-white/20 transition-colors"
                >
                  <div className={`text-3xl`}>{integration.logo}</div>
                  <span className="text-white/80 font-medium text-sm">
                    {integration.name}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Second Row - Scrolling Left */}
          <div className="overflow-hidden">
            <motion.div
              animate={{ x: ['-50%', '0%'] }}
              transition={{
                x: {
                  repeat: Infinity,
                  repeatType: 'loop',
                  duration: 35,
                  ease: 'linear',
                },
              }}
              className="flex gap-4"
            >
              {[...integrations.slice(10), ...integrations.slice(0, 10), ...integrations.slice(10), ...integrations.slice(0, 10)].map((integration, index) => (
                <div
                  key={`row2-${index}`}
                  className="flex-shrink-0 w-48 h-24 bg-slate-900/50 backdrop-blur-xl rounded-xl border border-white/10 flex items-center justify-center gap-3 hover:border-white/20 transition-colors"
                >
                  <div className={`text-3xl`}>{integration.logo}</div>
                  <span className="text-white/80 font-medium text-sm">
                    {integration.name}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* API Integration CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-16 text-center"
        >
          <div className="inline-flex flex-col sm:flex-row items-center gap-6 p-6 rounded-2xl bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/20">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-white font-semibold">Custom Integration?</h3>
                <p className="text-white/60 text-sm">Use our API or request a new integration</p>
              </div>
            </div>
            <button className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition-colors">
              Learn More
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}