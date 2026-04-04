"use client"

import React from 'react'
import Image from 'next/image'

const integrations = [
  { name: 'Gmail', slug: 'gmail' },
  { name: 'Google Calendar', slug: 'google-calendar' },
  { name: 'Google Drive', slug: 'google-drive' },
  { name: 'Google Sheets', slug: 'google-sheets' },
  { name: 'Google Docs', slug: 'google-docs' },
  { name: 'Microsoft Teams', slug: 'teams' },
  { name: 'OneDrive', slug: 'onedrive' },
  { name: 'Outlook', slug: 'microsoft-outlook' },
  { name: 'Slack', slug: 'slack' },
  { name: 'Discord', slug: 'discord' },
  { name: 'GitHub', slug: 'github' },
  { name: 'Notion', slug: 'notion' },
  { name: 'Trello', slug: 'trello' },
  { name: 'HubSpot', slug: 'hubspot' },
  { name: 'Airtable', slug: 'airtable' },
  { name: 'Mailchimp', slug: 'mailchimp' },
  { name: 'Stripe', slug: 'stripe' },
  { name: 'Dropbox', slug: 'dropbox' },
  { name: 'X (Twitter)', slug: 'x' },
  { name: 'Facebook', slug: 'facebook' },
]

export function IntegrationsSection() {
  return (
    <section id="integrations" className="px-4 sm:px-6 lg:px-8 py-24" style={{ backgroundColor: '#fafafa' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 mb-3">
            Connects to your stack
          </h2>
          <p className="text-slate-500 text-base">
            35+ deep integrations — not shallow API wrappers
          </p>
        </div>

        {/* Integration grid */}
        <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-10 gap-3">
          {integrations.map((integration) => (
            <div
              key={integration.slug}
              className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors"
              title={integration.name}
            >
              <Image
                src={`/integrations/${integration.slug}.svg`}
                alt={integration.name}
                width={32}
                height={32}
                className="object-contain"
              />
            </div>
          ))}
        </div>

        {/* Footer text */}
        <p className="text-center text-sm text-slate-400 mt-8">
          And many more
        </p>
      </div>
    </section>
  )
}
