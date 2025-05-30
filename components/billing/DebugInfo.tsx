"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff } from "lucide-react"

export default function DebugInfo() {
  const [showDebug, setShowDebug] = useState(false)

  if (process.env.NODE_ENV === "production") {
    return null
  }

  const debugInfo = {
    "Current URL": typeof window !== "undefined" ? window.location.href : "N/A",
    Origin: typeof window !== "undefined" ? window.location.origin : "N/A",
    Host: typeof window !== "undefined" ? window.location.host : "N/A",
    Protocol: typeof window !== "undefined" ? window.location.protocol : "N/A",
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "Not set",
  }

  return (
    <Card className="border-yellow-200 bg-yellow-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-yellow-800">Debug Information</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDebug(!showDebug)}
            className="text-yellow-700 hover:text-yellow-800"
          >
            {showDebug ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      {showDebug && (
        <CardContent>
          <div className="space-y-2 text-sm">
            {Object.entries(debugInfo).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="font-medium text-yellow-800">{key}:</span>
                <span className="text-yellow-700 font-mono text-xs">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
