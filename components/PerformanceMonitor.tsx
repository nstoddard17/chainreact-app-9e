"use client"

import { useEffect } from 'react'

import { logger } from '@/lib/utils/logger'

declare global {
  interface Window {
    gtag?: (...args: any[]) => void
  }
}

// Performance monitoring component for tracking Core Web Vitals
export default function PerformanceMonitor() {
  useEffect(() => {
    // Only monitor in production and if gtag is available
    if (process.env.NODE_ENV !== 'production' || typeof window.gtag !== 'function') {
      return
    }

    // Track Core Web Vitals
    const trackWebVitals = () => {
      // LCP - Largest Contentful Paint
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        
        if (lastEntry) {
          logger.debug('LCP:', lastEntry.startTime)
          window.gtag?.('event', 'web_vitals', {
            event_category: 'Performance',
            event_label: 'LCP',
            value: Math.round(lastEntry.startTime),
            custom_parameter_1: Math.round(lastEntry.startTime),
          })
        }
      })
      
      try {
        observer.observe({ type: 'largest-contentful-paint', buffered: true })
      } catch (e) {
        // LCP not supported
      }

      // FID - First Input Delay  
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach((entry: any) => {
          logger.debug('FID:', entry.processingStart - entry.startTime)
          window.gtag?.('event', 'web_vitals', {
            event_category: 'Performance',
            event_label: 'FID',
            value: Math.round(entry.processingStart - entry.startTime),
            custom_parameter_1: Math.round(entry.processingStart - entry.startTime),
          })
        })
      })
      
      try {
        fidObserver.observe({ type: 'first-input', buffered: true })
      } catch (e) {
        // FID not supported
      }

      // CLS - Cumulative Layout Shift
      let clsValue = 0
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value
          }
        })
        
        logger.debug('CLS:', clsValue)
        window.gtag?.('event', 'web_vitals', {
          event_category: 'Performance',
          event_label: 'CLS',
          value: Math.round(clsValue * 1000),
          custom_parameter_1: Math.round(clsValue * 1000),
        })
      })
      
      try {
        clsObserver.observe({ type: 'layout-shift', buffered: true })
      } catch (e) {
        // CLS not supported
      }
    }

    // Track loading performance
    const trackLoadingPerformance = () => {
      if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          entries.forEach((entry) => {
            logger.debug(`${entry.name}: ${entry.duration}ms`)
          })
        })
        
        try {
          observer.observe({ entryTypes: ['navigation', 'resource'] })
        } catch (e) {
          // Performance Observer not fully supported
        }
      }
    }

    // Initialize monitoring
    trackWebVitals()
    trackLoadingPerformance()

    // Track page load time
    window.addEventListener('load', () => {
      const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart
      logger.debug('Page Load Time:', loadTime, 'ms')
      
      window.gtag?.('event', 'page_load_time', {
        event_category: 'Performance',
        value: loadTime,
        custom_parameter_1: loadTime,
      })
    })

  }, [])

  // This component doesn't render anything
  return null
} 