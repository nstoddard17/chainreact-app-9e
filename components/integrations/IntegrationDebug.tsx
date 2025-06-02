"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function IntegrationDebug() {
  const [debugData, setDebugData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchDebugData = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/integrations/debug")
      const data = await response.json()
      setDebugData(data)
    } catch (error) {
      console.error("Debug fetch failed:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDebugData()
  }, [])

  if (!debugData) return null

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-sm">Integration Debug Info</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-xs">
          <p>
            <strong>User ID:</strong> {debugData.user_id}
          </p>
          <p>
            <strong>Integrations Count:</strong> {debugData.integrations_count}
          </p>
          <Button onClick={fetchDebugData} disabled={loading} size="sm">
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
          {debugData.recent_integrations?.length > 0 && (
            <div className="mt-2">
              <strong>Recent Integrations:</strong>
              <ul className="list-disc list-inside mt-1">
                {debugData.recent_integrations.map((integration: any) => (
                  <li key={integration.id}>
                    {integration.provider} - {integration.status} ({new Date(integration.created_at).toLocaleString()})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
