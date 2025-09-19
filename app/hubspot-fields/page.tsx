'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Loader2, Eye, EyeOff } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface ContactProperty {
  name: string
  label: string
  type: string
  fieldType?: string
  description?: string
  groupName?: string
  options?: Array<{ label: string; value: string }>
  isVisible?: boolean
  isCommonlyDisplayed?: boolean
  isCustom?: boolean
  isRequired?: boolean
  hasOptions?: boolean
  displayOrder?: number
  createdAt?: string
  updatedAt?: string
  formField?: boolean
}

export default function HubSpotFieldsPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tableColumns, setTableColumns] = useState<ContactProperty[]>([])
  const [allProperties, setAllProperties] = useState<ContactProperty[]>([])
  const [showAllProperties, setShowAllProperties] = useState(false)
  const [source, setSource] = useState<string>("")

  const fetchTableColumns = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch visible table columns
      const response = await fetch('/api/integrations/hubspot/contact-view-columns')

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch table columns')
      }

      const data = await response.json()
      setTableColumns(data.data || [])
      setSource(data.source || "")

      // Also fetch all available properties
      const allPropsResponse = await fetch('/api/integrations/hubspot/contact-properties')
      if (allPropsResponse.ok) {
        const allPropsData = await allPropsResponse.json()
        setAllProperties(allPropsData.data || [])
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTableColumns()
  }, [])

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'string':
      case 'text':
        return 'bg-blue-100 text-blue-800'
      case 'enumeration':
      case 'select':
        return 'bg-green-100 text-green-800'
      case 'email':
        return 'bg-purple-100 text-purple-800'
      case 'phone_number':
        return 'bg-orange-100 text-orange-800'
      case 'date':
      case 'datetime':
        return 'bg-yellow-100 text-yellow-800'
      case 'number':
        return 'bg-pink-100 text-pink-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>HubSpot Contact Table Fields</CardTitle>
              <CardDescription>
                View the fields currently visible in your HubSpot contacts table
                {source && (
                  <span className="ml-2 text-xs">
                    (Source: {source === 'fallback' ? 'Default columns' : source === 'view-api' ? 'HubSpot View API' : source})
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllProperties(!showAllProperties)}
              >
                {showAllProperties ? (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    Show Table Fields Only
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4 mr-2" />
                    Show All Properties
                  </>
                )}
              </Button>
              <Button
                onClick={fetchTableColumns}
                disabled={loading}
                size="sm"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading && !tableColumns.length ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-2">
                  {showAllProperties ? 'All Contact Properties' : 'HubSpot Contact Properties'}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {showAllProperties
                    ? `Total: ${allProperties.length} properties available`
                    : `Total: ${tableColumns.length} properties found in HubSpot`}
                </p>
                {source === 'all-properties' && (
                  <Alert className="mb-4">
                    <AlertDescription>
                      <strong>Note:</strong> Showing all HubSpot contact properties. Properties marked as "Commonly Displayed" are typically shown in contact tables.
                      Custom fields you've added will appear with a "Custom" badge. Your newly added field should appear here if it's been created in HubSpot.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="space-y-3">
                {(showAllProperties ? allProperties : tableColumns).map((field, index) => (
                  <div
                    key={field.name}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm">{field.name}</span>
                          <Badge variant="outline" className={getTypeColor(field.type)}>
                            {field.type}
                          </Badge>
                          {field.isCommonlyDisplayed && (
                            <Badge variant="default" className="bg-blue-600">
                              Commonly Displayed
                            </Badge>
                          )}
                          {field.isCustom && (
                            <Badge variant="default" className="bg-purple-600">
                              Custom
                            </Badge>
                          )}
                          {field.isRequired && (
                            <Badge variant="default" className="bg-red-600">
                              Required
                            </Badge>
                          )}
                          {field.hasOptions && (
                            <Badge variant="outline" className="bg-green-100">
                              Dropdown
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm font-medium">{field.label}</div>
                        {field.description && (
                          <p className="text-xs text-muted-foreground mt-1">{field.description}</p>
                        )}
                        {field.groupName && (
                          <p className="text-xs text-muted-foreground mt-1">Group: {field.groupName}</p>
                        )}
                      </div>
                    </div>

                    {field.options && field.options.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium mb-1">Options:</p>
                        <div className="flex flex-wrap gap-1">
                          {field.options.map((option) => (
                            <Badge
                              key={option.value}
                              variant="secondary"
                              className="text-xs"
                            >
                              {option.label} ({option.value})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {!showAllProperties && tableColumns.length > 0 && (
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">How to use these fields:</h4>
                  <ol className="text-sm space-y-1 list-decimal list-inside">
                    <li>These are the exact fields visible in your HubSpot contacts table</li>
                    <li>When creating contacts via ChainReact, only these fields will be populated</li>
                    <li>Fields marked with options are dropdown/enumeration fields</li>
                    <li>The order shown matches your HubSpot table column order</li>
                  </ol>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}