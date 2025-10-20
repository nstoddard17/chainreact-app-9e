import { NewHomepage } from '@/components/homepage-new/NewHomepage'
import type { Metadata } from 'next'

// Force dynamic to prevent build-time rendering issues
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ChainReact - Workflow Automation That Learns Your Business',
  description: 'Build intelligent workflows with AI that remembers your context, reads your documents, and makes smart decisions—all without writing code.',
  openGraph: {
    type: 'website',
    url: 'https://chainreact.app',
    siteName: 'ChainReact',
    title: 'ChainReact – Automate Your Workflows 10x Faster with AI',
    description: 'The visual automation platform that connects your favorite apps, runs intelligent workflows, and keeps your team in complete control. From simple tasks to complex AI-driven processes.',
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
    title: 'ChainReact – Automate Your Workflows 10x Faster with AI',
    description: 'Build intelligent workflows that connect your apps, automate busywork, and scale with your team. 20+ integrations, AI-powered actions, and real-time monitoring.',
    creator: '@ChainReact_App',
    images: ['/api/og/twitter'],
  },
}

export default function HomePage() {
  // Structured data for SEO (JSON-LD)
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
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '100',
    },
    description: 'Build intelligent workflows with AI that remembers your context, reads your documents, and makes smart decisions—all without writing code.',
    url: 'https://chainreact.app',
    screenshot: 'https://chainreact.app/opengraph-image.png',
    featureList: [
      'AI-powered workflow automation',
      'Visual workflow builder',
      '20+ app integrations',
      'No-code platform',
      'Real-time monitoring',
      'Human-in-the-loop approvals',
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
      <NewHomepage />
    </>
  )
}