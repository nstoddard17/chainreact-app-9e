"use client"

import { useEffect, useState } from "react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { Bell, AlertCircle } from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { getProviderDisplayName } from "@/lib/utils/provider-names"

export function NotificationDropdown() {
  const { integrations } = useIntegrationStore()
  const [integrationIssues, setIntegrationIssues] = useState<Array<{
    id: string
    name: string
    provider: string
    issue: string
  }>>([])

  // Check for integration issues
  useEffect(() => {
    const checkIntegrations = () => {
      const now = new Date()
      const issues: typeof integrationIssues = []

      integrations.forEach(integration => {
        // Check database status first
        if (integration.status === 'needs_reauthorization') {
          issues.push({
            id: integration.id,
            name: getProviderDisplayName(integration.provider),
            provider: integration.provider,
            issue: 'Needs reauthorization'
          })
        } else if (integration.status === 'expired') {
          issues.push({
            id: integration.id,
            name: getProviderDisplayName(integration.provider),
            provider: integration.provider,
            issue: 'Connection expired'
          })
        } else if (integration.status === 'connected' && integration.expires_at) {
          // Check if connected integration has expired based on expires_at timestamp
          const expiresAt = new Date(integration.expires_at)
          const expiryTimestamp = expiresAt.getTime()
          const nowTimestamp = now.getTime()
          
          // If expired (past the expiry time)
          if (expiryTimestamp <= nowTimestamp) {
            issues.push({
              id: integration.id,
              name: getProviderDisplayName(integration.provider),
              provider: integration.provider,
              issue: 'Token expired'
            })
          }
        }
      })

      setIntegrationIssues(issues)
    }

    checkIntegrations()
    // Check periodically
    const interval = setInterval(checkIntegrations, 30000) // Check every 30 seconds
    
    return () => clearInterval(interval)
  }, [integrations])

  // Don't show the bell if there are no issues
  if (integrationIssues.length === 0) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4 text-yellow-500 animate-pulse" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-80 bg-gray-900/95 backdrop-blur-sm border border-gray-700">
        <div className="px-3 py-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            Integration Issues ({integrationIssues.length})
          </h3>
        </div>
        <DropdownMenuSeparator className="bg-gray-700" />
        
        <div className="max-h-64 overflow-y-auto">
          {integrationIssues.map((issue, index) => (
            <DropdownMenuItem key={issue.id} asChild>
              <Link 
                href="/integrations" 
                className="flex flex-col gap-1 px-3 py-2 text-gray-200 hover:text-white hover:bg-gray-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {issue.name}
                  </span>
                  <span className="text-xs text-yellow-400 whitespace-nowrap">
                    {issue.issue}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  Click to fix this integration
                </span>
              </Link>
            </DropdownMenuItem>
          ))}
        </div>
        
        <DropdownMenuSeparator className="bg-gray-700" />
        <div className="px-3 py-2">
          <Link href="/integrations">
            <Button 
              size="sm" 
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              Fix All Issues
            </Button>
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}