"use client"

import { useEffect } from 'react'

import { logger } from '@/lib/utils/logger'

export function DebugDragDrop() {
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      logger.debug('🌍 Global drag over:', {
        target: e.target,
        className: (e.target as HTMLElement)?.className,
        id: (e.target as HTMLElement)?.id,
        tagName: (e.target as HTMLElement)?.tagName
      })
    }

    const handleGlobalDrop = (e: DragEvent) => {
      logger.debug('🌍💧 Global drop:', {
        target: e.target,
        data: e.dataTransfer?.getData('text/plain'),
        className: (e.target as HTMLElement)?.className,
        id: (e.target as HTMLElement)?.id,
        tagName: (e.target as HTMLElement)?.tagName
      })
    }

    // Add listeners to document
    document.addEventListener('dragover', handleGlobalDragOver, true)
    document.addEventListener('drop', handleGlobalDrop, true)

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver, true)
      document.removeEventListener('drop', handleGlobalDrop, true)
    }
  }, [])

  return null
}