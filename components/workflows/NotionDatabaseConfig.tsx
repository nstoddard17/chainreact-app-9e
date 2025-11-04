"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Trash2, Upload, Link, Palette, Eye, Filter, ArrowUpDown } from "lucide-react"
import { ColorPicker } from "@/components/ui/color-picker"

interface PropertyConfig {
  name: string
  type: string
  config?: any
}

interface ViewConfig {
  name: string
  viewType: string
  filters?: Array<{
    property: string
    operator: string
    value: string
  }>
  sorts?: Array<{
    property: string
    direction: string
  }>
}

interface IconCoverConfig {
  mode: "upload" | "url"
  value: string | File
  fileName?: string
  fileUrl?: string
}

interface NotionDatabaseConfigProps {
  value: any
  onChange: (value: any) => void
  fieldName: string
}

const PROPERTY_TYPES = [
  "title", "rich_text", "number", "select", "multi_select", 
  "date", "people", "files", "checkbox", "url", "email", 
  "phone", "formula", "relation"
]

const NUMBER_FORMATS = [
  { value: "number", label: "Number" },
  { value: "percent", label: "Percent" },
  { value: "dollar", label: "Dollar" },
  { value: "euro", label: "Euro" }
]

const VIEW_TYPES = [
  { value: "Table", label: "Table" },
  { value: "Board", label: "Board" },
  { value: "Calendar", label: "Calendar" },
  { value: "List", label: "List" },
  { value: "Gallery", label: "Gallery" }
]

const FILTER_OPERATORS = [
  { value: "=", label: "Equals" },
  { value: "!=", label: "Not Equals" },
  { value: ">", label: "Greater Than" },
  { value: "<", label: "Less Than" },
  { value: "contains", label: "Contains" }
]

const SORT_DIRECTIONS = [
  { value: "ascending", label: "Ascending" },
  { value: "descending", label: "Descending" }
]

