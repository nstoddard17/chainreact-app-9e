"use client"

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useRef } from 'react'

interface PrefetchLinkProps extends React.ComponentProps<typeof Link> {
  children: React.ReactNode
  prefetchDelay?: number // ms to wait before prefetching (default 100ms)
}

/**
 * Enhanced Link component that prefetches on hover for instant navigation
 * Uses Next.js router.prefetch() for smart preloading
 */
export function PrefetchLink({
  children,
  href,
  prefetchDelay = 100,
  onMouseEnter,
  onMouseLeave,
  ...props
}: PrefetchLinkProps) {
  const router = useRouter()
  const timeoutRef = useRef<NodeJS.Timeout>()
  const prefetchedRef = useRef(false)

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    // Call original handler if exists
    onMouseEnter?.(e)

    // Don't prefetch if already done
    if (prefetchedRef.current) return

    // Start prefetch after delay
    timeoutRef.current = setTimeout(() => {
      const url = typeof href === 'string' ? href : href.pathname || '/'

      // Only prefetch internal routes
      if (url.startsWith('/') && !url.startsWith('//')) {
        router.prefetch(url)
        prefetchedRef.current = true
      }
    }, prefetchDelay)
  }, [href, router, prefetchDelay, onMouseEnter])

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    // Call original handler if exists
    onMouseLeave?.(e)

    // Cancel prefetch if user leaves quickly
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
  }, [onMouseLeave])

  return (
    <Link
      href={href}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </Link>
  )
}