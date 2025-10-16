"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Link2, Sparkles } from 'lucide-react'

const integrations = [
  { name: 'Gmail', logo: '📧', color: 'from-red-400 to-red-500' },
  { name: 'Slack', logo: '💬', color: 'from-purple-400 to-purple-500' },
  { name: 'Discord', logo: '🎮', color: 'from-indigo-400 to-indigo-500' },
  { name: 'Notion', logo: '📝', color: 'from-gray-400 to-gray-500' },
  { name: 'Google Drive', logo: '📁', color: 'from-blue-400 to-blue-500' },
  { name: 'Trello', logo: '📋', color: 'from-blue-300 to-blue-400' },
  { name: 'Airtable', logo: '📊', color: 'from-yellow-400 to-yellow-500' },
  { name: 'Stripe', logo: '💳', color: 'from-purple-500 to-indigo-500' },
  { name: 'HubSpot', logo: '🎯', color: 'from-orange-400 to-orange-500' },
  { name: 'Shopify', logo: '🛍️', color: 'from-green-400 to-green-500' },
  { name: 'Twitter', logo: '🐦', color: 'from-sky-300 to-sky-400' },
  { name: 'LinkedIn', logo: '💼', color: 'from-blue-600 to-blue-700' },
  { name: 'Instagram', logo: '📷', color: 'from-pink-400 to-purple-400' },
  { name: 'Facebook', logo: '👥', color: 'from-blue-500 to-blue-600' },
  { name: 'Microsoft Teams', logo: '👨‍💼', color: 'from-indigo-500 to-purple-500' },
  { name: 'OneDrive', logo: '☁️', color: 'from-blue-400 to-sky-400' },
  { name: 'Outlook', logo: '📮', color: 'from-blue-500 to-cyan-500' },
  { name: 'Jira', logo: '🎫', color: 'from-blue-400 to-blue-500' },
  { name: 'GitHub', logo: '🐙', color: 'from-gray-600 to-gray-800' },
  { name: 'Zoom', logo: '📹', color: 'from-blue-400 to-blue-500' },
]

export function LightIntegrationsShowcase() {
  return (
    <section id="integrations" className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32 overflow-hidden bg-gradient-to-b from-white to-purple-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 border border-green-300 mb-6">
              <Link2 className="w-4 h-4 text-green-700" />
              <span className="text-sm font-bold text-green-800">Integrations</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              Connect All Your Tools
            </h2>
            <p className="text-lg text-gray-700 font-medium max-w-2xl mx-auto">
              Seamlessly integrate with 20+ popular apps and services. More added every month.
            </p>
          </motion.div>
        </div>

        {/* Scrolling Integration Cards */}
        <div className="relative">
          {/* Fade edges */}
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-white via-white/80 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-white via-white/80 to-transparent z-10 pointer-events-none" />

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
                  className="flex-shrink-0 w-48 h-24 bg-white rounded-xl border border-gray-200 shadow-md hover:shadow-lg flex items-center justify-center gap-3 hover:border-gray-300 transition-all"
                >
                  <div className={`text-3xl`}>{integration.logo}</div>
                  <span className="text-gray-700 font-medium text-sm">
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
                  className="flex-shrink-0 w-48 h-24 bg-white rounded-xl border border-gray-200 shadow-md hover:shadow-lg flex items-center justify-center gap-3 hover:border-gray-300 transition-all"
                >
                  <div className={`text-3xl`}>{integration.logo}</div>
                  <span className="text-gray-700 font-medium text-sm">
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
          <div className="inline-flex flex-col sm:flex-row items-center gap-6 p-6 rounded-2xl bg-gradient-to-r from-purple-100 to-pink-100 border border-purple-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 border border-purple-200 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-purple-600" />
              </div>
              <div className="text-left">
                <h3 className="text-gray-900 font-semibold">Custom Integration?</h3>
                <p className="text-gray-600 text-sm">Use our API or request a new integration</p>
              </div>
            </div>
            <button className="px-6 py-2 bg-white hover:bg-gray-50 rounded-lg text-gray-700 font-medium border border-gray-200 transition-colors">
              Learn More
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}