export function NotionDatabaseConfig({ value, onChange, fieldName }: NotionDatabaseConfigProps) {
  const [activeTab, setActiveTab] = useState("properties")
  // Refs for file inputs
  const iconFileInputRef = useRef<HTMLInputElement>(null)
  const coverFileInputRef = useRef<HTMLInputElement>(null)

  // Ensure icon/cover mode defaults to 'upload' if not set
  useEffect(() => {
    if (activeTab === "icon" && (!value?.icon || !value.icon.mode)) {
      onChange({ ...value, icon: { mode: "upload", value: "" } })
    }
    if (activeTab === "cover" && (!value?.cover || !value.cover.mode)) {
      onChange({ ...value, cover: { mode: "upload", value: "" } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handlePropertiesChange = (properties: PropertyConfig[]) => {
    onChange({ ...value, properties })
  }

  const handleViewsChange = (views: ViewConfig[]) => {
    onChange({ ...value, views })
  }

  const handleIconChange = (icon: IconCoverConfig) => {
    onChange({ ...value, icon })
  }

  const handleCoverChange = (cover: IconCoverConfig) => {
    onChange({ ...value, cover })
  }

  const handleFileUpload = (type: "icon" | "cover", files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    const fileObj = {
      mode: "upload" as "upload", // explicitly type as 'upload'
      value: file,
      fileName: file.name,
      fileUrl: URL.createObjectURL(file)
    }
    if (type === "icon") {
      handleIconChange(fileObj)
    } else {
      handleCoverChange(fileObj)
    }
  }

  const addProperty = () => {
    const newProperty: PropertyConfig = {
      name: "",
      type: "rich_text"
    }
    const properties = [...(value?.properties || []), newProperty]
    handlePropertiesChange(properties)
  }

  const updateProperty = (index: number, property: PropertyConfig) => {
    const properties = [...(value?.properties || [])]
    properties[index] = property
    handlePropertiesChange(properties)
  }

  const removeProperty = (index: number) => {
    const properties = [...(value?.properties || [])]
    properties.splice(index, 1)
    handlePropertiesChange(properties)
  }

  const addView = () => {
    const newView: ViewConfig = {
      name: "",
      viewType: "Table"
    }
    const views = [...(value?.views || []), newView]
    handleViewsChange(views)
  }

  const updateView = (index: number, view: ViewConfig) => {
    const views = [...(value?.views || [])]
    views[index] = view
    handleViewsChange(views)
  }

  const removeView = (index: number) => {
    const views = [...(value?.views || [])]
    views.splice(index, 1)
    handleViewsChange(views)
  }

  const addFilter = (viewIndex: number) => {
    const views = [...(value?.views || [])]
    if (!views[viewIndex].filters) views[viewIndex].filters = []
    views[viewIndex].filters.push({ property: "", operator: "=", value: "" })
    handleViewsChange(views)
  }

  const updateFilter = (viewIndex: number, filterIndex: number, filter: any) => {
    const views = [...(value?.views || [])]
    views[viewIndex].filters![filterIndex] = filter
    handleViewsChange(views)
  }

  const removeFilter = (viewIndex: number, filterIndex: number) => {
    const views = [...(value?.views || [])]
    views[viewIndex].filters!.splice(filterIndex, 1)
    handleViewsChange(views)
  }

  const addSort = (viewIndex: number) => {
    const views = [...(value?.views || [])]
    if (!views[viewIndex].sorts) views[viewIndex].sorts = []
    views[viewIndex].sorts.push({ property: "", direction: "ascending" })
    handleViewsChange(views)
  }

  const updateSort = (viewIndex: number, sortIndex: number, sort: any) => {
    const views = [...(value?.views || [])]
    views[viewIndex].sorts![sortIndex] = sort
    handleViewsChange(views)
  }

  const removeSort = (viewIndex: number, sortIndex: number) => {
    const views = [...(value?.views || [])]
    views[viewIndex].sorts!.splice(sortIndex, 1)
    handleViewsChange(views)
  }

  const renderPropertyConfig = (property: PropertyConfig, index: number) => {
    const propertyNames = (value?.properties || []).map((p: PropertyConfig) => p.name).filter(Boolean)

    return (
      <Card key={index} className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Property {index + 1}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeProperty(index)}
              className="text-red-500 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input
                value={property.name}
                onChange={(e) => updateProperty(index, { ...property, name: e.target.value })}
                placeholder="Property name"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={property.type} onValueChange={(type) => updateProperty(index, { ...property, type })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Type-specific configuration */}
          {property.type === "number" && (
            <div>
              <Label>Number Format</Label>
              <Select 
                value={property.config?.format || "number"} 
                onValueChange={(format) => updateProperty(index, { 
                  ...property, 
                  config: { ...property.config, format } 
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NUMBER_FORMATS.map((format) => (
                    <SelectItem key={format.value} value={format.value}>
                      {format.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(property.type === "select" || property.type === "multi_select") && (
            <div>
              <Label>Options</Label>
              <div className="space-y-2">
                {(property.config?.options || []).map((option: any, optionIndex: number) => (
                  <div key={optionIndex} className="flex gap-2">
                    <Input
                      value={option.name}
                      onChange={(e) => {
                        const options = [...(property.config?.options || [])]
                        options[optionIndex] = { ...option, name: e.target.value }
                        updateProperty(index, { 
                          ...property, 
                          config: { ...property.config, options } 
                        })
                      }}
                      placeholder="Option name"
                    />
                    <ColorPicker
                      value={option.color || "gray"}
                      onChange={(color: string) => {
                        const options = [...(property.config?.options || [])]
                        options[optionIndex] = { ...option, color }
                        updateProperty(index, { 
                          ...property, 
                          config: { ...property.config, options } 
                        })
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const options = [...(property.config?.options || [])]
                        options.splice(optionIndex, 1)
                        updateProperty(index, { 
                          ...property, 
                          config: { ...property.config, options } 
                        })
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const options = [...(property.config?.options || []), { name: "", color: "gray" }]
                    updateProperty(index, { 
                      ...property, 
                      config: { ...property.config, options } 
                    })
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Option
                </Button>
              </div>
            </div>
          )}

          {property.type === "relation" && (
            <div>
              <Label>Related Database</Label>
              <Select 
                value={property.config?.databaseId || ""} 
                onValueChange={(databaseId) => updateProperty(index, { 
                  ...property, 
                  config: { ...property.config, databaseId } 
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select database" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TasksDB">Tasks Database</SelectItem>
                  <SelectItem value="ProjectsDB">Projects Database</SelectItem>
                  <SelectItem value="ContactsDB">Contacts Database</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {property.type === "formula" && (
            <div>
              <Label>Formula Expression</Label>
              <Textarea
                value={property.config?.expression || ""}
                onChange={(e) => updateProperty(index, { 
                  ...property, 
                  config: { ...property.config, expression: e.target.value } 
                })}
                placeholder="e.g., prop('Status') == 'Done' ? 'Complete' : 'In Progress'"
              />
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const renderViewConfig = (view: ViewConfig, index: number) => {
    return (
      <Card key={index} className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">View {index + 1}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeView(index)}
              className="text-red-500 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input
                value={view.name}
                onChange={(e) => updateView(index, { ...view, name: e.target.value })}
                placeholder="View name"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={view.viewType} onValueChange={(viewType) => updateView(index, { ...view, viewType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIEW_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filters */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filters
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addFilter(index)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Filter
              </Button>
            </div>
            <div className="space-y-2">
              {(view.filters || []).map((filter, filterIndex) => (
                <div key={filterIndex} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>Property</Label>
                    <Select 
                      value={filter.property} 
                      onValueChange={(property) => updateFilter(index, filterIndex, { ...filter, property })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select property" />
                      </SelectTrigger>
                      <SelectContent>
                        {(value?.properties || []).map((prop: PropertyConfig) => (
                          <SelectItem key={prop.name} value={prop.name}>
                            {prop.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label>Operator</Label>
                    <Select 
                      value={filter.operator} 
                      onValueChange={(operator) => updateFilter(index, filterIndex, { ...filter, operator })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FILTER_OPERATORS.map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label>Value</Label>
                    <Input
                      value={filter.value}
                      onChange={(e) => updateFilter(index, filterIndex, { ...filter, value: e.target.value })}
                      placeholder="Filter value"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFilter(index, filterIndex)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Sorts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4" />
                Sorts
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addSort(index)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Sort
              </Button>
            </div>
            <div className="space-y-2">
              {(view.sorts || []).map((sort, sortIndex) => (
                <div key={sortIndex} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>Property</Label>
                    <Select 
                      value={sort.property} 
                      onValueChange={(property) => updateSort(index, sortIndex, { ...sort, property })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select property" />
                      </SelectTrigger>
                      <SelectContent>
                        {(value?.properties || []).map((prop: PropertyConfig) => (
                          <SelectItem key={prop.name} value={prop.name}>
                            {prop.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label>Direction</Label>
                    <Select 
                      value={sort.direction} 
                      onValueChange={(direction) => updateSort(index, sortIndex, { ...sort, direction })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SORT_DIRECTIONS.map((dir) => (
                          <SelectItem key={dir.value} value={dir.value}>
                            {dir.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSort(index, sortIndex)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderIconCoverConfig = (type: "icon" | "cover") => {
    // Default to upload mode if not set
    const config = value?.[type] || { mode: "upload", value: "" }
    const isIcon = type === "icon"
    const fileInputRef = isIcon ? iconFileInputRef : coverFileInputRef
    const fileName = config.fileName || (typeof config.value === 'object' && config.value?.name)

    return (
      <Card>
        <CardHeader>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Mode</Label>
            <Select 
              value={config.mode} 
              onValueChange={(mode) => {
                if (isIcon) {
                  handleIconChange({ ...config, mode: mode as "upload" | "url" })
                } else {
                  handleCoverChange({ ...config, mode: mode as "upload" | "url" })
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="url">URL</SelectItem>
                <SelectItem value="upload">Upload</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{config.mode === "url" ? "URL" : "Upload"}</Label>
            <div className="flex flex-col gap-2 w-full">
              {config.mode === "upload" ? (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    accept="image/*,.svg,.png,.jpg,.jpeg,.gif"
                    onChange={e => handleFileUpload(type, e.target.files)}
                  />
                  <Button variant="outline" size="sm" className="w-full" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload File
                  </Button>
                  {fileName && (
                    <div className="text-xs text-muted-foreground truncate">{fileName}</div>
                  )}
                </>
              ) : (
                <Input
                  value={typeof config.value === 'string' ? config.value : ''}
                  onChange={(e) => {
                    if (isIcon) {
                      handleIconChange({ ...config, value: e.target.value })
                    } else {
                      handleCoverChange({ ...config, value: e.target.value })
                    }
                  }}
                  placeholder="https://example.com/image.png"
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="views">Views</TabsTrigger>
          <TabsTrigger value="icon">Icon</TabsTrigger>
          <TabsTrigger value="cover">Cover</TabsTrigger>
        </TabsList>

        <TabsContent value="properties" className="space-y-4">
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" onClick={addProperty}>
              <Plus className="w-4 h-4 mr-2" />
              Add Property
            </Button>
          </div>
          {(value?.properties || []).map((property: PropertyConfig, index: number) => 
            renderPropertyConfig(property, index)
          )}
          {(!value?.properties || value.properties.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              No properties configured. Add at least one property to create the database.
            </div>
          )}
        </TabsContent>

        <TabsContent value="views" className="space-y-4">
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" onClick={addView}>
              <Plus className="w-4 h-4 mr-2" />
              Add View
            </Button>
          </div>
          {(value?.views || []).map((view: ViewConfig, index: number) => 
            renderViewConfig(view, index)
          )}
          {(!value?.views || value.views.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              No views configured. Views are optional.
            </div>
          )}
        </TabsContent>

        <TabsContent value="icon" className="mt-2">
          {renderIconCoverConfig("icon")}
        </TabsContent>

        <TabsContent value="cover" className="mt-2">
          {renderIconCoverConfig("cover")}
        </TabsContent>
      </Tabs>
    </div>
  )
} 
