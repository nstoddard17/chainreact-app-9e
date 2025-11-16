"use client"

import Image, { ImageProps } from "next/image"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface LazyImageProps extends Omit<ImageProps, 'onLoad' | 'onError'> {
  /** Fallback component to show while loading */
  fallback?: React.ReactNode
  /** Fallback component to show on error */
  errorFallback?: React.ReactNode
  /** Additional container className */
  containerClassName?: string
}

/**
 * Optimized lazy-loading image component
 * Features:
 * - Automatic lazy loading
 * - Loading skeleton
 * - Error handling
 * - Smooth fade-in animation
 * - Next.js Image optimization
 */
export function LazyImage({
  src,
  alt,
  className,
  fallback,
  errorFallback,
  containerClassName,
  ...props
}: LazyImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  if (hasError && errorFallback) {
    return <>{errorFallback}</>
  }

  return (
    <div className={cn("relative overflow-hidden", containerClassName)}>
      {/* Loading skeleton */}
      {isLoading && (
        <div className="absolute inset-0 bg-muted animate-pulse">
          {fallback}
        </div>
      )}

      {/* Image */}
      <Image
        src={src}
        alt={alt}
        className={cn(
          "transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100",
          className
        )}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false)
          setHasError(true)
        }}
        loading="lazy"
        {...props}
      />
    </div>
  )
}

/**
 * Lazy image with blur placeholder
 */
export function LazyImageWithBlur({
  src,
  blurDataURL,
  ...props
}: LazyImageProps & { blurDataURL?: string }) {
  return (
    <LazyImage
      src={src}
      placeholder={blurDataURL ? "blur" : "empty"}
      blurDataURL={blurDataURL}
      {...props}
    />
  )
}
