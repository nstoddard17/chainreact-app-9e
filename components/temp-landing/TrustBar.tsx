"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'

const integrations = [
  { name: 'Gmail', logo: '/integrations/gmail.svg', providerId: 'gmail' },
  { name: 'Slack', logo: '/integrations/slack.svg', providerId: 'slack' },
  { name: 'Notion', logo: '/integrations/notion.svg', providerId: 'notion' },
  { name: 'HubSpot', logo: '/integrations/hubspot.svg', providerId: 'hubspot' },
  { name: 'Stripe', logo: '/integrations/stripe.svg', providerId: 'stripe' },
  { name: 'GitHub', logo: '/integrations/github.svg', providerId: 'github' },
  { name: 'Google Drive', logo: '/integrations/google-drive.svg', providerId: 'google-drive' },
  { name: 'Discord', logo: '/integrations/discord.svg', providerId: 'discord' },
  { name: 'Airtable', logo: '/integrations/airtable.svg', providerId: 'airtable' },
  { name: 'Microsoft Teams', logo: '/integrations/teams.svg', providerId: 'teams' },
  { name: 'Dropbox', logo: '/integrations/dropbox.svg', providerId: 'dropbox' },
  { name: 'Mailchimp', logo: '/integrations/mailchimp.svg', providerId: 'mailchimp' },
]

const whiteLogos = ['airtable', 'github', 'x']

export function TrustBar() {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? (resolvedTheme ?? theme) === 'dark' : false

  const getLogoStyle = (providerId: string) => {
    if (!mounted) return {}
    if (whiteLogos.includes(providerId)) {
      return { filter: isDark ? undefined : 'brightness(0) saturate(100%)' }
    }
    return {}
  }

  // Triple the list so the animation loops seamlessly — when it shifts -33.33%,
  // the third copy fills in from the right, creating an infinite cycle
  const tripled = [...integrations, ...integrations, ...integrations]

  return (
    <section className="relative py-10 border-t border-slate-100 dark:border-slate-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm font-medium text-slate-400 dark:text-slate-500 mb-8">
          Works with the tools you already use
        </p>
      </div>

      <div
        className="relative overflow-hidden"
        style={{
          maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
        }}
      >
        <motion.div
          className="flex gap-12 items-center"
          animate={{ x: '-33.33%' }}
          transition={{ x: { repeat: Infinity, duration: 40, ease: 'linear' } }}
        >
          {tripled.map((integration, index) => (
            <div
              key={`${integration.providerId}-${index}`}
              className="flex-shrink-0 flex items-center gap-2.5 opacity-50 hover:opacity-100 transition-opacity duration-300"
            >
              <img
                src={integration.logo}
                alt={integration.name}
                className="h-6 w-6 object-contain"
                style={getLogoStyle(integration.providerId)}
              />
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {integration.name}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
