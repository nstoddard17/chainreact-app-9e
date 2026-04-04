import type { Metadata } from 'next'
import { TempLanding } from '@/components/temp-landing/TempLanding'

export const metadata: Metadata = {
  title: 'ChainReact — Workflow Automation That Learns',
  description: 'Build intelligent workflows with AI that improves from your corrections. Human-in-the-loop automation that gets smarter over time.',
}

export default function TempPage() {
  return <TempLanding />
}
