"use client"

import { useState, useEffect, memo } from 'react'
import { cn } from '@/lib/utils'

interface StableImageProps {
  src: string
  alt: string
  className?: string
  fallback?: React.ReactNode
  onError?: () => void
}

/**
 * StableImage prevents flashing and re-renders when loading images
 * It preloads the image before showing it
 */
export const StableImage = memo(function StableImage({
  src,
  alt,
  className,
  fallback,
  onError
}: StableImageProps) {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [imageSrc, setImageSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!src) {
      setImageState('error')
      return
    }

    // Preload the image
    const img = new Image()

    const handleLoad = () => {
      setImageSrc(src)
      setImageState('loaded')
    }

    const handleError = () => {
      setImageState('error')
      onError?.()
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
    // Return a placeholder to prevent layout shift
    return (
      <div className={cn("animate-pulse bg-gray-200 rounded", className)} />
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
})