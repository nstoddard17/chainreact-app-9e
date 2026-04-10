"use client"

import { useTheme } from "next-themes"
import { useEffect } from "react"

/**
 * Forces a specific theme on the page it's rendered in.
 * Used on landing/marketing pages to prevent dark mode from affecting them.
 * Restores the user's previous theme on unmount.
 */
export function ForceTheme({ theme }: { theme: string }) {
  const { setTheme, theme: currentTheme } = useTheme()

  useEffect(() => {
    const previousTheme = currentTheme
    setTheme(theme)
    return () => {
      if (previousTheme) {
        setTheme(previousTheme)
      }
    }
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
