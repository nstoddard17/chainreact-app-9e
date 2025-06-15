"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, ExternalLink } from "lucide-react"

interface RedirectLoadingOverlayProps {
  provider?: string
  isVisible: boolean
}

export default function RedirectLoadingOverlay({ provider, isVisible }: RedirectLoadingOverlayProps) {
  const [dots, setDots] = useState("")

  useEffect(() => {
    if (!isVisible) return

    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev === "...") return ""
        return prev + "."
      })
    }, 500)

    return () => clearInterval(interval)
  }, [isVisible])

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
              <ExternalLink className="w-4 h-4 absolute -top-1 -right-1 text-blue-600" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-slate-900">Redirecting to {provider || "Authorization"}</h3>
              <p className="text-sm text-slate-600">You'll be redirected to complete the authorization process{dots}</p>
            </div>

            <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 w-full">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                <span>Preparing secure connection</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
