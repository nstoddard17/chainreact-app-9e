import { TempLanding } from '@/components/temp-landing/TempLanding'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ChainReact - AI Workflow Automation That Learns',
  description: 'Describe your workflow in plain English. AI builds it in real time, fills every field, and connects your tools. Fix a mistake once - it never happens again.',
  openGraph: {
    type: 'website',
    url: 'https://chainreact.app',
    siteName: 'ChainReact',
    title: 'ChainReact - AI Workflow Automation That Learns',
    description: 'Describe your workflow in plain English. AI builds it in real time. Fix a mistake once - it never happens again.',
    images: [
      {
        url: 'https://chainreact.app/opengraph-image.png?v=2',
        width: 1200,
        height: 630,
        alt: 'ChainReact - AI-Powered Workflow Automation Platform',
      },
    ],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChainReact - AI Workflow Automation That Learns',
    description: 'Describe your workflow in plain English. AI builds it in real time. 35+ integrations, AI-powered nodes, and self-improving workflows.',
    creator: '@ChainReact_App',
    images: ['/api/og/twitter'],
  },
}

export default function HomePage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'ChainReact',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    description: 'Describe your workflow in plain English. AI builds it in real time, fills every field, and connects your tools.',
    url: 'https://chainreact.app',
    featureList: [
      'AI workflow builder from natural language',
      'Self-improving workflows',
      '35+ deep integrations',
      'Visual workflow builder with 247+ nodes',
      'Human-in-the-loop approvals',
      'Real-time execution monitoring',
    ],
    author: {
      '@type': 'Organization',
      name: 'ChainReact',
      url: 'https://chainreact.app',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <TempLanding />
    </>
  )
}
