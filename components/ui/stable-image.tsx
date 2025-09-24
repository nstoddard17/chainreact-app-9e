"use client"

import { useState, useEffect, memo, useRef } from 'react'
import { cn } from '@/lib/utils'

// Cache loaded images to prevent re-loading
const imageCache = new Map<string, 'loaded' | 'error'>()

interface StableImageProps {
  src: string
  alt: string
  className?: string
  fallback?: React.ReactNode
  onError?: () => void
}

/**
 * StableImage prevents flashing and re-renders when loading images
 * It preloads the image before showing it and caches the result
 */
export const StableImage = memo(function StableImage({
  src,
  alt,
  className,
  fallback,
  onError
}: StableImageProps) {
  // Check cache first
  const cachedState = imageCache.get(src)
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>(
    cachedState || 'loading'
  )
  const [imageSrc, setImageSrc] = useState<string | null>(cachedState === 'loaded' ? src : null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!src) {
      setImageState('error')
      return
    }

    // If already cached as loaded, use it immediately
    if (imageCache.get(src) === 'loaded') {
      setImageSrc(src)
      setImageState('loaded')
      return
    }

    // If already cached as error, use fallback
    if (imageCache.get(src) === 'error') {
      setImageState('error')
      return
    }

    // Preload the image
    const img = new Image()

    const handleLoad = () => {
      imageCache.set(src, 'loaded')
      if (mountedRef.current) {
        setImageSrc(src)
        setImageState('loaded')
      }
    }

    const handleError = () => {
      imageCache.set(src, 'error')
      if (mountedRef.current) {
        setImageState('error')
        onError?.()
      }
    }

    img.onload = handleLoad
    img.onerror = handleError
    img.src = src

    // Cleanup
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [src, onError])

  if (imageState === 'error' && fallback) {
    return <>{fallback}</>
  }

  if (imageState === 'loading') {
    // For integration icons, show the fallback immediately instead of pulsing placeholder
    // This prevents the blinking effect
    if (fallback) {
      return <>{fallback}</>
    }
    // Only show placeholder if no fallback is provided
    return (
      <div className={cn("bg-gray-200 dark:bg-gray-700 rounded", className)} />
    )
  }

  return (
    <img
      src={imageSrc!}
      alt={alt}
      className={className}
      loading="eager"
    />
  )
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  // Only re-render if src, alt, or className actually changed
  return (
    prevProps.src === nextProps.src &&
    prevProps.alt === nextProps.alt &&
    prevProps.className === nextProps.className &&
    // For fallback, we only care if it's present or not, not reference equality
    (prevProps.fallback === nextProps.fallback ||
      (!!prevProps.fallback === !!nextProps.fallback))
  )
})