"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle, XCircle, AlertTriangle, Copy, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function TwitterDebugPanel() {
  const [validation, setValidation] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const runValidation = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/integrations/twitter/validate-config")
      const data = await response.json()
      setValidation(data)
    } catch (error) {
      toast({
        title: "Validation Failed",
        description: "Unable to validate Twitter configuration",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied",
      description: "Text copied to clipboard",
    })
  }

  const testConnection = async () => {
    try {
      const response = await fetch("/api/integrations/oauth/generate-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "twitter" }),
      })

      const data = await response.json()

      if (data.success) {
        window.location.href = data.authUrl
      } else {
        toast({
          title: "Connection Failed",
          description: data.error || "Failed to generate Twitter auth URL",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to test Twitter connection",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>🐦</span>
            Twitter Integration Debug Panel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={runValidation} disabled={loading} variant="outline">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Validate Config"}
            </Button>
            <Button onClick={testConnection} variant="default">
              Test Connection
            </Button>
          </div>

          {validation && (
            <div className="space-y-4">
              <Alert variant={validation.success ? "default" : "destructive"}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {validation.success
                    ? "✅ Configuration looks good!"
                    : `❌ Found ${validation.issues.length} configuration issues`}
                </AlertDescription>
              </Alert>

              {validation.issues.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-red-600">Issues Found</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {validation.issues.map((issue: string, index: number) => (
                        <li key={index} className="flex items-center gap-2 text-sm">
                          <XCircle className="w-4 h-4 text-red-500" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Configuration Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Client ID</span>
                    {validation.validation.hasClientId ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Client Secret</span>
                    {validation.validation.hasClientSecret ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Base URL</span>
                    {validation.validation.hasBaseUrl ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Required Callback URL</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
                    <code className="text-xs flex-1">{validation.validation.expectedCallbackUrl}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(validation.validation.expectedCallbackUrl)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Copy this URL and paste it in your Twitter app's callback URL settings
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Quick Fix Steps</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-2 text-sm">
                    {Object.entries(validation.instructions).map(([key, value]) => (
                      <li key={key} className="flex items-start gap-2">
                        <Badge variant="outline" className="text-xs">
                          {key.replace("step", "")}
                        </Badge>
                        <span>{value as string}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
