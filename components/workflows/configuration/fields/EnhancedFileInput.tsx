"use client"

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, Variable } from "lucide-react";
import { NodeField } from "@/lib/workflows/nodes";
import VariablePicker from "../../VariablePicker";

interface EnhancedFileInputProps {
  fieldDef: NodeField;
  fieldValue: any;
  onValueChange: (value: any) => void;
  workflowData?: { nodes: any[]; edges: any[] };
  currentNodeId?: string;
}

/**
 * Enhanced file input component for handling files, URLs, and emojis
 */
export default function EnhancedFileInput({
  fieldDef,
  fieldValue,
  onValueChange,
  workflowData,
  currentNodeId,
}: EnhancedFileInputProps) {
  // State
  const [activeTab, setActiveTab] = useState("upload");
  const [urlInput, setUrlInput] = useState("");
  const [emojiInput, setEmojiInput] = useState("");

  // Common emojis for quick selection
  const commonEmojis = [
    "🎯", "📝", "📊", "📈", "📉", "✅", "❌", "⚠️", "💡", "🔥", "⭐", "💎",
    "🚀", "🎉", "🎨", "📱", "💻", "🌐", "📧", "📞", "📍", "📅", "⏰", "💰",
    "🎁", "🏆", "🎪", "🎭", "🎨", "🎵", "🎬", "📚", "🎓", "💼", "🏢", "🏠",
    "🚗", "✈️", "🚢", "🎮", "⚽", "🏀", "🎾", "🏈", "⚾", "🎯", "🎳", "🎲"
  ];

  // Event handlers
  const handleFileUpload = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length > 0) {
      const file = fileArray[0];
      // Create a file object with URL for preview
      const fileObj = {
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file),
      };
      onValueChange(fileObj);
    }
  };

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onValueChange(urlInput.trim());
      setUrlInput("");
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    onValueChange(emoji);
    setEmojiInput("");
  };

  // Helper function to display the current value
  const getDisplayValue = () => {
    if (!fieldValue) return "No file selected";

    if (typeof fieldValue === "string") {
      if (fieldValue.length <= 2) return `Emoji: ${fieldValue}`;
      if (fieldValue.startsWith("http")) return `URL: ${fieldValue}`;
      return fieldValue;
    }

    if (fieldValue && typeof fieldValue === "object") {
      if (fieldValue.name) return `File: ${fieldValue.name}`;
      if (fieldValue.url) return `URL: ${fieldValue.url}`;
    }

    return "File selected";
  };

  return (
    <div className="space-y-3">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-2">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="url">URL</TabsTrigger>
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-2">
          <input
            type="file"
            id={`file-${fieldDef.name}`}
            accept={fieldDef.accept || "image/*"}
            onChange={(e) => handleFileUpload(e.target.files || [])}
            className="hidden"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById(`file-${fieldDef.name}`)?.click()}
              className="flex-1"
            >
              Choose File
            </Button>
            <VariablePicker
              workflowData={workflowData}
              currentNodeId={currentNodeId}
              onVariableSelect={(variable) => onValueChange(variable)}
              fieldType="file"
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Insert variable"
                >
                  <span className="text-sm font-mono font-semibold">{`{}`}</span>
                </Button>
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="url" className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Enter image URL (e.g., https://example.com/image.jpg)"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
              className="flex-1"
            />
            <Button
              onClick={handleUrlSubmit}
              size="sm"
              disabled={!urlInput.trim()}
              className="px-4"
            >
              Add
            </Button>
          </div>
          {urlInput && (
            <div className="text-xs text-muted-foreground">
              Press Enter or click Add to use this URL
            </div>
          )}
        </TabsContent>

        <TabsContent value="emoji" className="space-y-2">
          <div className="grid grid-cols-8 gap-2 max-h-32 overflow-y-auto">
            {commonEmojis.map((emoji, index) => (
              <Button
                key={`emoji-${index}-${emoji}`}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 text-lg"
                onClick={() => handleEmojiSelect(emoji)}
              >
                {emoji}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Paste custom emoji"
              value={emojiInput}
              onChange={(e) => setEmojiInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && emojiInput && handleEmojiSelect(emojiInput)}
            />
            <Button
              onClick={() => emojiInput && handleEmojiSelect(emojiInput)}
              size="sm"
              disabled={!emojiInput}
              className="px-4"
            >
              Add
            </Button>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Tip: On Mac, press <b>Control + Command + Space</b>. On Windows, press <b>Windows + . (period)</b>. Or copy an emoji from another site.
          </div>
        </TabsContent>
      </Tabs>

      {/* Current Value Display */}
      {fieldValue && (
        <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
          {getDisplayValue()}
        </div>
      )}
    </div>
  );
}