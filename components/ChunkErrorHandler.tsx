"use client"

import { useEffect } from 'react'
import { initChunkErrorHandler } from '@/lib/utils/chunkErrorHandler'

export function ChunkErrorHandler() {
  useEffect(() => {
    // Initialize chunk error handler with custom config
    initChunkErrorHandler({
      maxRetries: 3,
      retryDelay: 1500,
      onError: (error) => {
        console.error('Chunk loading failed after retries:', error)
      }
    })
  }, [])

  return null
}