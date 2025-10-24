"use client"

import { cn } from "@/lib/utils"

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <div className={cn(
      "relative w-full border border-border rounded-lg px-4 py-3 mb-3 overflow-hidden",
      className
    )}>
      {/* Shifting blue background gradient */}
      <div
        className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/20 to-primary/5"
        style={{
          animation: 'shimmer 2s ease-in-out infinite',
          backgroundSize: '200% 100%'
        }}
      />

      {/* Content */}
      <div className="relative flex items-center gap-3">
        {/* Stationary pulsing dot */}
        <div className="relative w-2 h-2">
          <div
            className="absolute inset-0 bg-primary rounded-full"
            style={{
              animation: 'pulse-grow 1.5s ease-in-out infinite'
            }}
          />
        </div>

        {/* Status text */}
        <span className="text-sm text-foreground font-medium">{status}</span>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }

        @keyframes pulse-grow {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.4;
            transform: scale(1.8);
          }
        }
      `}</style>
    </div>
  )
}
