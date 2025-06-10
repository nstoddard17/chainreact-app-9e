"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, CheckCircle, XCircle, AlertTriangle, RefreshCw, Bug, Play, Copy } from "lucide-react"
import AppLayout from "@/components/layout/AppLayout"

export default function IntegrationsDiagnosticsPage() {
  const [loading, setLoading] = useState(true)
  const [testLoading, setTestLoading] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [testResults, setTestResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const runDiagnostics = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/diagnostics/integrations")
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`)
      }
      const data = await response.json()
      setResults(data)
    } catch (err: any) {
      setError(err.message || "Failed to run diagnostics")
    } finally {
      setLoading(false)
    }
  }

  const runIntegrationTest = async () => {
    setTestLoading(true)
    try {
      const response = await fetch("/api/diagnostics/test-integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "diagnostic-test" }),
      })
      const data = await response.json()
      setTestResults(data)
    } catch (err: any) {
      setTestResults({ error: err.message, success: false })
    } finally {
      setTestLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  useEffect(() => {
    runDiagnostics()
  }, [])

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Integration Diagnostics</h1>
              <p className="text-muted-foreground mt-2">Diagnose integration connection and saving issues</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={runIntegrationTest} disabled={testLoading} variant="outline">
                {testLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                Run Test
              </Button>
              <Button onClick={runDiagnostics} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {loading ? "Running..." : "Refresh"}
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading && !results ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">Running integration diagnostics...</p>
            </div>
          ) : results ? (
            <Tabs defaultValue="overview">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="database">Database</TabsTrigger>
                <TabsTrigger value="auth">Authentication</TabsTrigger>
                <TabsTrigger value="integrations">Integrations</TabsTrigger>
                <TabsTrigger value="test">Live Test</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">Database Connection</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge variant={results.database.connection ? "success" : "destructive"}>
                        {results.database.connection ? (
                          <CheckCircle className="h-4 w-4 mr-1" />
                        ) : (
                          <XCircle className="h-4 w-4 mr-1" />
                        )}
                        {results.database.connection ? "Connected" : "Failed"}
                      </Badge>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">Integrations Table</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge variant={results.database.tables.integrations ? "success" : "destructive"}>
                        {results.database.tables.integrations ? (
                          <CheckCircle className="h-4 w-4 mr-1" />
                        ) : (
                          <XCircle className="h-4 w-4 mr-1" />
                        )}
                        {results.database.tables.integrations ? "Exists" : "Missing"}
                      </Badge>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">User Authentication</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge variant={results.auth.user ? "success" : "destructive"}>
                        {results.auth.user ? (
                          <CheckCircle className="h-4 w-4 mr-1" />
                        ) : (
                          <XCircle className="h-4 w-4 mr-1" />
                        )}
                        {results.auth.user ? "Authenticated" : "Not Authenticated"}
                      </Badge>
                    </CardContent>
                  </Card>
                </div>

                {results.recommendations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Bug className="h-5 w-5" />
                        Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {results.recommendations.map((rec: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                            <span className="text-sm">{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="database" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Database Status</CardTitle>
                    <CardDescription>Connection and table information</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Environment Variables</h4>
                      <div className="space-y-2">
                        {Object.entries(results.environment).map(([key, value]: [string, any]) => (
                          <div key={key} className="flex items-center justify-between p-2 border rounded">
                            <span className="font-mono text-sm">{key}</span>
                            <Badge variant={value ? "outline" : "destructive"}>
                              {typeof value === "boolean" ? (value ? "Set" : "Missing") : "Set"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Tables</h4>
                      <div className="space-y-2">
                        {Object.entries(results.database.tables).map(([table, exists]: [string, any]) => (
                          <div key={table} className="flex items-center justify-between p-2 border rounded">
                            <span className="font-mono text-sm">{table}</span>
                            <Badge variant={exists ? "success" : "destructive"}>{exists ? "Exists" : "Missing"}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {results.database.schema && (
                      <div>
                        <h4 className="font-medium mb-2">Integrations Table Schema</h4>
                        <div className="border rounded overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted">
                              <tr>
                                <th className="px-3 py-2 text-left">Column</th>
                                <th className="px-3 py-2 text-left">Type</th>
                                <th className="px-3 py-2 text-left">Nullable</th>
                              </tr>
                            </thead>
                            <tbody>
                              {results.database.schema.map((col: any, i: number) => (
                                <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/50"}>
                                  <td className="px-3 py-2 font-mono">{col.column_name}</td>
                                  <td className="px-3 py-2">{col.data_type}</td>
                                  <td className="px-3 py-2">{col.is_nullable}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="auth" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Authentication Status</CardTitle>
                    <CardDescription>Current user and session information</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {results.auth.user ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="success">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Authenticated
                          </Badge>
                        </div>
                        <div className="bg-muted p-3 rounded">
                          <p className="text-sm">
                            <strong>User ID:</strong> {results.auth.user.id}
                          </p>
                          <p className="text-sm">
                            <strong>Email:</strong> {results.auth.user.email}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Badge variant="destructive">
                          <XCircle className="h-4 w-4 mr-1" />
                          Not Authenticated
                        </Badge>
                        <p className="text-sm text-muted-foreground">You need to be logged in to save integrations.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="integrations" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Integration Data</CardTitle>
                    <CardDescription>Current integrations in your database</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-bold">{results.integrations.count}</div>
                      <div className="text-sm text-muted-foreground">Total integrations</div>
                    </div>

                    {results.integrations.samples.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Sample Records</h4>
                        <div className="space-y-2">
                          {results.integrations.samples.map((sample: any, i: number) => (
                            <div key={i} className="border rounded p-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{sample.provider}</span>
                                <Badge variant={sample.status === "connected" ? "success" : "outline"}>
                                  {sample.status}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground space-y-1">
                                <p>User: {sample.user_id}</p>
                                <p>Created: {new Date(sample.created_at).toLocaleString()}</p>
                                <p>
                                  Tokens: {sample.has_access_token ? "✓" : "✗"} Access,{" "}
                                  {sample.has_refresh_token ? "✓" : "✗"} Refresh
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {results.integrations.errors.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 text-destructive">Errors</h4>
                        <div className="space-y-2">
                          {results.integrations.errors.map((error: string, i: number) => (
                            <Alert key={i} variant="destructive">
                              <AlertDescription className="text-xs font-mono">{error}</AlertDescription>
                            </Alert>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="test" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Live Integration Test</CardTitle>
                    <CardDescription>Test creating, updating, and deleting integration records</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button onClick={runIntegrationTest} disabled={testLoading} className="w-full">
                      {testLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      {testLoading ? "Running Test..." : "Run Integration Test"}
                    </Button>

                    {testResults && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge variant={testResults.success ? "success" : "destructive"}>
                            {testResults.success ? (
                              <CheckCircle className="h-4 w-4 mr-1" />
                            ) : (
                              <XCircle className="h-4 w-4 mr-1" />
                            )}
                            {testResults.success ? "All Tests Passed" : "Tests Failed"}
                          </Badge>
                          {testResults.user_id && (
                            <span className="text-xs text-muted-foreground">User: {testResults.user_id}</span>
                          )}
                        </div>

                        {testResults.error && (
                          <Alert variant="destructive">
                            <AlertTitle>Test Error</AlertTitle>
                            <AlertDescription className="font-mono text-xs">{testResults.error}</AlertDescription>
                          </Alert>
                        )}

                        {testResults.steps && (
                          <div>
                            <h4 className="font-medium mb-2">Test Steps</h4>
                            <div className="space-y-2">
                              {testResults.steps.map((step: any, i: number) => (
                                <div key={i} className="flex items-center justify-between p-2 border rounded">
                                  <div className="flex items-center gap-2">
                                    <Badge variant={step.success ? "success" : "destructive"} className="text-xs">
                                      {step.success ? (
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                      ) : (
                                        <XCircle className="h-3 w-3 mr-1" />
                                      )}
                                      {step.step}
                                    </Badge>
                                    {step.error && (
                                      <span className="text-xs text-destructive font-mono">{step.error}</span>
                                    )}
                                  </div>
                                  {step.data && <span className="text-xs text-muted-foreground">{step.data}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : null}

          {results && results.integrations.errors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-destructive">Quick Fix SQL</CardTitle>
                <CardDescription>Run this SQL in your Supabase SQL editor to fix common issues</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="bg-muted p-4 rounded text-xs overflow-x-auto">
                    {`-- Fix integrations table structure
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  status TEXT DEFAULT 'connected',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Users can manage their own integrations" ON integrations
  FOR ALL USING (auth.uid() = user_id);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_integrations_user_provider 
ON integrations(user_id, provider);`}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-2 right-2"
                    onClick={() =>
                      copyToClipboard(`-- Fix integrations table structure
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  status TEXT DEFAULT 'connected',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Users can manage their own integrations" ON integrations
  FOR ALL USING (auth.uid() = user_id);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_integrations_user_provider 
ON integrations(user_id, provider);`)
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
