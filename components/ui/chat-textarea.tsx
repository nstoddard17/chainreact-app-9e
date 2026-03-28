'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { useAutoResizeTextarea } from '@/hooks/use-auto-resize-textarea'

interface ChatTextareaProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder?: string
  disabled?: boolean
  className?: string
  minHeight?: number
  maxHeight?: number
}

const ChatTextarea = React.forwardRef<HTMLTextAreaElement, ChatTextareaProps>(
  (
    {
      value,
      onChange,
      onSend,
      placeholder,
      disabled,
      className,
      minHeight = 40,
      maxHeight = 200,
    },
    forwardedRef
  ) => {
    const { textareaRef, resize } = useAutoResizeTextarea({
      minHeight,
      maxHeight,
      value,
    })

    // Merge forwarded ref with internal ref
    const mergedRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        ;(textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node
        if (typeof forwardedRef === 'function') {
          forwardedRef(node)
        } else if (forwardedRef) {
          ;(forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node
        }
      },
      [forwardedRef, textareaRef]
    )

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value)
      resize()
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        if (value.trim()) {
          onSend()
        }
      }
    }

    return (
      <textarea
        ref={mergedRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        aria-label={placeholder || 'Message input'}
        className={cn(
          'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none',
          className
        )}
        style={{
          minHeight: `${minHeight}px`,
          maxHeight: `${maxHeight}px`,
        }}
      />
    )
  }
)
ChatTextarea.displayName = 'ChatTextarea'

export { ChatTextarea }
export type { ChatTextareaProps }
