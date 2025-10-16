import LandingPage from "@/components/landing/LandingPage"

// Force dynamic to prevent build-time rendering issues
export const dynamic = 'force-dynamic'

export default function HomePage() {
  return <LandingPage />
}