"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"

export default function DebugHubSpotPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [properties, setProperties] = useState<any[]>([])
  const [filteredProperties, setFilteredProperties] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [allGroups, setAllGroups] = useState<string[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [filteredCount, setFilteredCount] = useState(0)
  
  const fetchHubSpotProperties = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // No auth needed for this debug endpoint
      const response = await fetch("/api/integrations/hubspot/debug")
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch HubSpot properties")
      }
      
      setProperties(data.results || [])
      setFilteredProperties(data.results || [])
      setAllGroups(data.allGroups || [])
      setTotalCount(data.totalCount || 0)
      setFilteredCount(data.filteredCount || 0)
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(() => {
    if (searchTerm) {
      setFilteredProperties(
        properties.filter(prop => 
          prop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          prop.label.toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    } else {
      setFilteredProperties(properties)
    }
  }, [searchTerm, properties])
  
  return (
    <div className="container mx-auto py-10 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>HubSpot Contact Properties Debug</CardTitle>
          <CardDescription>
            View all contact properties from your connected HubSpot account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={fetchHubSpotProperties} 
              disabled={loading}
              className="flex items-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Fetch Properties
            </Button>
            
            <Input
              placeholder="Search properties..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            
            <div className="text-sm text-muted-foreground">
              {filteredProperties.length} of {properties.length} filtered properties (from {totalCount} total HubSpot properties)
            </div>
          </div>
          
          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-md">
              {error}
            </div>
          )}
          
          <div className="border rounded-md">
            <div className="grid grid-cols-12 gap-2 p-3 bg-muted font-medium text-sm">
              <div className="col-span-3">Name</div>
              <div className="col-span-3">Label</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">Group</div>
              <div className="col-span-1">Required</div>
              <div className="col-span-1">Form Field</div>
            </div>
            
            <div className="divide-y max-h-[600px] overflow-auto">
              {filteredProperties.map((prop, index) => (
                <div key={prop.name} className="grid grid-cols-12 gap-2 p-3 text-sm hover:bg-muted/50">
                  <div className="col-span-3 font-mono">{prop.name}</div>
                  <div className="col-span-3">{prop.label}</div>
                  <div className="col-span-2">{prop.fieldType || prop.type}</div>
                  <div className="col-span-2">{prop.groupName}</div>
                  <div className="col-span-1">{prop.required ? "Yes" : "No"}</div>
                  <div className="col-span-1">{prop.formField ? "Yes" : "No"}</div>
                </div>
              ))}
              
              {filteredProperties.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  {properties.length === 0 ? "No properties found. Click 'Fetch Properties' to load data." : "No properties match your search."}
                </div>
              )}
            </div>
          </div>
          
          {properties.length > 0 && (
            <>
              <div className="mt-6 border rounded-md p-4">
                <h3 className="font-medium mb-2">Property Groups</h3>
                <div className="grid grid-cols-3 gap-2">
                  {allGroups.map((group, index) => (
                    <div key={index} className="bg-muted p-2 rounded text-sm">
                      {group || '(No Group)'}
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-sm text-muted-foreground">
                  <p>The filtering logic includes:</p>
                  <ul className="list-disc pl-5 mt-2">
                    <li>Properties from contact information groups</li>
                    <li>Common contact fields (email, name, phone, etc.)</li>
                    <li>Properties marked as form fields</li>
                  </ul>
                </div>
              </div>
              
              <details className="mt-6">
                <summary className="cursor-pointer font-medium">Raw JSON Data</summary>
                <pre className="mt-2 p-4 bg-muted rounded-md overflow-auto max-h-[400px] text-xs">
                  {JSON.stringify(filteredProperties, null, 2)}
                </pre>
              </details>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 