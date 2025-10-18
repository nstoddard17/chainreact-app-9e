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
    title: 'ChainReact – Workflow Automation That Thinks For Itself',
    description: 'Build intelligent workflows with AI that remembers your context, reads your documents, and makes smart decisions—all without writing code.',
    images: [
      {
        url: 'https://chainreact.app/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'Preview of the ChainReact automation platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChainReact – Workflow Automation That Thinks For Itself',
    description: 'Build intelligent workflows with AI that remembers your context, reads your documents, and makes smart decisions—all without writing code.',
    creator: '@ChainReact_App',
    images: ['https://chainreact.app/twitter-image.png'],
  },
}

export default function HomePage() {
  return <NewHomepage />
}