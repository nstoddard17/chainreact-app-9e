"use client"

import { PublicLayout } from "@/components/layout/PublicLayout"
import LandingPage from "@/components/landing/LandingPage"
import { Suspense } from "react"

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p className="text-slate-600">Loading...</p>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PublicLayout>
        <LandingPage />
      </PublicLayout>
    </Suspense>
  )
}
