/**
 * Performance Monitoring Utilities
 *
 * Tracks Core Web Vitals and custom performance metrics
 * Integrates with analytics to monitor real user performance
 */

export interface PerformanceMetric {
  name: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  delta: number
  id: string
  navigationType: string
}

/**
 * Core Web Vitals thresholds (Google standards)
 */
const THRESHOLDS = {
  // Largest Contentful Paint (LCP) - measures loading performance
  LCP: {
    good: 2500, // < 2.5s
    poor: 4000, // > 4s
  },
  // Cumulative Layout Shift (CLS) - measures visual stability
  CLS: {
    good: 0.1,
    poor: 0.25,
  },
  // First Contentful Paint (FCP)
  FCP: {
    good: 1800, // < 1.8s
    poor: 3000, // > 3s
  },
  // Time to First Byte (TTFB)
  TTFB: {
    good: 800, // < 800ms
    poor: 1800, // > 1.8s
  },
  // Interaction to Next Paint (INP) - replaces deprecated FID
  INP: {
    good: 200, // < 200ms
    poor: 500, // > 500ms
  },
} as const

/**
 * Get rating based on value and thresholds
 */
function getRating(
  name: keyof typeof THRESHOLDS,
  value: number
): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[name]
  if (value <= threshold.good) return 'good'
  if (value <= threshold.poor) return 'needs-improvement'
  return 'poor'
}

/**
 * Report Core Web Vitals to analytics
 * This function is called from app/layout.tsx via web-vitals library
 */
export function reportWebVitals(metric: PerformanceMetric) {
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Performance] ${metric.name}:`, {
      value: Math.round(metric.value),
      rating: metric.rating,
      delta: Math.round(metric.delta),
    })
  }

  // Send to analytics in production
  if (process.env.NODE_ENV === 'production') {
    // Example: Send to your analytics service
    // analytics.track('Web Vital', {
    //   metric: metric.name,
    //   value: metric.value,
    //   rating: metric.rating,
    //   page: window.location.pathname,
    // })

    // Or use Google Analytics
    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', metric.name, {
        value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
        event_category: 'Web Vitals',
        event_label: metric.id,
        non_interaction: true,
      })
    }
  }
}

/**
 * Custom performance marks for tracking specific operations
 */
export class PerformanceTracker {
  private marks: Map<string, number> = new Map()

  /**
   * Start tracking a custom metric
   */
  start(name: string) {
    this.marks.set(name, performance.now())
    performance.mark(`${name}-start`)
  }

  /**
   * End tracking and get duration
   */
  end(name: string): number | null {
    const startTime = this.marks.get(name)
    if (!startTime) {
      console.warn(`[PerformanceTracker] No start mark found for: ${name}`)
      return null
    }

    const endTime = performance.now()
    const duration = endTime - startTime

    performance.mark(`${name}-end`)
    performance.measure(name, `${name}-start`, `${name}-end`)

    this.marks.delete(name)

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Performance] ${name}: ${Math.round(duration)}ms`)
    }

    return duration
  }

  /**
   * Track an async operation
   */
  async track<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.start(name)
    try {
      const result = await fn()
      this.end(name)
      return result
    } catch (error) {
      this.end(name)
      throw error
    }
  }
}

// Global singleton
export const performanceTracker = new PerformanceTracker()

/**
 * Hook for tracking component mount/render performance
 * Usage: usePerformanceTracking('ComponentName')
 */
export function trackComponentPerformance(componentName: string) {
  if (typeof window === 'undefined') return

  const startMark = `${componentName}-mount-start`
  const endMark = `${componentName}-mount-end`

  performance.mark(startMark)

  return () => {
    performance.mark(endMark)
    performance.measure(`${componentName}-mount`, startMark, endMark)

    const measure = performance.getEntriesByName(`${componentName}-mount`)[0]
    if (measure && process.env.NODE_ENV === 'development') {
      console.log(`[Component Performance] ${componentName}: ${Math.round(measure.duration)}ms`)
    }
  }
}

/**
 * Get performance metrics for current page
 */
export function getPerformanceMetrics() {
  if (typeof window === 'undefined') return null

  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
  const paint = performance.getEntriesByType('paint')

  return {
    // Navigation timing
    dns: navigation.domainLookupEnd - navigation.domainLookupStart,
    tcp: navigation.connectEnd - navigation.connectStart,
    ttfb: navigation.responseStart - navigation.requestStart,
    download: navigation.responseEnd - navigation.responseStart,
    domInteractive: navigation.domInteractive - navigation.fetchStart,
    domComplete: navigation.domComplete - navigation.fetchStart,
    loadComplete: navigation.loadEventEnd - navigation.fetchStart,

    // Paint timing
    fcp: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0,

    // Resource timing summary
    resources: {
      total: performance.getEntriesByType('resource').length,
      scripts: performance.getEntriesByType('resource').filter(r => r.name.endsWith('.js')).length,
      styles: performance.getEntriesByType('resource').filter(r => r.name.endsWith('.css')).length,
      images: performance.getEntriesByType('resource').filter(r => {
        const name = r.name.toLowerCase()
        return name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.webp') || name.endsWith('.svg')
      }).length,
    },
  }
}

// Type augmentation for gtag
declare global {
  interface Window {
    gtag?: (...args: any[]) => void
  }
}
