import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Add the getBaseUrl function
export function getBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  // For server-side rendering
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  // Fallback for development
  return `http://localhost:${process.env.PORT || 3000}`
}
