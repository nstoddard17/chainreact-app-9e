import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getBaseUrl as getBaseUrlInternal } from "./utils/getBaseUrl"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Re-export getBaseUrl from utils/getBaseUrl.ts
export { getBaseUrlInternal as getBaseUrl }
