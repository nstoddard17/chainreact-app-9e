"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Palette } from "lucide-react"

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

const NOTION_COLORS = [
  "default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"
]

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-10 h-10 p-0 border-2"
          style={{
            backgroundColor: getColorValue(value),
            borderColor: value === "default" ? "hsl(var(--border))" : getColorValue(value)
          }}
        >
          <Palette className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2">
        <div className="grid grid-cols-5 gap-1">
          {NOTION_COLORS.map((color) => (
            <Button
              key={color}
              variant="outline"
              size="sm"
              className="w-8 h-8 p-0 border-2"
              style={{
                backgroundColor: getColorValue(color),
                borderColor: color === value ? "hsl(var(--foreground))" : "transparent"
              }}
              onClick={() => {
                onChange(color)
                setIsOpen(false)
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function getColorValue(color: string): string {
  const colorMap: Record<string, string> = {
    default: "transparent",
    gray: "#9B9A97",
    brown: "#64473A",
    orange: "#FF8B1E",
    yellow: "#FFD93D",
    green: "#4CB782",
    blue: "#0B6E99",
    purple: "#6940A5",
    pink: "#AD1A72",
    red: "#E03E3E"
  }
  return colorMap[color] || "transparent"
} 