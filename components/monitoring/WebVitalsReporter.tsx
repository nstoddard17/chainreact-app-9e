"use client"

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Web Vitals Reporter Component
 *
 * Automatically reports Core Web Vitals for every page
 * Integrates with Next.js App Router for accurate page tracking
 */
export function WebVitalsReporter() {
  const pathname = usePathname()

  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return

    // Dynamic import to avoid SSR issues and reduce bundle size
    import('web-vitals').then(({ onCLS, onFCP, onLCP, onTTFB, onINP }) => {
      onCLS((metric) => reportMetric(metric, pathname))
      onFCP((metric) => reportMetric(metric, pathname))
      onLCP((metric) => reportMetric(metric, pathname))
      onTTFB((metric) => reportMetric(metric, pathname))
      onINP((metric) => reportMetric(metric, pathname))
    }).catch((error) => {
      console.error('[WebVitals] Failed to load web-vitals library:', error)
    })
  }, [pathname])

  return null // This component doesn't render anything
}

function reportMetric(metric: any, pathname: string | null) {
  const isDev = process.env.NODE_ENV === 'development'

  // Enhanced metric with page context
  const enhancedMetric = {
    ...metric,
    page: pathname || '/',
    timestamp: Date.now(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  }

  // Log in development
  if (isDev) {
    const rating = getRating(metric.name, metric.value)
    const emoji = rating === 'good' ? '✅' : rating === 'needs-improvement' ? '⚠️' : '❌'

  }

  // Send to analytics in production
  if (!isDev && typeof window !== 'undefined') {
    // Send to your analytics service
    // Example: PostHog, Mixpanel, Amplitude, etc.
    // analytics.track('Web Vital', enhancedMetric)

    // Or send to a custom API endpoint
    // fetch('/api/analytics/web-vitals', {
    //   method: 'POST',
    //   body: JSON.stringify(enhancedMetric),
    //   keepalive: true, // Ensure request completes even if page unloads
    // })

    // Google Analytics example
    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', metric.name, {
        value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
        event_category: 'Web Vitals',
        event_label: metric.id,
        page_path: pathname,
        non_interaction: true,
      })
    }
  }
}

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const thresholds: Record<string, { good: number; poor: number }> = {
    LCP: { good: 2500, poor: 4000 },
    CLS: { good: 0.1, poor: 0.25 },
    FCP: { good: 1800, poor: 3000 },
    TTFB: { good: 800, poor: 1800 },
    INP: { good: 200, poor: 500 },
  }

  const threshold = thresholds[name]
  if (!threshold) return 'good'

  if (value <= threshold.good) return 'good'
  if (value <= threshold.poor) return 'needs-improvement'
  return 'poor'
}

function formatValue(name: string, value: number): string {
  if (name === 'CLS') {
    return value.toFixed(3)
  }
  return `${Math.round(value)}ms`
}

// Type augmentation
declare global {
  interface Window {
    gtag?: (...args: any[]) => void
  }
}
