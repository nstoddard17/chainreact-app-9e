"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle, AlertTriangle, XCircle, RefreshCw, Eye, EyeOff } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

import { logger } from '@/lib/utils/logger'

interface DiagnosticResult {
  integrationId: string
  provider: string
  status: "✅ Connected & functional" | "⚠️ Connected but limited" | "❌ Connected but broken"
  tokenValid: boolean
  grantedScopes: string[]
  requiredScopes: string[]
  missingScopes: string[]
  availableComponents: string[]
  unavailableComponents: string[]
  recommendations: string[]
  details: {
    tokenExpiry?: string
    lastVerified?: string
    errorMessage?: string
    connectionType?: "oauth" | "demo" | "api_key"
  }
}

export default function IntegrationDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const runDiagnostics = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/integrations/diagnose")
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      setDiagnostics(data.diagnostics)
    } catch (error) {
      logger.error("Failed to run diagnostics:", error)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpanded = (integrationId: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(integrationId)) {
      newExpanded.delete(integrationId)
    } else {
      newExpanded.add(integrationId)
    }
    setExpandedItems(newExpanded)
  }

  const getStatusIcon = (status: DiagnosticResult["status"]) => {
    switch (status) {
      case "✅ Connected & functional":
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case "⚠️ Connected but limited":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case "❌ Connected but broken":
        return <XCircle className="h-5 w-5 text-red-500" />
    }
  }

  const getStatusColor = (status: DiagnosticResult["status"]) => {
    switch (status) {
      case "✅ Connected & functional":
        return "bg-green-100 text-green-800 border-green-200"
      case "⚠️ Connected but limited":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "❌ Connected but broken":
        return "bg-red-100 text-red-800 border-red-200"
    }
  }

  const functionalCount = diagnostics.filter((d) => d.status === "✅ Connected & functional").length
  const limitedCount = diagnostics.filter((d) => d.status === "⚠️ Connected but limited").length
  const brokenCount = diagnostics.filter((d) => d.status === "❌ Connected but broken").length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Integration Diagnostics</h2>
          <p className="text-gray-600">Analyze your connected integrations and their available components</p>
        </div>
        <Button onClick={runDiagnostics} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Running Diagnostics...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Run Diagnostics
            </>
          )}
        </Button>
      </div>

      {diagnostics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold text-green-600">{functionalCount}</div>
                  <div className="text-sm text-gray-600">Fully Functional</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <div>
                  <div className="text-2xl font-bold text-yellow-600">{limitedCount}</div>
                  <div className="text-sm text-gray-600">Limited Functionality</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <div className="text-2xl font-bold text-red-600">{brokenCount}</div>
                  <div className="text-sm text-gray-600">Broken/Expired</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-4">
        {diagnostics.map((diagnostic) => (
          <Card key={diagnostic.integrationId} className="border-l-4 border-l-gray-300">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(diagnostic.status)}
                      <div>
                        <CardTitle className="text-lg capitalize">{diagnostic.provider}</CardTitle>
                        <Badge className={`${getStatusColor(diagnostic.status)} text-xs`}>{diagnostic.status}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right text-sm">
                        <div className="text-green-600 font-medium">
                          {diagnostic.availableComponents.length} components available
                        </div>
                        {diagnostic.unavailableComponents.length > 0 && (
                          <div className="text-red-600">
                            {diagnostic.unavailableComponents.length} components unavailable
                          </div>
                        )}
                      </div>
                      {expandedItems.has(diagnostic.integrationId) ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Token & Connection Info */}
                    <div>
                      <h4 className="font-semibold mb-2">Connection Details</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Token Valid:</span>
                          <Badge variant={diagnostic.tokenValid ? "default" : "destructive"}>
                            {diagnostic.tokenValid ? "Yes" : "No"}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Connection Type:</span>
                          <Badge variant="outline">{diagnostic.details.connectionType}</Badge>
                        </div>
                        {diagnostic.details.tokenExpiry && (
                          <div className="flex justify-between">
                            <span>Token Expires:</span>
                            <span>
                              {new Date(diagnostic.details.tokenExpiry).toLocaleDateString()} at{" "}
                              {new Date(diagnostic.details.tokenExpiry).toLocaleTimeString()}
                            </span>
                          </div>
                        )}
                        {diagnostic.details.errorMessage && (
                          <div className="text-red-600 text-xs mt-2">
                            <strong>Error:</strong> {diagnostic.details.errorMessage}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Scopes Analysis */}
                    <div>
                      <h4 className="font-semibold mb-2">Scope Analysis</h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-green-600 font-medium">
                            Granted Scopes ({diagnostic.grantedScopes.length}):
                          </span>
                          <div className="mt-1 space-y-1">
                            {diagnostic.grantedScopes.map((scope) => (
                              <Badge key={scope} variant="outline" className="text-xs mr-1 mb-1">
                                {scope}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {diagnostic.missingScopes.length > 0 && (
                          <div>
                            <span className="text-red-600 font-medium">
                              Missing Scopes ({diagnostic.missingScopes.length}):
                            </span>
                            <div className="mt-1 space-y-1">
                              {diagnostic.missingScopes.map((scope) => (
                                <Badge key={scope} variant="destructive" className="text-xs mr-1 mb-1">
                                  {scope}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Available Components */}
                    <div>
                      <h4 className="font-semibold mb-2 text-green-600">
                        Available Components ({diagnostic.availableComponents.length})
                      </h4>
                      <div className="space-y-1">
                        {diagnostic.availableComponents.map((component) => (
                          <div key={component} className="text-sm text-green-700">
                            ✓ {component.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Unavailable Components */}
                    {diagnostic.unavailableComponents.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-red-600">
                          Unavailable Components ({diagnostic.unavailableComponents.length})
                        </h4>
                        <div className="space-y-1">
                          {diagnostic.unavailableComponents.map((component) => (
                            <div key={component} className="text-sm text-red-700">
                              ✗ {component.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recommendations */}
                  {diagnostic.recommendations.length > 0 && (
                    <div className="mt-6 p-4 bg-orange-50 rounded-lg">
                      <h4 className="font-semibold mb-2 text-orange-800">Recommendations</h4>
                      <ul className="space-y-1">
                        {diagnostic.recommendations.map((rec, index) => (
                          <li key={index} className="text-sm text-orange-700">
                            • {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>

      {diagnostics.length === 0 && !loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-gray-500">Click "Run Diagnostics" to analyze your connected integrations</div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
