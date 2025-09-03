"use client"

import React from 'react'
import { cn } from '@/lib/utils'
import { LightningLoader } from './lightning-loader'

interface LoaderProps {
  className?: string
  size?: number | string
}

/**
 * Loader component that replaces Loader2 with our custom lightning-to-chains animation
 * This maintains the same API as Loader2 for easy replacement
 */
export function Loader({ className, size }: LoaderProps) {
  // Convert size to our size system
  let loaderSize: 'sm' | 'md' | 'lg' | 'xl' = 'md'
  
  if (size) {
    const numSize = typeof size === 'string' ? parseInt(size) : size
    if (numSize <= 16) loaderSize = 'sm'
    else if (numSize <= 24) loaderSize = 'md'
    else if (numSize <= 32) loaderSize = 'lg'
    else loaderSize = 'xl'
  }
  
  // Extract size classes from className if present
  const hasAnimateSpin = className?.includes('animate-spin')
  const cleanedClassName = className?.replace('animate-spin', '')
  
  return (
    <LightningLoader 
      size={loaderSize} 
      className={cn(cleanedClassName)} 
      color="primary"
    />
  )
}

// Export as Loader2 alias for direct replacement
export { Loader as Loader2 }