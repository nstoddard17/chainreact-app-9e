'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, AlertCircle, CheckCircle, Lock, Edit } from 'lucide-react'

interface HubSpotDebugData {
  integration: {
    id: string
    provider: string
    status: string
    createdAt: string
    updatedAt: string
  }
  analysis: {
    totalContacts: number
    contactsRetrieved: number
    sampleContacts: any[]
    availableProperties: Record<string, any>
    missingProperties: string[]
    readOnlyProperties: string[]
    writableProperties: string[]
    propertyAnalysis: {
      hasData: Record<string, boolean>
      dataTypes: Record<string, string>
      sampleValues: Record<string, any>
    }
    tableData?: {
      headers: string[]
      rows: string[][]
    }
    actualProperties?: string[]
  }
  rawContacts: any[]
  rawProperties: any[]
}

export default function DebugHubSpotPage() {
  const [data, setData] = useState<HubSpotDebugData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/integrations/hubspot/debug-contacts')
      const result = await response.json()
      
      if (result.success) {
        setData(result.data)
      } else {
        setError(result.error || 'Failed to fetch data')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Loading HubSpot debug data...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Error Loading HubSpot Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={fetchData} className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
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
          <CardContent className="pt-6">
            <p>No data available</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">HubSpot Contacts Debug</h1>
        <Button onClick={fetchData} className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Integration Info */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Provider</p>
              <p className="font-medium">{data.integration.provider}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={data.integration.status === 'connected' ? 'default' : 'destructive'}>
                {data.integration.status}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Contacts</p>
              <p className="font-medium">{data.analysis.totalContacts}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Retrieved</p>
              <p className="font-medium">{data.analysis.contactsRetrieved}</p>
            </div>
          </div>
        </CardContent>
      </Card>

             {/* Properties Summary */}
       <Card>
         <CardHeader>
           <CardTitle>Properties Summary</CardTitle>
           <p className="text-sm text-muted-foreground">
             Showing all available properties in your HubSpot contacts table
           </p>
         </CardHeader>
         <CardContent>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <div>
               <p className="text-sm text-muted-foreground">Total Properties</p>
               <p className="font-medium text-2xl">{data.analysis.actualProperties?.length || 0}</p>
             </div>
             <div>
               <p className="text-sm text-muted-foreground">With Data</p>
               <p className="font-medium text-2xl text-green-600">
                 {data.analysis.tableData?.rows.filter(row => row[2] === '✅ Yes').length || 0}
               </p>
             </div>
                          <div>
               <p className="text-sm text-muted-foreground">Without Data</p>
               <p className="font-medium text-2xl text-gray-600">
                 {data.analysis.tableData?.rows.filter(row => row[2] === '❌ No').length || 0}
               </p>
             </div>
             <div>
               <p className="text-sm text-muted-foreground">Writable</p>
               <p className="font-medium text-2xl text-blue-600">
                 {data.analysis.tableData?.rows.filter(row => row[4] === '✏️ No').length || 0}
               </p>
             </div>
           </div>
         </CardContent>
       </Card>

       {/* Properties Table */}
       <Card>
         <CardHeader>
           <CardTitle>Contact Properties Analysis</CardTitle>
           <p className="text-sm text-muted-foreground">
             Shows all available properties in your HubSpot contacts table with their current status
           </p>
         </CardHeader>
         <CardContent>
           {data.analysis.tableData ? (
             <div className="overflow-x-auto">
               <Table>
                 <TableHeader>
                   <TableRow>
                     {data.analysis.tableData.headers.map((header, index) => (
                       <TableHead key={index}>{header}</TableHead>
                     ))}
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {data.analysis.tableData.rows.map((row, rowIndex) => {
                     const hasData = row[2] === '✅ Yes'
                     const isReadOnly = row[4] === '🔒 Yes'
                     
                     return (
                       <TableRow 
                         key={rowIndex}
                         className={!hasData ? 'bg-gray-50' : ''}
                       >
                         {row.map((cell, cellIndex) => (
                           <TableCell key={cellIndex}>
                             {cellIndex === 2 ? ( // Has Data column
                               cell === '✅ Yes' ? (
                                 <Badge variant="default" className="bg-green-100 text-green-800">
                                   <CheckCircle className="w-3 h-3 mr-1" />
                                   Yes
                                 </Badge>
                               ) : (
                                 <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                                   <AlertCircle className="w-3 h-3 mr-1" />
                                   No Data
                                 </Badge>
                               )
                             ) : cellIndex === 4 ? ( // Read Only column
                               cell === '🔒 Yes' ? (
                                 <Badge variant="destructive">
                                   <Lock className="w-3 h-3 mr-1" />
                                   Read Only
                                 </Badge>
                               ) : (
                                 <Badge variant="outline">
                                   <Edit className="w-3 h-3 mr-1" />
                                   Writable
                                 </Badge>
                               )
                             ) : cellIndex === 3 ? ( // Sample Value column
                               cell === 'N/A' ? (
                                 <span className="text-gray-400 italic">N/A</span>
                               ) : (
                                 <span className="font-mono text-sm">{cell}</span>
                               )
                             ) : (
                               <span className="font-mono text-sm">{cell}</span>
                             )}
                           </TableCell>
                         ))}
                       </TableRow>
                     )
                   })}
                 </TableBody>
               </Table>
             </div>
           ) : (
             <p>No table data available</p>
           )}
         </CardContent>
       </Card>

      {/* Missing Properties */}
      {data.analysis.missingProperties.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-orange-600">Missing Properties</CardTitle>
            <p className="text-sm text-muted-foreground">
              These properties were requested but don't exist in your HubSpot account
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.analysis.missingProperties.map((prop) => (
                <Badge key={prop} variant="outline" className="text-orange-600 border-orange-600">
                  {prop}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sample Contacts */}
      <Card>
        <CardHeader>
          <CardTitle>Sample Contacts</CardTitle>
          <p className="text-sm text-muted-foreground">
            First {data.analysis.sampleContacts.length} contacts from your HubSpot account
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.analysis.sampleContacts.map((contact, index) => (
              <div key={contact.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">
                    {contact.properties.firstname} {contact.properties.lastname}
                  </h4>
                  <Badge variant="outline">{contact.id}</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <p className="font-mono">{contact.properties.email || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Company:</span>
                    <p className="font-mono">{contact.properties.company || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Job Title:</span>
                    <p className="font-mono">{contact.properties.jobtitle || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phone:</span>
                    <p className="font-mono">{contact.properties.phone || 'N/A'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 