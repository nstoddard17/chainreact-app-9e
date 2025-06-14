"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, AlertCircle, Clock, Settings, ExternalLink, RefreshCw, Zap } from "lucide-react"
import { useIntegrationStore } from "@/stores/integrationStore"

interface IntegrationCardProps {
  provider: {
    id: string
    name: string
    description: string
    category: string
    icon: string
    color: string
    connected: boolean
    status: string
    connectedAt?: string
    lastSync?: string
    error?: string
    isAvailable: boolean
    scopes?: string[]
  }
}

const IntegrationCard = ({ provider }: IntegrationCardProps) => {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { connectIntegration, disconnectIntegration, refreshIntegration } = useIntegrationStore()

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      await connectIntegration(provider.id)
    } catch (error) {
      console.error(`Failed to connect ${provider.name}:`, error)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnectIntegration(provider.id)
    } catch (error) {
      console.error(`Failed to disconnect ${provider.name}:`, error)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshIntegration(provider.id)
    } catch (error) {
      console.error(`Failed to refresh ${provider.name}:`, error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const getStatusIcon = () => {
    switch (provider.status) {
      case "connected":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />
      default:
        return <Zap className="h-4 w-4 text-slate-400" />
    }
  }

  const getStatusBadge = () => {
    switch (provider.status) {
      case "connected":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
            Connected
          </Badge>
        )
      case "error":
        return <Badge variant="destructive">Error</Badge>
      case "pending":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
            Pending
          </Badge>
        )
      default:
        return <Badge variant="outline">Available</Badge>
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never"
    return new Date(dateString).toLocaleDateString()
  }

  return (
    <Card className="group hover:shadow-lg transition-all duration-200 border-slate-200 hover:border-slate-300">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
              style={{ backgroundColor: `${provider.color}15` }}
            >
              {provider.icon}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 group-hover:text-slate-700">{provider.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                {getStatusIcon()}
                {getStatusBadge()}
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-slate-600 mb-4 line-clamp-2">{provider.description}</p>

        {/* Connection Details */}
        {provider.connected && (
          <div className="space-y-2 mb-4 p-3 bg-slate-50 rounded-lg">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Connected:</span>
              <span className="text-slate-700">{formatDate(provider.connectedAt)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Last sync:</span>
              <span className="text-slate-700">{formatDate(provider.lastSync)}</span>
            </div>
            {provider.scopes && (
              <div className="text-xs">
                <span className="text-slate-500">Scopes:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {provider.scopes.slice(0, 3).map((scope) => (
                    <Badge key={scope} variant="outline" className="text-xs px-1 py-0">
                      {scope}
                    </Badge>
                  ))}
                  {provider.scopes.length > 3 && (
                    <Badge variant="outline" className="text-xs px-1 py-0">
                      +{provider.scopes.length - 3}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {provider.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-700">{provider.error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {provider.connected ? (
            <>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="flex-1">
                <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Syncing..." : "Refresh"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="flex-1">
                Disconnect
              </Button>
              <Button variant="ghost" size="sm" className="px-2">
                <Settings className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={handleConnect}
                disabled={isConnecting || !provider.isAvailable}
                className="flex-1"
                size="sm"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
              <Button variant="ghost" size="sm" className="px-2">
                <ExternalLink className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>

        {/* Category Badge */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <Badge variant="secondary" className="text-xs capitalize">
            {provider.category}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

export default IntegrationCard
