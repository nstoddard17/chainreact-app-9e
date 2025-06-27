"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Sun, Moon } from "lucide-react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex bg-muted rounded-full p-1 w-16 h-8">
        <div className="w-full h-full bg-transparent rounded-full" />
      </div>
    )
  }

  const isDark = theme === "dark"

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <div className="flex bg-muted rounded-full p-1 w-16 h-8">
      <button
        type="button"
        onClick={toggleTheme}
        className={cn(
          "relative flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full transition-all duration-200",
          !isDark
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        title="Light mode"
      >
        <Sun className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        className={cn(
          "relative flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full transition-all duration-200",
          isDark
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        title="Dark mode"
      >
        <Moon className="w-3 h-3" />
      </button>
    </div>
  )
} 