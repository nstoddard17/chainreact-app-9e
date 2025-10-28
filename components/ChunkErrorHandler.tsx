"use client"

import { useEffect } from 'react'
import { initChunkErrorHandler } from '@/lib/utils/chunkErrorHandler'

import { logger } from '@/lib/utils/logger'

export function ChunkErrorHandler() {
  useEffect(() => {
    // Initialize chunk error handler with custom config
    // First retry is silent and immediate to handle transient navigation errors
    initChunkErrorHandler({
      maxRetries: 2, // Reduced from 3 - first retry is silent, second shows prompt
      retryDelay: 1000, // Reduced from 1500ms - faster recovery
      onError: (error) => {
        logger.error('Chunk loading failed after retries:', error)
      }
    })
  }, [])

  return null
}