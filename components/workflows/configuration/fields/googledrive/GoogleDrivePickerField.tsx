"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/utils/supabaseClient"
import { File, Folder, Link2, X } from "lucide-react"

declare global {
  interface Window {
    gapi?: any
    google?: any
  }
}

interface GoogleDrivePickerFieldProps {
  field: any
  value: any
  onChange: (value: any) => void
  error?: string
  mode?: "files" | "folders" | "files-and-folders"
  onLabelStore?: (fieldName: string, value: string, label: string) => void
}

const GOOGLE_API_SCRIPT = "https://apis.google.com/js/api.js"

export function GoogleDrivePickerField({
  field,
  value,
  onChange,
  error,
  mode = "files",
  onLabelStore
}: GoogleDrivePickerFieldProps) {
  const { toast } = useToast()
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [loadingPicker, setLoadingPicker] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState<string>("")

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY

  const resolvedValue = useMemo(() => {
    if (Array.isArray(value)) return value
    if (!value) return ""
    return value
  }, [value])

  useEffect(() => {
    if (!value) {
      setSelectedLabel("")
    }
  }, [value])

  const loadGoogleApi = useCallback(async () => {
    if (window.gapi) {
      setScriptLoaded(true)
      return
    }

    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GOOGLE_API_SCRIPT}"]`)
      if (existing) {
        existing.addEventListener("load", () => resolve())
        existing.addEventListener("error", () => reject(new Error("Failed to load Google API script")))
        return
      }

      const script = document.createElement("script")
      script.src = GOOGLE_API_SCRIPT
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("Failed to load Google API script"))
      document.body.appendChild(script)
    })

    setScriptLoaded(true)
  }, [])

  const fetchAccessToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error("Not authenticated")
    }

    const response = await fetch("/api/integrations/google-drive/access-token", {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || "Failed to fetch access token")
    }

    const data = await response.json()
    return data.accessToken as string
  }, [])

  const buildPicker = useCallback(async () => {
    if (!apiKey) {
      throw new Error("Missing Google API key. Set NEXT_PUBLIC_GOOGLE_API_KEY.")
    }

    await loadGoogleApi()

    if (!window.gapi || !window.google) {
      throw new Error("Google Picker API not available")
    }

    const accessToken = await fetchAccessToken()

    return new Promise<void>((resolve) => {
      window.gapi.load("picker", {
        callback: () => {
          const viewTypes: any[] = []

          if (mode === "folders" || mode === "files-and-folders") {
            const folderView = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
            folderView.setIncludeFolders(true)
            folderView.setSelectFolderEnabled(true)
            viewTypes.push(folderView)
          }

          if (mode === "files" || mode === "files-and-folders") {
            const docsView = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
            docsView.setIncludeFolders(false)
            viewTypes.push(docsView)
          }

          const picker = new window.google.picker.PickerBuilder()
            .setOAuthToken(accessToken)
            .setDeveloperKey(apiKey)
            .setCallback((data: any) => {
              if (data.action === window.google.picker.Action.PICKED) {
                const docs = data.docs || []
                if (docs.length > 0) {
                  const ids = docs.map((doc: any) => doc.id)
                  const labels = docs.map((doc: any) => doc.name || doc.title || doc.id)
                  const nextValue = field.multiple || field.multiSelect ? ids : ids[0]
                  onChange(nextValue)

                  const label = field.multiple || field.multiSelect ? labels.join(", ") : labels[0]
                  setSelectedLabel(label)
                  if (onLabelStore && typeof nextValue === "string") {
                    onLabelStore(field.name, nextValue, label)
                  }
                }
              }
            })

          viewTypes.forEach((view) => picker.addView(view))
          picker.build().setVisible(true)
          resolve()
        }
      })
    })
  }, [apiKey, field.multiple, field.multiSelect, field.name, fetchAccessToken, loadGoogleApi, mode, onChange, onLabelStore])

  const handleOpenPicker = async () => {
    try {
      setLoadingPicker(true)
      await buildPicker()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Google Drive picker error",
        description: err?.message || "Failed to open Google Drive picker"
      })
    } finally {
      setLoadingPicker(false)
    }
  }

  const handleClear = () => {
    onChange(field.multiple || field.multiSelect ? [] : "")
    setSelectedLabel("")
  }

  const icon = mode === "folders" ? <Folder className="h-4 w-4" /> : <File className="h-4 w-4" />

  return (
    <div className="space-y-2">
      {field.label && (
        <Label className="flex items-center gap-2">
          {icon}
          {field.label}
        </Label>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleOpenPicker}
          disabled={loadingPicker}
          className="gap-2"
        >
          <Link2 className="h-4 w-4" />
          {loadingPicker ? "Opening..." : "Choose from Drive"}
        </Button>

        {(resolvedValue && (Array.isArray(resolvedValue) ? resolvedValue.length > 0 : true)) && (
          <Button type="button" variant="ghost" size="icon" onClick={handleClear}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Input
        value={Array.isArray(resolvedValue) ? resolvedValue.join(", ") : resolvedValue || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || "Paste a Drive file or folder ID"}
        className={cn(error && "border-red-500")}
      />

      {(!resolvedValue || (Array.isArray(resolvedValue) && resolvedValue.length === 0)) && (
        <p className="text-xs text-muted-foreground">
          No files selected yet. Click “Choose from Drive” to pick files or folders.
        </p>
      )}

      {(selectedLabel || field.description) && (
        <p className="text-xs text-muted-foreground">
          {selectedLabel || field.description}
        </p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
