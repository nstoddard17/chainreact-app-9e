import { NewHomepage } from '@/components/homepage-new/NewHomepage'

// Force dynamic to prevent build-time rendering issues
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'ChainReact - Workflow Automation That Learns Your Business',
  description: 'Connect your apps. Train your AI. Scale your expertise. The more you use ChainReact, the less you need to. Human-in-the-loop AI training for intelligent workflow automation.',
}

export default function NewHomePage() {
  return <NewHomepage />
}
