"use client"

import { cn } from "@/lib/utils"

interface PulsingPlaceholderProps {
  count?: number
  message?: string
  className?: string
}

export function PulsingPlaceholders({
  count = 3,
  message = "Building workflow...",
  className
}: PulsingPlaceholderProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Message */}
      {message && (
        <div className="text-sm font-medium text-foreground mb-3">
          {message}
        </div>
      )}

      {/* Pulsing placeholders */}
      <div className="space-y-2">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{
              animationDelay: `${i * 150}ms`
            }}
          >
            <div className="w-full bg-accent/30 border border-border/50 rounded-lg px-4 py-3">
              <div className="flex items-start gap-3">
                {/* Icon placeholder */}
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 animate-pulse" />

                {/* Content placeholder */}
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-primary/10 rounded w-3/4 animate-pulse" />
                  <div className="h-3 bg-primary/5 rounded w-1/2 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}