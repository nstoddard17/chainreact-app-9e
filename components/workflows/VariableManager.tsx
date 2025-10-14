"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useWorkflowVariableStore } from "@/stores/workflowVariableStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Trash2, Edit, Database } from "lucide-react"

import { logger } from '@/lib/utils/logger'

interface VariableManagerProps {
  workflowId: string
}

export default function VariableManager({ workflowId }: VariableManagerProps) {
  const { variables, loading, fetchVariables, setVariable, deleteVariable } = useWorkflowVariableStore()
  const [isOpen, setIsOpen] = useState(false)
  const [editingVariable, setEditingVariable] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: "",
    value: "",
    type: "string",
  })

  useEffect(() => {
    if (workflowId) {
      fetchVariables(workflowId)
    }
  }, [workflowId, fetchVariables])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      let processedValue: any = formData.value

      // Process value based on type
      switch (formData.type) {
        case "number":
          processedValue = Number(formData.value)
          break
        case "boolean":
          processedValue = formData.value === "true"
          break
        case "object":
        case "array":
          processedValue = JSON.parse(formData.value)
          break
        default:
          processedValue = formData.value
      }

      await setVariable(workflowId, formData.name, processedValue, formData.type)

      setIsOpen(false)
      setEditingVariable(null)
      setFormData({ name: "", value: "", type: "string" })
    } catch (error) {
      logger.error("Failed to save variable:", error)
    }
  }

  const handleEdit = (variable: any) => {
    setEditingVariable(variable)
    setFormData({
      name: variable.name,
      value: typeof variable.value === "object" ? JSON.stringify(variable.value, null, 2) : String(variable.value),
      type: variable.type,
    })
    setIsOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this variable?")) {
      try {
        await deleteVariable(id)
      } catch (error) {
        logger.error("Failed to delete variable:", error)
      }
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "string":
        return "bg-primary/10 text-primary"
      case "number":
        return "bg-green-100 text-green-700"
      case "boolean":
        return "bg-yellow-100 text-yellow-700"
      case "object":
        return "bg-purple-100 text-purple-700"
      case "array":
        return "bg-pink-100 text-pink-700"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <Card className="bg-card rounded-2xl shadow-lg border border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-xl font-semibold text-foreground">Workflow Variables</CardTitle>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                onClick={() => {
                  setEditingVariable(null)
                  setFormData({ name: "", value: "", type: "string" })
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Variable
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingVariable ? "Edit Variable" : "Add Variable"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Variable Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="variableName"
                    required
                    disabled={!!editingVariable}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="string">String</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="boolean">Boolean</SelectItem>
                      <SelectItem value="object">Object</SelectItem>
                      <SelectItem value="array">Array</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="value">Value</Label>
                  {formData.type === "boolean" ? (
                    <Select value={formData.value} onValueChange={(value) => setFormData({ ...formData, value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">True</SelectItem>
                        <SelectItem value="false">False</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="value"
                      value={formData.value}
                      onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                      placeholder={
                        formData.type === "object"
                          ? '{"key": "value"}'
                          : formData.type === "array"
                            ? '["item1", "item2"]'
                            : "Variable value"
                      }
                      required
                    />
                  )}
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">{editingVariable ? "Update" : "Create"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
              {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading variables...</div>
                ) : variables.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
            No variables defined. Add variables to store data across workflow executions.
          </div>
        ) : (
          <div className="space-y-3">
            {variables.map((variable) => (
              <div
                key={variable.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <Badge className={`text-xs ${getTypeColor(variable.type)}`}>{variable.type}</Badge>
                  <div>
                    <div className="font-medium text-foreground">{variable.name}</div>
                    <div className="text-sm text-muted-foreground truncate max-w-xs">
                      {typeof variable.value === "object" ? JSON.stringify(variable.value) : String(variable.value)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(variable)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(variable.id)}>
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
