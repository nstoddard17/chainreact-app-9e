"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export default function PayPalDebugHelper() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [urlInfo, setUrlInfo] = useState<any>(null)
  const [popupResult, setPopupResult] = useState<string | null>(null)

  // Run diagnostic check to see what's in environment 
  const checkEnvironment = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch("/api/integrations/paypal/debug")
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`)
      }
      
      const data = await response.json()
      setDebugInfo(data)
    } catch (err: any) {
      setError(err.message || "Failed to check environment")
    } finally {
      setLoading(false)
    }
  }

  // Generate OAuth URL directly and display it rather than opening a popup
  const generateAuthUrl = async () => {
    setLoading(true)
    setError(null)
    setUrlInfo(null)
    
    try {
      const response = await fetch("/api/integrations/auth/generate-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          provider: "paypal"
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate URL")
      }
      
      const data = await response.json()
      setUrlInfo(data)
    } catch (err: any) {
      setError(err.message || "Failed to generate URL")
    } finally {
      setLoading(false)
    }
  }

  // Test popup window
  const testPopup = () => {
    setPopupResult(null)
    
    try {
      const baseUrl = getBaseUrl()
      const testUrl = `${baseUrl}/api/integrations/paypal/debug`
      const popup = window.open(testUrl, "test_popup", "width=600,height=700")
      
      if (!popup) {
        setPopupResult("❌ Popup was blocked. Please allow popups for this site.")
        return
      }
      
      setPopupResult("✓ Popup opened successfully. Check if it loaded properly.")
      
      // Monitor if popup is closed
      const timer = setInterval(() => {
        if (popup.closed) {
          setPopupResult(prev => prev + " (Popup was closed.)")
          clearInterval(timer)
        }
      }, 500)
      
      // Auto-close after 5 seconds
      setTimeout(() => {
        if (!popup.closed) {
          popup.close()
          clearInterval(timer)
          setPopupResult(prev => prev + " (Auto-closed after 5 seconds.)")
        }
      }, 5000)
    } catch (err: any) {
      setPopupResult(`❌ Error: ${err.message}`)
    }
  }

  // Directly open the PayPal auth URL in same window (no popup)
  const openAuthDirectly = () => {
    if (!urlInfo?.authUrl) {
      setError("Generate the auth URL first")
      return
    }
    
    window.location.href = urlInfo.authUrl
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>PayPal Connection Debug</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <p>{error}</p>
          </Alert>
        )}

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <Button onClick={checkEnvironment} disabled={loading}>
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking...</> : "Check Environment"}
          </Button>
          
          <Button onClick={generateAuthUrl} disabled={loading}>
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</> : "Generate Auth URL"}
          </Button>
          
          <Button onClick={testPopup} disabled={loading} variant="outline">
            Test Popup Window
          </Button>
          
          {urlInfo?.authUrl && (
            <Button onClick={openAuthDirectly} variant="secondary">
              Open Auth URL Directly (No Popup)
            </Button>
          )}
        </div>

        {popupResult && (
          <div className="p-4 rounded bg-muted">
            <h3 className="font-semibold mb-2">Popup Test Result</h3>
            <p>{popupResult}</p>
          </div>
        )}

        {debugInfo && (
          <div className="p-4 rounded bg-muted">
            <h3 className="font-semibold mb-2">Environment Info</h3>
            <pre className="text-xs overflow-auto max-h-60">{JSON.stringify(debugInfo, null, 2)}</pre>
          </div>
        )}

        {urlInfo && (
          <div className="p-4 rounded bg-muted">
            <h3 className="font-semibold mb-2">Auth URL Info</h3>
            <p className="mb-2 text-sm"><b>Generated URL:</b></p>
            <div className="bg-background p-2 rounded text-xs break-all mb-2">
              {urlInfo.authUrl}
            </div>
            <pre className="text-xs overflow-auto max-h-60">{JSON.stringify(urlInfo, null, 2)}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 