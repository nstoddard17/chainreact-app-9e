"use client"

import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <ToastWithProgress
            key={id}
            id={id}
            title={title}
            description={description}
            action={action}
            duration={props.duration}
            {...props}
          />
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}

function ToastWithProgress({ id, title, description, action, duration = 5000, ...props }: any) {
  const [progress, setProgress] = useState(100)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (isPaused) return

    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)

      if (remaining <= 0) {
        clearInterval(interval)
      }
    }, 16) // ~60fps

    return () => clearInterval(interval)
  }, [duration, isPaused])

  return (
    <Toast
      {...props}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative overflow-hidden"
    >
      <div className="grid gap-1">
        {title && <ToastTitle>{title}</ToastTitle>}
        {description && (
          <ToastDescription>{description}</ToastDescription>
        )}
      </div>
      {action}
      <ToastClose />
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </Toast>
  )
}
