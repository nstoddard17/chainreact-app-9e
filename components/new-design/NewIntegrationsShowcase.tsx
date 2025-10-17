"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Link2, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useTheme } from 'next-themes'

// Only show integrations that are actually available on the integrations page
const integrations = [
  // Google Services
  { name: 'Gmail', providerId: 'gmail', logo: '/integrations/gmail.svg' },
  { name: 'Google Calendar', providerId: 'google-calendar', logo: '/integrations/google-calendar.svg' },
  { name: 'Google Drive', providerId: 'google-drive', logo: '/integrations/google-drive.svg' },
  { name: 'Google Sheets', providerId: 'google-sheets', logo: '/integrations/google-sheets.svg' },
  { name: 'Google Docs', providerId: 'google-docs', logo: '/integrations/google-docs.svg' },

  // Microsoft Services
  { name: 'Microsoft Teams', providerId: 'teams', logo: '/integrations/teams.svg' },
  { name: 'OneDrive', providerId: 'onedrive', logo: '/integrations/onedrive.svg' },
  { name: 'Outlook', providerId: 'microsoft-outlook', logo: '/integrations/microsoft-outlook.svg' },
  { name: 'OneNote', providerId: 'microsoft-onenote', logo: '/integrations/microsoft-onenote.svg' },

  // Communication
  { name: 'Slack', providerId: 'slack', logo: '/integrations/slack.svg' },
  { name: 'Discord', providerId: 'discord', logo: '/integrations/discord.svg' },

  // Social Media
  { name: 'X (Twitter)', providerId: 'x', logo: '/integrations/x.svg' },
  { name: 'Facebook', providerId: 'facebook', logo: '/integrations/facebook.svg' },

  // Productivity & Development
  { name: 'GitHub', providerId: 'github', logo: '/integrations/github.svg' },
  { name: 'Notion', providerId: 'notion', logo: '/integrations/notion.svg' },
  { name: 'Trello', providerId: 'trello', logo: '/integrations/trello.svg' },

  // Business & CRM
  { name: 'HubSpot', providerId: 'hubspot', logo: '/integrations/hubspot.svg' },
  { name: 'Airtable', providerId: 'airtable', logo: '/integrations/airtable.svg' },
  { name: 'Mailchimp', providerId: 'mailchimp', logo: '/integrations/mailchimp.svg' },

  // E-commerce & Payments
  { name: 'Stripe', providerId: 'stripe', logo: '/integrations/stripe.svg' },

  // Storage
  { name: 'Dropbox', providerId: 'dropbox', logo: '/integrations/dropbox.svg' },
]

export function NewIntegrationsShowcase() {
  const { theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const needsInvert = (providerId: string) => {
    // Only invert truly monochrome white logos
    const whiteLogs = ['airtable', 'github', 'x']
    return whiteLogs.includes(providerId)
  }

  const getLogoStyle = (providerId: string) => {
    if (!mounted) return {}

    if (needsInvert(providerId)) {
      // In light mode, make white logos black
      // In dark mode, keep them white
      return {
        filter: theme === 'dark' ? undefined : 'brightness(0) saturate(100%)'
      }
    }
    return {}
  }

  return (
    <section id="integrations" className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-24">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 mb-6">
              <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Integrations</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900 dark:text-white mb-4">
              Connect All Your Tools
            </h2>
            <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
              Seamlessly integrate with 20+ popular apps and services. More added every month.
            </p>
          </motion.div>
        </div>

        {/* Scrolling Integration Cards */}
        <div className="relative"
             style={{
               maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
               WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)'
             }}>

          {/* First Row - Scrolling Right */}
          <div className="mb-8 overflow-hidden">
            <motion.div
              initial={{ x: 0 }}
              animate={{ x: "-33.33%" }}
              transition={{
                x: {
                  repeat: Infinity,
                  duration: 60,
                  ease: 'linear',
                },
              }}
              className="flex gap-4"
            >
              {[...integrations, ...integrations, ...integrations].map((integration, index) => (
                <div
                  key={`row1-${index}`}
                  className="flex-shrink-0 w-48 h-24 bg-white dark:bg-slate-900/50 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-center gap-3 hover:bg-white dark:hover:bg-slate-900/70 hover:border-neutral-300 dark:hover:border-neutral-700 transition-all"
                >
                  <img
                    src={integration.logo}
                    alt={`${integration.name} logo`}
                    className="w-8 h-8 object-contain"
                    style={getLogoStyle(integration.providerId)}
                  />
                  <span className="text-neutral-900 dark:text-white font-medium text-sm">
                    {integration.name}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Second Row - Scrolling Left */}
          <div className="overflow-hidden">
            <motion.div
              initial={{ x: "-33.33%" }}
              animate={{ x: 0 }}
              transition={{
                x: {
                  repeat: Infinity,
                  duration: 65,
                  ease: 'linear',
                },
              }}
              className="flex gap-4"
            >
              {[...integrations.slice(10), ...integrations.slice(0, 10), ...integrations.slice(10), ...integrations.slice(0, 10), ...integrations.slice(10)].map((integration, index) => (
                <div
                  key={`row2-${index}`}
                  className="flex-shrink-0 w-48 h-24 bg-white dark:bg-slate-900/50 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-center gap-3 hover:bg-white dark:hover:bg-slate-900/70 hover:border-neutral-300 dark:hover:border-neutral-700 transition-all"
                >
                  <img
                    src={integration.logo}
                    alt={`${integration.name} logo`}
                    className="w-8 h-8 object-contain"
                    style={getLogoStyle(integration.providerId)}
                  />
                  <span className="text-neutral-900 dark:text-white font-medium text-sm">
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
          <div className="inline-flex flex-col sm:flex-row items-center gap-6 p-6 rounded-2xl bg-blue-100 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-neutral-900 dark:text-white font-semibold">Custom Integration?</h3>
                <p className="text-neutral-600 dark:text-neutral-400 text-sm">Use our API or request a new integration</p>
              </div>
            </div>
            {/* Learn More button - links to API documentation page */}
            <Link
              href="/api-docs"
              className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
            >
              Learn More
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
