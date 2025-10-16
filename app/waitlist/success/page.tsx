import { Suspense } from 'react'
import { WaitlistSuccess } from '@/components/waitlist/WaitlistSuccess'

export const metadata = {
  title: 'Welcome to the Waitlist! | ChainReact',
  description: "You're on the list! We'll be in touch soon with early access to ChainReact.",
}

export default function WaitlistSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950" />}>
      <WaitlistSuccess />
    </Suspense>
  )
}
