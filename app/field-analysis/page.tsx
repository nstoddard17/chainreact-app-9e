'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Eye, EyeOff, CheckCircle, AlertCircle, Info } from 'lucide-react'

interface FieldAnalysis {
  summary: {
    totalProperties: number
    formFields: number
    hiddenFields: number
    readOnlyFields: number
    calculatedFields: number
  }
  tableVisibility: {
    visible: Array<{
      name: string
      label: string
      type: string
      fieldType: string
      groupName: string
    }>
    hidden: Array<any>
    recommended: Array<{
      name: string
      label: string
      type: string
      fieldType: string
      groupName: string
      reason: string
    }>
  }
  byGroup: Record<string, Array<{
    name: string
    label: string
    type: string
    fieldType: string
    formField: boolean
    hidden: boolean
    readOnly: boolean
    calculated: boolean
    description: string
  }>>
  sampleData: any
  recommendations: {
    addToTable: Array<{
      name: string
      label: string
      reason: string
    }>
    hiddenButUseful: Array<{
      name: string
      label: string
      groupName: string
      reason: string
    }>
  }
}

export default function FieldAnalysisPage() {
  const [data, setData] = useState<FieldAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchFieldAnalysis()
  }, [])

  const fetchFieldAnalysis = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/integrations/hubspot/field-analysis')
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      setData(result.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="ml-2">Analyzing HubSpot fields...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Error Loading Field Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{error}</p>
            <Button onClick={fetchFieldAnalysis} className="mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent>
            <p>No data available</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">HubSpot Field Analysis</h1>
        <Button onClick={fetchFieldAnalysis} variant="outline">
          Refresh Analysis
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.totalProperties}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Form Fields</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{data.summary.formFields}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Hidden Fields</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{data.summary.hiddenFields}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Read Only</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{data.summary.readOnlyFields}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Calculated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{data.summary.calculatedFields}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="recommendations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="recommendations">Table Recommendations</TabsTrigger>
          <TabsTrigger value="by-group">By Group</TabsTrigger>
          <TabsTrigger value="sample-data">Sample Data</TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Recommended Fields for Table
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field Name</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recommendations.addToTable.map((field) => (
                    <TableRow key={field.name}>
                      <TableCell className="font-mono text-sm">{field.name}</TableCell>
                      <TableCell>{field.label}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{field.reason}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">contactinformation</Badge>
                      </TableCell>
                      <TableCell className="text-green-600">Common table field</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <EyeOff className="w-5 h-5 text-orange-600" />
                Hidden but Useful Fields
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field Name</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recommendations.hiddenButUseful.map((field) => (
                    <TableRow key={field.name}>
                      <TableCell className="font-mono text-sm">{field.name}</TableCell>
                      <TableCell>{field.label}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{field.groupName}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-orange-600">
                          Hidden but available
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-group" className="space-y-4">
          {Object.entries(data.byGroup).map(([groupName, fields]) => (
            <Card key={groupName}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  {groupName.charAt(0).toUpperCase() + groupName.slice(1).replace(/_/g, ' ')}
                  <Badge variant="outline">{fields.length} fields</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field Name</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field) => (
                      <TableRow key={field.name}>
                        <TableCell className="font-mono text-sm">{field.name}</TableCell>
                        <TableCell>{field.label}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{field.fieldType}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {field.formField && <Badge variant="default" className="text-xs">Form</Badge>}
                            {field.hidden && <Badge variant="destructive" className="text-xs">Hidden</Badge>}
                            {field.readOnly && <Badge variant="secondary" className="text-xs">Read Only</Badge>}
                            {field.calculated && <Badge variant="outline" className="text-xs">Calculated</Badge>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="sample-data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sample Contact Data</CardTitle>
            </CardHeader>
            <CardContent>
              {data.sampleData ? (
                <div className="space-y-4">
                  {data.sampleData.map((contact: any, index: number) => (
                    <div key={contact.id} className="border rounded-lg p-4">
                      <h3 className="font-semibold mb-2">Contact {index + 1}</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {Object.entries(contact.properties).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-mono text-xs text-gray-500">{key}:</span>
                            <span className="ml-2">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No sample data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 