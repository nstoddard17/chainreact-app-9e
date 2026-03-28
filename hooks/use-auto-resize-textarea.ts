'use client'

import { useCallback, useRef, useLayoutEffect } from 'react'

interface UseAutoResizeTextareaOptions {
  minHeight?: number
  maxHeight?: number
  value?: string
}

export function useAutoResizeTextarea(options: UseAutoResizeTextareaOptions = {}) {
  const { minHeight = 40, maxHeight = 200, value } = options
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    // Reset to auto so scrollHeight recalculates from content
    el.style.height = 'auto'
    const newHeight = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)
    el.style.height = `${newHeight}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [minHeight, maxHeight])

  const resetHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = `${minHeight}px`
    el.style.overflowY = 'hidden'
  }, [minHeight])

  // Resize whenever value changes (external clear, paste, prompt enhancer, etc.)
  useLayoutEffect(() => {
    if (value === undefined) return
    if (value === '') {
      resetHeight()
    } else {
      resize()
    }
  }, [value, resize, resetHeight])

  return { textareaRef, resize, resetHeight }
}
