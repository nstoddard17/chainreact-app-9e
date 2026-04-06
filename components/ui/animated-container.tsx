"use client"

import { cn } from "@/lib/utils"

interface AnimatedContainerProps {
  children: React.ReactNode
  className?: string
  animation?: "fade-in" | "fade-in-up" | "fade-in-down" | "slide-in-right" | "slide-in-left" | "scale-in"
  delay?: number
  stagger?: number
}

/**
 * Wraps children with entrance animations.
 * Use `stagger` to add incremental delays to direct children.
 */
export function AnimatedContainer({
  children,
  className,
  animation = "fade-in-up",
  delay = 0,
}: AnimatedContainerProps) {
  return (
    <div
      className={cn(`animate-${animation} fill-mode-both`, className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

/**
 * Renders children with staggered fade-in-up animations.
 * Each direct child gets an incremental delay.
 */
export function StaggerChildren({
  children,
  className,
  baseDelay = 0,
  staggerMs = 75,
  animation = "fade-in-up",
}: {
  children: React.ReactNode
  className?: string
  baseDelay?: number
  staggerMs?: number
  animation?: string
}) {
  const items = Array.isArray(children) ? children : [children]
  return (
    <div className={className}>
      {items.map((child, i) => (
        <div
          key={i}
          className={`animate-${animation}`}
          style={{
            animationDelay: `${baseDelay + i * staggerMs}ms`,
            animationFillMode: "both",
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}
