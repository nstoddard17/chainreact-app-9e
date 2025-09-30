"use client"

import React, { useState, useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Key, Plus, Settings, Loader2, AlertCircle, ExternalLink } from "lucide-react"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface APIKey {
  id: string
  name: string
  key_preview: string
}

interface APIKeySelectorProps {
  value?: string // Selected key ID
  onChange: (keyId: string) => void
  className?: string
  disabled?: boolean
}

export function APIKeySelector({ value, onChange, className, disabled }: APIKeySelectorProps) {
  const [apiKeys, setApiKeys] = useState<APIKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAPIKeys()
  }, [])

  async function loadAPIKeys() {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch("/api/user/ai-api-keys")
      if (response.ok) {
        const data = await response.json()
        setApiKeys(data.keys || [])

        // Auto-select first key if none selected
        if (!value && data.keys && data.keys.length > 0) {
          onChange(data.keys[0].id)
        }
      } else {
        // Don't throw error, just log it and continue with empty keys
        // This allows the component to work even if the API fails
        console.warn("API keys endpoint not available, using platform key by default")
        setApiKeys([])
      }
    } catch (error: any) {
      // Don't show error to user, just log it
      // The component will show "Using platform API key" message
      console.warn("Failed to load API keys (this is ok, will use platform key):", error)
      setApiKeys([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading API keys...</span>
      </div>
    )
  }

  // Don't show error - just fall through to show the "Using platform API key" message
  // This way the AI Agent can still be saved and used with platform key

  if (apiKeys.length === 0) {
    return (
      <Alert className="bg-muted/50 border-muted">
        <Key className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <div className="flex-1">
            <p className="font-medium mb-1">Using platform API key</p>
            <p className="text-xs text-muted-foreground">
              Add your own key to bypass usage limits
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings?tab=api" target="_blank">
              <Plus className="mr-2 h-4 w-4" />
              Add Key
              <ExternalLink className="ml-2 h-3 w-3" />
            </Link>
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Use platform API key (default)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Default</Badge>
                <span>Platform API Key</span>
              </div>
            </SelectItem>
            {apiKeys.map((key) => (
              <SelectItem key={key.id} value={key.id}>
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <span>{key.name}</span>
                  <span className="text-xs text-muted-foreground">
                    (••••{key.key_preview})
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button asChild variant="outline" size="icon">
          <Link href="/settings?tab=api" target="_blank">
            <Settings className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

interface ModelSelectorProps {
  value: string
  onChange: (model: string) => void
  className?: string
  disabled?: boolean
  showDetails?: boolean
}

const MODEL_OPTIONS = [
  {
    value: "gpt-4o",
    label: "GPT-4o",
    badges: ["Latest", "Most Capable"],
    description: "Best for complex reasoning and analysis",
  },
  {
    value: "gpt-4o-mini",
    label: "GPT-4o Mini",
    badges: ["Recommended", "Cost-Efficient"],
    description: "Great balance of capability and cost",
  },
  {
    value: "gpt-4-turbo",
    label: "GPT-4 Turbo",
    badges: ["Fast"],
    description: "Previous generation, still very capable",
  },
  {
    value: "gpt-3.5-turbo",
    label: "GPT-3.5 Turbo",
    badges: ["Budget"],
    description: "Good for simple tasks and high volume",
  },
]

export function ModelSelector({ value, onChange, className, disabled, showDetails = false }: ModelSelectorProps) {
  const selectedModel = MODEL_OPTIONS.find(m => m.value === value)

  return (
    <div className={className}>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {MODEL_OPTIONS.map((model) => (
            <SelectItem key={model.value} value={model.value}>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{model.label}</span>
                  {model.badges.map((badge) => (
                    <Badge key={badge} variant="secondary" className="text-xs">
                      {badge}
                    </Badge>
                  ))}
                </div>
                {showDetails && (
                  <span className="text-xs text-muted-foreground">
                    {model.description}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showDetails && selectedModel && (
        <p className="text-sm text-muted-foreground mt-2">
          {selectedModel.description}
        </p>
      )}
    </div>
  )
}