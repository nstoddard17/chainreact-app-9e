"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'

const integrations = [
  { name: 'Gmail', logo: '/integrations/gmail.svg', providerId: 'gmail' },
  { name: 'Google Calendar', logo: '/integrations/google-calendar.svg', providerId: 'google-calendar' },
  { name: 'Google Drive', logo: '/integrations/google-drive.svg', providerId: 'google-drive' },
  { name: 'Google Sheets', logo: '/integrations/google-sheets.svg', providerId: 'google-sheets' },
  { name: 'Google Docs', logo: '/integrations/google-docs.svg', providerId: 'google-docs' },
  { name: 'Microsoft Teams', logo: '/integrations/teams.svg', providerId: 'teams' },
  { name: 'OneDrive', logo: '/integrations/onedrive.svg', providerId: 'onedrive' },
  { name: 'Outlook', logo: '/integrations/microsoft-outlook.svg', providerId: 'microsoft-outlook' },
  { name: 'Slack', logo: '/integrations/slack.svg', providerId: 'slack' },
  { name: 'Discord', logo: '/integrations/discord.svg', providerId: 'discord' },
  { name: 'GitHub', logo: '/integrations/github.svg', providerId: 'github' },
  { name: 'Notion', logo: '/integrations/notion.svg', providerId: 'notion' },
  { name: 'Trello', logo: '/integrations/trello.svg', providerId: 'trello' },
  { name: 'HubSpot', logo: '/integrations/hubspot.svg', providerId: 'hubspot' },
  { name: 'Airtable', logo: '/integrations/airtable.svg', providerId: 'airtable' },
  { name: 'Mailchimp', logo: '/integrations/mailchimp.svg', providerId: 'mailchimp' },
  { name: 'Stripe', logo: '/integrations/stripe.svg', providerId: 'stripe' },
  { name: 'Dropbox', logo: '/integrations/dropbox.svg', providerId: 'dropbox' },
  { name: 'X (Twitter)', logo: '/integrations/x.svg', providerId: 'x' },
  { name: 'Facebook', logo: '/integrations/facebook.svg', providerId: 'facebook' },
]

const whiteLogos = ['airtable', 'github', 'x']

const row1 = integrations.slice(0, 10)
const row2 = integrations.slice(10)

export function IntegrationsSection() {
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

  return (
    <section id="integrations" className="relative px-4 sm:px-6 lg:px-8 py-24 overflow-hidden border-t border-slate-100 dark:border-slate-800/50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-6xl md:text-7xl font-bold bg-gradient-to-r from-orange-500 to-rose-500 bg-clip-text text-transparent mb-4">
              20+
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-3">
              Deep integrations
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
              Not just surface-level connections. Full read, write, and trigger support.
            </p>
          </motion.div>
        </div>

        {/* Marquee rows */}
        <div
          className="relative"
          style={{
            maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
          }}
        >
          {/* Row 1 */}
          <div className="mb-4 overflow-hidden">
            <motion.div
              animate={{ x: '-33.33%' }}
              transition={{ x: { repeat: Infinity, duration: 50, ease: 'linear' } }}
              className="flex gap-4"
            >
              {[...row1, ...row1, ...row1].map((integration, index) => (
                <div
                  key={`r1-${index}`}
                  className="flex-shrink-0 w-44 h-20 bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-700/40 flex items-center justify-center gap-3 hover:scale-[1.03] transition-transform duration-200 cursor-default shadow-sm shadow-slate-900/[0.03]"
                >
                  <img
                    src={integration.logo}
                    alt={integration.name}
                    className="w-7 h-7 object-contain"
                    style={getLogoStyle(integration.providerId)}
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {integration.name}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Row 2 */}
          <div className="overflow-hidden">
            <motion.div
              initial={{ x: '-33.33%' }}
              animate={{ x: '0%' }}
              transition={{ x: { repeat: Infinity, duration: 55, ease: 'linear' } }}
              className="flex gap-4"
            >
              {[...row2, ...row2, ...row2].map((integration, index) => (
                <div
                  key={`r2-${index}`}
                  className="flex-shrink-0 w-44 h-20 bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-700/40 flex items-center justify-center gap-3 hover:scale-[1.03] transition-transform duration-200 cursor-default shadow-sm shadow-slate-900/[0.03]"
                >
                  <img
                    src={integration.logo}
                    alt={integration.name}
                    className="w-7 h-7 object-contain"
                    style={getLogoStyle(integration.providerId)}
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {integration.name}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}
