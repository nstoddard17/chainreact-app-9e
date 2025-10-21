import React from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, ExternalLink } from "lucide-react"
import Link from "next/link"

interface AppItem {
  id: string
  name: string
  connected: boolean
  status?: string
}

interface AppsGridRendererProps {
  apps: AppItem[]
  maxDisplay?: number
}

export function AppsGridRenderer({ apps, maxDisplay = 6 }: AppsGridRendererProps) {
  // Sort: connected apps first
  const sortedApps = [...apps].sort((a, b) => {
    if (a.connected && !b.connected) return -1
    if (!a.connected && b.connected) return 1
    return 0
  })

  const displayedApps = sortedApps.slice(0, maxDisplay)
  const hasMore = apps.length > maxDisplay

  return (
    <div className="mt-4">
      {/* Apps Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {displayedApps.map((app) => {
          const isExpired = app.status === 'expired' || app.status === 'needs_reauthorization'

          return (
            <Card key={app.id} className="hover:shadow-md transition-all">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* App Icon */}
                  <div className="w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 bg-white dark:bg-slate-900">
                    <img
                      src={`/integrations/${app.id}.svg`}
                      alt={app.name}
                      className="w-6 h-6 object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>

                  {/* App Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm truncate">{app.name}</h3>
                      {app.connected && !isExpired && (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                    {app.connected ? (
                      isExpired ? (
                        <Badge variant="destructive" className="text-xs">Expired</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Connected</Badge>
                      )
                    ) : (
                      <Badge variant="secondary" className="text-xs">Available</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Link to Apps Page */}
      {hasMore && (
        <div className="mt-4 text-center">
          <Link
            href="/apps"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <span>and {apps.length - maxDisplay} more on the apps page</span>
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
