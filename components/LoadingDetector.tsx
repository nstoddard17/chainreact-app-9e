"use client"

import { usePageLoadingDetector } from "@/hooks/use-page-loading-detector"

export function LoadingDetector() {
  usePageLoadingDetector()
  return null
}