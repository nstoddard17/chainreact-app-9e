"use client"

import { useEffect } from "react"

export function GlobalErrorHandler() {
  useEffect(() => {
    // Store the original console.error
    const originalConsoleError = console.error
    const originalConsoleWarn = console.warn

    // Override console.error to filter out known errors
    console.error = (...args) => {
      // Check if this is an AbortController abort error (common during navigation)
      const isAbortError = args.some(arg => 
        typeof arg === 'string' && (
          arg.includes("AbortError") || 
          arg.includes("The operation was aborted") ||
          arg.includes("The user aborted a request") ||
          arg.includes("New request started") ||
          arg.includes("Request timeout")
        )
      )

      // Check if this is a presence channel error (common with realtime connections)
      const isPresenceError = args.some(arg => 
        typeof arg === 'string' && (
          arg.includes("Presence: Channel error occurred") ||
          arg.includes("Presence: Channel timed out") ||
          arg.includes("realtime") ||
          arg.includes("presence") ||
          arg.includes("channel")
        )
      )

      if (isAbortError) {
        // Don't log abort errors - they're expected during navigation
        console.debug("🔍 AbortController abort (expected behavior):", args)
        return
      }

      if (isPresenceError) {
        // Don't log presence errors - they're expected with realtime connections
        console.debug("👥 Presence channel error (expected behavior):", args)
        return
      }

      // Call the original console.error for all other errors
      originalConsoleError.apply(console, args)
    }

    // Restore original console.warn (no special filtering needed)
    console.warn = originalConsoleWarn

    // Global error event handler
    const handleGlobalError = (event: ErrorEvent) => {
      // Skip null or undefined errors
      if (event.error === null || event.error === undefined) {
        console.debug("🔍 Ignoring null/undefined error event")
        event.preventDefault()
        return
      }

      
      // Check if this is an AbortController abort error
      if (event.message && (
        event.message.includes("AbortError") || 
        event.message.includes("The operation was aborted") ||
        event.message.includes("The user aborted a request") ||
        event.message.includes("New request started") ||
        event.message.includes("Request timeout")
      )) {
        console.debug("🔍 Fetch AbortError (expected):", event.message)
        event.preventDefault()
        return
      }

      // Check if this is a presence channel error
      if (event.message && (
        event.message.includes("Presence: Channel error occurred") ||
        event.message.includes("Presence: Channel timed out") ||
        event.message.includes("realtime") ||
        event.message.includes("presence") ||
        event.message.includes("channel")
      )) {
        console.debug("👥 Presence channel error (expected):", event.message)
        event.preventDefault()
        return
      }
    }

    // Global unhandled rejection handler
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      
      // Check if this is an AbortController abort rejection
      if (event.reason && (
        (typeof event.reason === 'string' && (
          event.reason.includes("AbortError") || 
          event.reason.includes("The operation was aborted") ||
          event.reason.includes("The user aborted a request") ||
          event.reason.includes("New request started") ||
          event.reason.includes("Request timeout")
        )) ||
        (event.reason instanceof Error && (
          event.reason.name === "AbortError" ||
          event.reason.message.includes("aborted")
        ))
      )) {
        console.debug("🔍 AbortController rejection (expected):", event.reason)
        event.preventDefault()
        return
      }

      // Check if this is a presence channel rejection
      if (event.reason && (
        (typeof event.reason === 'string' && (
          event.reason.includes("Presence: Channel error occurred") ||
          event.reason.includes("Presence: Channel timed out") ||
          event.reason.includes("realtime") ||
          event.reason.includes("presence") ||
          event.reason.includes("channel")
        )) ||
        (event.reason instanceof Error && (
          event.reason.message.includes("presence") ||
          event.reason.message.includes("channel") ||
          event.reason.message.includes("realtime")
        ))
      )) {
        console.debug("👥 Presence channel rejection (expected):", event.reason)
        event.preventDefault()
        return
      }
    }

    // Add event listeners
    window.addEventListener('error', handleGlobalError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    // Cleanup function
    return () => {
      // Restore original console methods
      console.error = originalConsoleError
      console.warn = originalConsoleWarn
      
      // Remove event listeners
      window.removeEventListener('error', handleGlobalError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
} 