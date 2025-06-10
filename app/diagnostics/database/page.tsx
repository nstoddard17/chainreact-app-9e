"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, CheckCircle, XCircle, AlertTriangle, RefreshCw, Database, Table, Code, Key } from "lucide-react"
import AppLayout from "@/components/layout/AppLayout"

export default function DatabaseDiagnosticsPage() {
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const runDiagnostics = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/diagnostics/database")

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

  useEffect(() => {
    runDiagnostics()
  }, [])

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Database Diagnostics</h1>
              <p className="text-muted-foreground mt-2">Check your database connection and configuration</p>
            </div>
            <Button onClick={runDiagnostics} disabled={loading} className="flex items-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {loading ? "Running..." : "Run Diagnostics"}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading && !results ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">Running database diagnostics...</p>
            </div>
          ) : results ? (
            <Tabs defaultValue="overview">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="tables">Tables</TabsTrigger>
                <TabsTrigger value="schema">Schema</TabsTrigger>
                <TabsTrigger value="test">Integration Test</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      Connection Status
                    </CardTitle>
                    <CardDescription>Basic connection to your Supabase database</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Badge variant={results.connection ? "success" : "destructive"} className="h-6">
                          {results.connection ? (
                            <CheckCircle className="h-4 w-4 mr-1" />
                          ) : (
                            <XCircle className="h-4 w-4 mr-1" />
                          )}
                          {results.connection ? "Connected" : "Failed"}
                        </Badge>
                        {results.error && <span className="text-destructive text-sm">{results.error}</span>}
                      </div>

                      <div className="border rounded-md p-4 bg-muted/50">
                        <h3 className="font-medium mb-2 flex items-center gap-2">
                          <Key className="h-4 w-4" />
                          Environment Variables
                        </h3>
                        <div className="space-y-2">
                          {Object.entries(results.envCheck).map(([key, value]: [string, any]) => (
                            <div key={key} className="flex items-center gap-2">
                              <Badge variant={value ? "outline" : "destructive"} className="h-6">
                                {value ? (
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                ) : (
                                  <XCircle className="h-3 w-3 mr-1" />
                                )}
                                {key}
                              </Badge>
                              <span className="text-sm text-muted-foreground">{value ? "Available" : "Missing"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tables" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Table className="h-5 w-5" />
                      Required Tables
                    </CardTitle>
                    <CardDescription>Checking for the existence of required database tables</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(results.tables).map(([table, exists]: [string, any]) => (
                        <div key={table} className="flex items-center justify-between p-2 border rounded-md">
                          <div className="font-medium">{table}</div>
                          <Badge variant={exists ? "success" : "destructive"} className="h-6">
                            {exists ? <CheckCircle className="h-4 w-4 mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                            {exists ? "Exists" : "Missing"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <p className="text-sm text-muted-foreground">
                      {Object.values(results.tables).every(Boolean)
                        ? "All required tables exist in your database."
                        : "Some required tables are missing. Run the database setup scripts."}
                    </p>
                  </CardFooter>
                </Card>
              </TabsContent>

              <TabsContent value="schema" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Code className="h-5 w-5" />
                      Integrations Table Schema
                    </CardTitle>
                    <CardDescription>Examining the structure of your integrations table</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {results.schema.integrations ? (
                      <div className="border rounded-md overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-muted">
                            <tr>
                              <th className="px-4 py-2 text-left text-sm font-medium">Column</th>
                              <th className="px-4 py-2 text-left text-sm font-medium">Type</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.schema.integrations.map((column: any, i: number) => (
                              <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/50"}>
                                <td className="px-4 py-2 text-sm">{column.column_name}</td>
                                <td className="px-4 py-2 text-sm">{column.data_type}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Schema information unavailable</AlertTitle>
                        <AlertDescription>
                          Could not retrieve schema information for the integrations table.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="test" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Integration Test</CardTitle>
                    <CardDescription>
                      Testing if we can insert and delete a record in the integrations table
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {results.integrationTest ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge variant={results.integrationTest.success ? "success" : "destructive"} className="h-6">
                            {results.integrationTest.success ? (
                              <CheckCircle className="h-4 w-4 mr-1" />
                            ) : (
                              <XCircle className="h-4 w-4 mr-1" />
                            )}
                            {results.integrationTest.success ? "Success" : "Failed"}
                          </Badge>
                        </div>

                        {results.integrationTest.error && (
                          <Alert variant="destructive">
                            <AlertTitle>Error Details</AlertTitle>
                            <AlertDescription className="font-mono text-xs break-all">
                              {results.integrationTest.error}
                            </AlertDescription>
                          </Alert>
                        )}

                        {results.integrationTest.success && (
                          <Alert variant="success" className="bg-green-50 border-green-200">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <AlertTitle className="text-green-800">Test Passed</AlertTitle>
                            <AlertDescription className="text-green-700">
                              Successfully inserted and deleted a test record in the integrations table.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">No test results available</div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : null}

          {results && (
            <div className="mt-8 space-y-4">
              <h2 className="text-xl font-bold">Troubleshooting Steps</h2>

              <div className="space-y-2">
                {!results.connection && (
                  <Alert>
                    <AlertTitle>Connection Issues</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Verify your Supabase URL and API keys in environment variables</li>
                        <li>Check if your Supabase project is active and running</li>
                        <li>Ensure your IP is allowed in Supabase network restrictions</li>
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {results.connection && Object.values(results.tables).some((table) => !table) && (
                  <Alert>
                    <AlertTitle>Missing Tables</AlertTitle>
                    <AlertDescription>
                      <p className="mb-2">Run the database setup scripts to create the missing tables:</p>
                      <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                        {`-- Run in Supabase SQL Editor
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
);`}
                      </pre>
                    </AlertDescription>
                  </Alert>
                )}

                {results.integrationTest && !results.integrationTest.success && (
                  <Alert>
                    <AlertTitle>Integration Test Failed</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Check if your database user has proper permissions</li>
                        <li>Verify the integrations table schema matches the expected structure</li>
                        <li>Look for constraints that might be preventing insertions</li>
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
