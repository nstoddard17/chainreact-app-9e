"use client"

import { memo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface OptimizedImageProps {
  src: string
  alt: string
  className?: string
  fallback?: React.ReactNode
}

/**
 * OptimizedImage component that prevents flashing by using CSS and minimal state
 */
export const OptimizedImage = memo(function OptimizedImage({
  src,
  alt,
  className,
  fallback
}: OptimizedImageProps) {
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // If there's an error and we have a fallback, show it
  if (hasError && fallback) {
    return <>{fallback}</>
  }

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={cn(
        className,
        "transition-opacity duration-200"
      )}
      loading="eager"
      onError={() => setHasError(true)}
      // Use native loading states - no JS state changes
      style={{
        opacity: 1
      }}
    />
  )
})