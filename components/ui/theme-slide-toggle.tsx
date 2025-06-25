"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export function ThemeSlideToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-muted-foreground">Appearance</span>
        <div className="relative bg-muted rounded-full p-1 w-32 h-8">
          <div className="w-full h-full bg-transparent rounded-full" />
        </div>
      </div>
    )
  }

  const isDark = theme === "dark"

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-foreground">Appearance</span>
      <div className="flex bg-muted rounded-full p-1 w-fit">
        <button
          type="button"
          onClick={toggleTheme}
          className={cn(
            "relative flex items-center justify-center px-4 py-1.5 text-xs font-medium rounded-full transition-all duration-200 min-w-[60px]",
            !isDark
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Light
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className={cn(
            "relative flex items-center justify-center px-4 py-1.5 text-xs font-medium rounded-full transition-all duration-200 min-w-[60px]",
            isDark
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Dark
        </button>
      </div>
    </div>
  )
} 