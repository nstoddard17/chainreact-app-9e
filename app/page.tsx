import { UnifiedHomepage } from '@/components/homepage/UnifiedHomepage'

// Force dynamic to prevent build-time rendering issues
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'ChainReact - Automate Your Workflows with AI',
  description: 'Connect your favorite apps and create powerful AI-driven automation workflows. Join the waitlist to be among the first to revolutionize your productivity.',
}

export default function HomePage() {
  return <UnifiedHomepage />
}