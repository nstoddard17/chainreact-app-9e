import React from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Mail,
  Calendar,
  FileText,
  Users,
  Code,
  Database,
  Zap,
  ShoppingCart,
  DollarSign,
  Share2,
  MessageSquare,
  type LucideIcon
} from "lucide-react"

interface IntegrationStatusProps {
  provider: string
  providerName: string
  status: string
  connectedDate: string
  onDisconnect?: (provider: string) => void
}

// Map provider IDs to icons
const getProviderIcon = (provider: string): LucideIcon => {
  const iconMap: Record<string, LucideIcon> = {
    'gmail': Mail,
    'microsoft-outlook': Mail,
    'google-calendar': Calendar,
    'google-drive': FileText,
    'microsoft-onedrive': FileText,
    'dropbox': FileText,
    'box': FileText,
    'notion': FileText,
    'airtable': Database,
    'trello': FileText,
    'slack': MessageSquare,
    'discord': MessageSquare,
    'microsoft-teams': MessageSquare,
    'hubspot': Users,
    'shopify': ShoppingCart,
    'stripe': DollarSign,
    'paypal': DollarSign,
    'github': Code,
    'gitlab': Code,
    'twitter': Share2,
    'facebook': Share2,
    'instagram': Share2,
    'linkedin': Share2,
    'tiktok': Share2,
    'youtube': Share2,
  }

  return iconMap[provider] || Zap
}

export function IntegrationStatusRenderer({
  provider,
  providerName,
  status,
  connectedDate,
  onDisconnect
}: IntegrationStatusProps) {
  const Icon = getProviderIcon(provider)

  const handleDisconnect = () => {
    if (onDisconnect) {
      onDisconnect(provider)
    }
  }

  return (
    <Card className="mt-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          {/* Left side: Icon, Name, Date */}
          <div className="flex items-center gap-4">
            {/* Icon */}
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="w-6 h-6 text-primary" />
            </div>

            {/* Name and Date */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base">{providerName}</span>
                <Badge variant={status === 'connected' ? 'default' : 'destructive'}>
                  {status}
                </Badge>
              </div>
              <span className="text-sm text-muted-foreground">
                Connected on {connectedDate}
              </span>
            </div>
          </div>

          {/* Right side: Disconnect button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            className="text-destructive hover:text-destructive"
          >
            Disconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
