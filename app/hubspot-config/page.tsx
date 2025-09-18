'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { RefreshCw, Loader2, Save, Wand2, Check } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface ContactProperty {
  name: string
  label: string
  type: string
  groupName?: string
  isSelected?: boolean
  usagePercentage?: number
}

export default function HubSpotConfigPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [allProperties, setAllProperties] = useState<ContactProperty[]>([])
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [fieldAnalysis, setFieldAnalysis] = useState<any>(null)

  // Fetch all properties and current preferences
  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch all properties
      const propsResponse = await fetch('/api/integrations/hubspot/contact-properties')
      if (propsResponse.ok) {
        const propsData = await propsResponse.json()
        setAllProperties(propsData.data || [])
      }

      // Fetch user preferences
      const prefsResponse = await fetch('/api/user/hubspot-field-preferences')
      if (prefsResponse.ok) {
        const prefsData = await prefsResponse.json()
        setSelectedFields(prefsData.fields || [])
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Analyze field usage
  const analyzeUsage = async () => {
    setAnalyzing(true)
    setError(null)

    try {
      const response = await fetch('/api/integrations/hubspot/detect-used-fields')
      if (!response.ok) {
        throw new Error('Failed to analyze field usage')
      }

      const data = await response.json()
      setFieldAnalysis(data)

      // Auto-select commonly used fields
      if (data.commonlyUsedFields) {
        setSelectedFields(data.commonlyUsedFields)
        setSuccess(`Auto-selected ${data.commonlyUsedFields.length} commonly used fields based on your data`)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  // Save preferences
  const savePreferences = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/user/hubspot-field-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: selectedFields })
      })

      if (!response.ok) {
        throw new Error('Failed to save preferences')
      }

      setSuccess('Your field preferences have been saved successfully!')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const toggleField = (fieldName: string) => {
    setSelectedFields(prev =>
      prev.includes(fieldName)
        ? prev.filter(f => f !== fieldName)
        : [...prev, fieldName]
    )
  }

  const groupedProperties = allProperties.reduce((groups, prop) => {
    const group = prop.groupName || 'Other'
    if (!groups[group]) groups[group] = []
    groups[group].push(prop)
    return groups
  }, {} as Record<string, ContactProperty[]>)

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Configure HubSpot Contact Fields</CardTitle>
              <CardDescription>
                Select which fields should appear in your Create Contact forms
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={analyzeUsage}
                disabled={analyzing}
                variant="outline"
              >
                {analyzing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-2" />
                )}
                Auto-Detect
              </Button>
              <Button
                onClick={fetchData}
                disabled={loading}
                variant="outline"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Refresh
              </Button>
              <Button
                onClick={savePreferences}
                disabled={saving || selectedFields.length === 0}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Configuration
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

          {success && (
            <Alert className="mb-4 border-green-500 bg-green-50">
              <Check className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          {fieldAnalysis && (
            <Alert className="mb-4">
              <AlertDescription>
                <strong>Analysis Complete:</strong> Analyzed {fieldAnalysis.analyzedContacts} contacts.
                Found {fieldAnalysis.totalFieldsFound} fields in use.
                {fieldAnalysis.recommendation}
              </AlertDescription>
            </Alert>
          )}

          <div className="mb-4 p-4 bg-muted rounded-lg">
            <p className="text-sm mb-2">
              <strong>Selected Fields:</strong> {selectedFields.length} fields
            </p>
            <p className="text-xs text-muted-foreground">
              These fields will appear in your HubSpot Create Contact forms in ChainReact workflows.
              Email is always included by default.
            </p>
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList>
              <TabsTrigger value="all">All Fields</TabsTrigger>
              <TabsTrigger value="selected">Selected Only</TabsTrigger>
              <TabsTrigger value="analysis">Usage Analysis</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {Object.entries(groupedProperties).map(([group, properties]) => (
                <div key={group} className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">{group}</h3>
                  <div className="space-y-2">
                    {properties.map(prop => (
                      <div
                        key={prop.name}
                        className="flex items-center space-x-3 p-2 hover:bg-muted rounded"
                      >
                        <Checkbox
                          checked={selectedFields.includes(prop.name) || prop.name === 'email'}
                          onCheckedChange={() => toggleField(prop.name)}
                          disabled={prop.name === 'email'}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{prop.label}</span>
                            <code className="text-xs bg-muted px-1 rounded">{prop.name}</code>
                            <Badge variant="outline" className="text-xs">
                              {prop.type}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="selected" className="space-y-2">
              {selectedFields.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No fields selected. Select fields from the "All Fields" tab.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedFields.map(fieldName => {
                    const field = allProperties.find(p => p.name === fieldName)
                    if (!field) return null
                    return (
                      <div
                        key={fieldName}
                        className="flex items-center justify-between p-3 border rounded"
                      >
                        <div>
                          <span className="font-medium">{field.label}</span>
                          <code className="ml-2 text-xs bg-muted px-1 rounded">
                            {field.name}
                          </code>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleField(fieldName)}
                          disabled={fieldName === 'email'}
                        >
                          Remove
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="analysis">
              {!fieldAnalysis ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    Click "Auto-Detect" to analyze your contact data and see which fields are commonly used.
                  </p>
                  <Button onClick={analyzeUsage} disabled={analyzing}>
                    {analyzing ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4 mr-2" />
                    )}
                    Analyze Field Usage
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="font-semibold mb-2">Field Usage Analysis</h3>
                  {fieldAnalysis.fieldAnalysis?.map((field: any) => (
                    <div key={field.field} className="border rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{field.label}</span>
                          <code className="text-xs bg-muted px-1 rounded">{field.field}</code>
                        </div>
                        <Badge
                          className={
                            field.usagePercentage > 70
                              ? 'bg-green-100 text-green-800'
                              : field.usagePercentage > 30
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }
                        >
                          {field.usagePercentage.toFixed(0)}% used
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Used in {field.usageCount} of {fieldAnalysis.analyzedContacts} contacts
                      </div>
                      {field.samples && field.samples.length > 0 && (
                        <div className="mt-2 text-xs">
                          <span className="text-muted-foreground">Sample values: </span>
                          {field.samples.slice(0, 3).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}