"use client"

import { useEffect } from 'react'
import { initChunkErrorHandler } from '@/lib/utils/chunkErrorHandler'

import { logger } from '@/lib/utils/logger'

export function ChunkErrorHandler() {
  useEffect(() => {
    // Initialize chunk error handler with custom config
    initChunkErrorHandler({
      maxRetries: 3,
      retryDelay: 1500,
      onError: (error) => {
        logger.error('Chunk loading failed after retries:', error)
      }
    })
  }, [])

  return null
}