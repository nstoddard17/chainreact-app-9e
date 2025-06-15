"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle, XCircle, AlertTriangle, ExternalLink, Copy } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface DebugInfo {
  success: boolean
  debug?: any
  error?: string
  recommendations?: string[]
}

export default function TwitterTroubleshootingGuide() {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const runDiagnostics = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/integrations/twitter/debug")
      const data = await response.json()
      setDebugInfo(data)
    } catch (error) {
      toast({
        title: "Diagnostics Failed",
        description: "Unable to run Twitter integration diagnostics",
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
      description: "Configuration copied to clipboard",
    })
  }

  const getStatusIcon = (status: boolean) => {
    return status ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>🐦</span>
            Twitter/X Integration Troubleshooting
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runDiagnostics} disabled={loading} className="w-full">
            {loading ? "Running Diagnostics..." : "Run Diagnostics"}
          </Button>

          {debugInfo && (
            <div className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Common Twitter OAuth Error:</strong> "Something went wrong - You weren't able to give access
                  to the App"
                  <br />
                  This usually indicates a configuration issue with your Twitter Developer App.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Environment Variables</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {debugInfo.debug?.requiredEnvVars &&
                      Object.entries(debugInfo.debug.requiredEnvVars).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm font-mono">{key}</span>
                          {getStatusIcon(value as boolean)}
                        </div>
                      ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Base URL</span>
                      <Badge variant="outline" className="text-xs">
                        {debugInfo.debug?.baseUrl}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Callback URL</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(debugInfo.debug?.redirectUri)}
                        className="h-6 px-2"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Twitter Developer App Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm font-medium text-blue-900">Required Callback URL:</p>
                      <code className="text-xs bg-white px-2 py-1 rounded border">
                        {debugInfo.debug?.twitterAppConfiguration?.expectedCallbackUrl}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(debugInfo.debug?.twitterAppConfiguration?.expectedCallbackUrl)}
                        className="ml-2 h-6 px-2"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>

                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-sm font-medium text-green-900">Required Scopes:</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {debugInfo.debug?.twitterAppConfiguration?.requiredScopes?.map((scope: string) => (
                          <Badge key={scope} variant="outline" className="text-xs">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {debugInfo.recommendations && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {debugInfo.recommendations.map((rec, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm">
                          <span className="text-blue-500 mt-1">•</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Step-by-Step Fix</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                        1
                      </span>
                      <div>
                        <p className="font-medium">Go to Twitter Developer Portal</p>
                        <Button variant="link" className="p-0 h-auto text-blue-600" asChild>
                          <a
                            href="https://developer.twitter.com/en/portal/dashboard"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open Twitter Developer Portal <ExternalLink className="w-3 h-3 ml-1" />
                          </a>
                        </Button>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                        2
                      </span>
                      <div>
                        <p className="font-medium">Update App Settings</p>
                        <p className="text-gray-600">Navigate to your app → App Settings → Authentication settings</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                        3
                      </span>
                      <div>
                        <p className="font-medium">Configure OAuth 2.0</p>
                        <p className="text-gray-600">Enable OAuth 2.0 and set the callback URL above</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                        4
                      </span>
                      <div>
                        <p className="font-medium">Set App Permissions</p>
                        <p className="text-gray-600">Ensure "Read and Write" permissions are enabled</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                        5
                      </span>
                      <div>
                        <p className="font-medium">Save and Test</p>
                        <p className="text-gray-600">Save changes and try connecting again</p>
                      </div>
                    </li>
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
