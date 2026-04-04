"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Trash2, Plus, Lock, Unlock } from "lucide-react"
import {
  useBusinessContextStore,
  loadBusinessContext,
  addBusinessContextEntry,
  updateBusinessContextEntry,
  deleteBusinessContextEntry,
  type BusinessContextEntry,
} from "@/stores/businessContextStore"
import { usePlanRestrictions } from "@/hooks/use-plan-restrictions"

const CATEGORIES = [
  { value: 'company_info', label: 'Company Info' },
  { value: 'preferences', label: 'Preferences' },
  { value: 'rules', label: 'Rules' },
  { value: 'mappings', label: 'Mappings' },
  { value: 'style', label: 'Style' },
  { value: 'defaults', label: 'Defaults' },
] as const

export default function BusinessContextSettings() {
  const { entries, loading, error } = useBusinessContextStore()
  const { getCurrentLimits, checkActionLimit, isAdmin } = usePlanRestrictions()
  const [newKey, setNewKey] = useState("")
  const [newValue, setNewValue] = useState("")
  const [newCategory, setNewCategory] = useState<string>("company_info")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  const limits = getCurrentLimits()
  const maxEntries = limits.maxBusinessContextEntries
  const atLimit = !isAdmin && maxEntries !== -1 && entries.length >= maxEntries
  const limitCheck = checkActionLimit('addBusinessContext', entries.length)

  useEffect(() => {
    loadBusinessContext()
  }, [])

  const handleAdd = useCallback(async () => {
    if (!newKey.trim() || !newValue.trim()) return
    const result = await addBusinessContextEntry({
      key: newKey.trim(),
      value: newValue.trim(),
      category: newCategory as BusinessContextEntry['category'],
    })
    if (result) {
      setNewKey("")
      setNewValue("")
      setNewCategory("company_info")
    }
  }, [newKey, newValue, newCategory])

  const handleSaveEdit = useCallback(async (id: string) => {
    await updateBusinessContextEntry(id, { value: editValue })
    setEditingId(null)
    setEditValue("")
  }, [editValue])

  const handleToggleLock = useCallback(async (entry: BusinessContextEntry) => {
    await updateBusinessContextEntry(entry.id, { locked: !entry.locked })
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    await deleteBusinessContextEntry(id)
  }, [])

  const startEdit = useCallback((entry: BusinessContextEntry) => {
    setEditingId(entry.id)
    setEditValue(entry.value)
  }, [])

  return (
    <div className="space-y-6">
      {/* Add entry form */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="flex gap-3">
              <Input
                placeholder="Key (e.g. company_name, tone)"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="flex-1"
              />
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder="Value (e.g. Acme Corp, Professional but friendly)"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              rows={2}
            />
            <div className="flex items-center gap-3">
              <Button
                onClick={handleAdd}
                disabled={!newKey.trim() || !newValue.trim() || atLimit}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Context
              </Button>
              {maxEntries !== -1 && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {entries.length}/{maxEntries} entries
                </span>
              )}
            </div>
            {atLimit && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                {limitCheck.reason}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <div className="text-sm text-red-500 dark:text-red-400">{error}</div>
      )}

      {/* Loading state */}
      {loading && entries.length === 0 && (
        <div className="text-sm text-slate-500 dark:text-slate-400">Loading...</div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          <p>Teach ChainReact about your business. Add facts, rules, preferences, and style guides that the AI planner will use when building workflows.</p>
        </div>
      )}

      {/* Entry list */}
      <div className="space-y-2">
        {entries.map((entry) => (
          <Card key={entry.id} className="group">
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{entry.key}</span>
                    <Badge variant="outline" className="text-xs">
                      {CATEGORIES.find(c => c.value === entry.category)?.label ?? entry.category}
                    </Badge>
                    {entry.source === 'learned' && (
                      <Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400">
                        learned
                      </Badge>
                    )}
                    {entry.usage_count > 0 && (
                      <span className="text-xs text-slate-400">used {entry.usage_count}x</span>
                    )}
                  </div>

                  {editingId === entry.id ? (
                    <div className="flex gap-2">
                      <Textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        rows={2}
                        className="flex-1 text-sm"
                        autoFocus
                      />
                      <div className="flex flex-col gap-1">
                        <Button size="sm" onClick={() => handleSaveEdit(entry.id)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className="text-sm text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 rounded px-1 -mx-1"
                      onClick={() => startEdit(entry)}
                    >
                      {entry.value}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => handleToggleLock(entry)}
                    title={entry.locked ? "Unlock" : "Lock"}
                  >
                    {entry.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-red-500 hover:text-red-600"
                    onClick={() => handleDelete(entry.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
