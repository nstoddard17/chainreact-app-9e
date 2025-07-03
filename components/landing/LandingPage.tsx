"use client"

import React, { Suspense, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useAuth } from "@/hooks/use-auth"
import { useAuthStore } from "@/stores/authStore"
import { type UserRole } from "@/lib/utils/roles"

// Critical components loaded immediately
import LandingNavigation from './LandingNavigation'
import LandingHero from './LandingHero'

// Heavy components loaded dynamically for better performance
const AnimatedBackground = dynamic(() => import('./AnimatedBackground'), {
  ssr: false, // Don't render on server for better initial load
  loading: () => <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900" />
})

const LandingFeatures = dynamic(() => import('./LandingFeatures'), {
  loading: () => (
    <div className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 md:py-24">
      <div className="max-w-7xl mx-auto text-center">
        <div className="animate-pulse">
          <div className="h-8 bg-blue-600/20 rounded-full w-32 mx-auto mb-4"></div>
          <div className="h-12 bg-white/10 rounded-lg w-3/4 mx-auto mb-6"></div>
          <div className="h-6 bg-white/5 rounded-lg w-1/2 mx-auto"></div>
        </div>
      </div>
    </div>
  )
})

const LandingPricing = dynamic(() => import('./LandingPricing'), {
  loading: () => (
    <div className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 md:py-24">
      <div className="max-w-7xl mx-auto text-center">
        <div className="animate-pulse">
          <div className="h-8 bg-blue-600/20 rounded-full w-32 mx-auto mb-4"></div>
          <div className="h-12 bg-white/10 rounded-lg w-2/3 mx-auto mb-6"></div>
        </div>
      </div>
    </div>
  )
})

const LandingFooter = dynamic(() => import('./LandingFooter'), {
  loading: () => (
    <div className="relative z-10 bg-slate-950/50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="h-6 bg-white/10 rounded w-3/4"></div>
                <div className="space-y-2">
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="h-4 bg-white/5 rounded w-full"></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
})

// Main component with optimized loading
export default function LandingPage() {
  const { isAuthenticated, user, isReady } = useAuth()
  const { signOut, profile } = useAuthStore()

  const userRole = (profile?.role as UserRole) || 'free'
  const isAdmin = userRole === 'admin'

  // Memoize the sign out handler
  const handleSignOut = useMemo(() => async () => {
    try {
      await signOut()
    } catch (error) {
      console.error("Logout error:", error)
    }
  }, [signOut])

  // Show optimized loading state while auth is initializing
  if (!isReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-blue-200 mb-4">Loading...</p>
          <button 
            onClick={() => window.location.reload()}
            className="text-blue-300 hover:text-blue-100 text-sm underline"
          >
            Taking too long? Click here to reload
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 relative overflow-hidden">
      {/* Animated Background - Loaded lazily */}
      <Suspense fallback={<div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900" />}>
        <AnimatedBackground />
      </Suspense>
      
      {/* Navigation - Critical, loaded immediately */}
      <LandingNavigation
        isAuthenticated={isAuthenticated}
        user={user}
        profile={profile}
        userRole={userRole}
        isAdmin={isAdmin}
        onSignOut={handleSignOut}
      />

      {/* Hero Section - Critical, loaded immediately */}
      <LandingHero isAuthenticated={isAuthenticated} />

      {/* Features Section - Lazy loaded */}
      <Suspense fallback={
        <div className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="max-w-7xl mx-auto text-center">
            <div className="animate-pulse">
              <div className="h-8 bg-blue-600/20 rounded-full w-32 mx-auto mb-4"></div>
              <div className="h-12 bg-white/10 rounded-lg w-3/4 mx-auto mb-6"></div>
              <div className="h-6 bg-white/5 rounded-lg w-1/2 mx-auto"></div>
            </div>
          </div>
        </div>
      }>
        <LandingFeatures />
      </Suspense>

      {/* Pricing Section - Lazy loaded */}
      <Suspense fallback={
        <div className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="max-w-7xl mx-auto text-center">
            <div className="animate-pulse">
              <div className="h-8 bg-blue-600/20 rounded-full w-32 mx-auto mb-4"></div>
              <div className="h-12 bg-white/10 rounded-lg w-2/3 mx-auto mb-6"></div>
            </div>
          </div>
        </div>
      }>
        <LandingPricing isAuthenticated={isAuthenticated} />
      </Suspense>

      {/* Footer - Lazy loaded */}
      <Suspense fallback={
        <div className="relative z-10 bg-slate-950/50 py-12">
          <div className="animate-pulse">
            <div className="h-32 bg-white/5 rounded mx-4"></div>
          </div>
        </div>
      }>
        <LandingFooter isAuthenticated={isAuthenticated} />
      </Suspense>
    </div>
  )
}
