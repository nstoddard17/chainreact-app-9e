import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sparkles, RefreshCw, Star, StarOff, History, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "brief", label: "Brief" },
  { value: "enthusiastic", label: "Enthusiastic" },
];

function getHistoryKey(fieldId: string) {
  return `ai_draft_history_${fieldId}`;
}
function getFavoritesKey(fieldId: string) {
  return `ai_draft_favorites_${fieldId}`;
}

export interface SmartComposeFieldProps {
  value: string;
  onChange: (val: string) => void;
  fieldId: string; // unique per node/field
  label?: string;
  placeholder?: string;
  context: Record<string, any>; // e.g. recipient, subject, etc.
  integration: string;
  fieldName: string;
  aiAssistEnabled: boolean;
  aiTone: string;
  onAiAssistToggle?: (enabled: boolean) => void;
  onToneChange?: (tone: string) => void;
}

export const SmartComposeField: React.FC<SmartComposeFieldProps> = ({
  value,
  onChange,
  fieldId,
  label,
  placeholder,
  context,
  integration,
  fieldName,
  aiAssistEnabled,
  aiTone,
  onAiAssistToggle,
  onToneChange,
}) => {
  // AI state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState("");
  const [aiPreview, setAiPreview] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preservedAiContent, setPreservedAiContent] = useState<string>("");

  // Load history/favorites from localStorage
  useEffect(() => {
    const h = localStorage.getItem(getHistoryKey(fieldId));
    setHistory(h ? JSON.parse(h) : []);
    const f = localStorage.getItem(getFavoritesKey(fieldId));
    setFavorites(f ? JSON.parse(f) : []);
  }, [fieldId]);

  // Save history/favorites to localStorage
  useEffect(() => {
    localStorage.setItem(getHistoryKey(fieldId), JSON.stringify(history.slice(0, 3)));
  }, [history, fieldId]);
  useEffect(() => {
    localStorage.setItem(getFavoritesKey(fieldId), JSON.stringify(favorites));
  }, [favorites, fieldId]);

  // Generate default prompt
  useEffect(() => {
    if (!aiPrompt) {
      let prompt = "";
      if (integration === "gmail" && fieldName === "body") {
        prompt = `Write an email to ${context.recipient || "[recipient]"} about ${context.subject || "[subject]"}.`;
      } else if (integration === "slack" && fieldName === "message") {
        prompt = `Draft a Slack message for ${context.channel || "[channel]"}.`;
      } else if (integration === "discord" && fieldName === "message") {
        const channelName = context.channel ? context.channel : "[channel]"
        const serverContext = context.server ? ` in ${context.server}` : ""
        prompt = `Draft a Discord message for the ${channelName} channel${serverContext}.`;
      } else if (integration === "notion" && fieldName === "content") {
        prompt = `Write Notion content for ${context.page || "[page]"}.`;
      } else {
        prompt = `Write a message.`;
      }
      setAiPrompt(prompt);
    }
  }, [integration, fieldName, context, aiPrompt]);

  // AI Compose handler
  const handleAiCompose = async (regenerate = false) => {
    setAiLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          context,
          tone: aiTone,
          field: fieldName,
          integration,
          previous: value,
          regenerate,
        }),
      });
      if (!res.ok) throw new Error("AI service error");
      const data = await res.json();
      setAiDraft(data.draft);
      setAiPreview(data.draft);
      // Preserve the new AI content for when toggle is turned off/on
      setPreservedAiContent(data.draft);
      // Add to history
      setHistory((prev) => [data.draft, ...prev.filter((h) => h !== data.draft)].slice(0, 3));
    } catch (e: any) {
      setError(e.message || "Failed to generate draft");
    } finally {
      setAiLoading(false);
    }
  };

  // Insert AI draft into field
  const handleInsertDraft = () => {
    if (aiPreview) onChange(aiPreview);
  };

  // Star/unstar favorite
  const handleToggleFavorite = (draft: string) => {
    setFavorites((prev) =>
      prev.includes(draft) ? prev.filter((f) => f !== draft) : [draft, ...prev]
    );
  };

  // Handle AI toggle state changes - preserve/restore AI content
  useEffect(() => {
    if (!aiAssistEnabled && aiPreview) {
      // AI is being turned off, preserve the current AI content
      setPreservedAiContent(aiPreview)
    } else if (aiAssistEnabled && preservedAiContent && !aiPreview) {
      // AI is being turned back on and we have preserved content, restore it
      setAiPreview(preservedAiContent)
    }
  }, [aiAssistEnabled, aiPreview, preservedAiContent])

  // Listen for AI compose events from the toggle button
  useEffect(() => {
    const handleAiComposeEvent = (event: CustomEvent) => {
      if (event.detail.fieldId === fieldId) {
        handleAiCompose(event.detail.regenerate || false)
      }
    }

    window.addEventListener('ai-compose', handleAiComposeEvent as EventListener)
    return () => {
      window.removeEventListener('ai-compose', handleAiComposeEvent as EventListener)
    }
  }, [fieldId, handleAiCompose])

  // UI
  return (
    <div className="space-y-2">
      {label && <label className="font-medium text-sm">{label}</label>}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full"
      />
      {aiAssistEnabled && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">AI Preview</span>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => handleAiCompose(true)}
              disabled={aiLoading}
              className="px-1 h-5"
            >
              <RefreshCw className="w-4 h-4 mr-1 inline" /> Regenerate
            </Button>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={handleInsertDraft}
              disabled={!aiPreview}
              className="px-1 h-5"
            >
              Insert
            </Button>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setHistoryOpen((v) => !v)}
              className="px-1 h-5"
            >
              <History className="w-4 h-4 mr-1 inline" /> History
              <ChevronDown className={cn("w-3 h-3 ml-1 transition-transform", historyOpen && "rotate-180")}/>
            </Button>
          </div>
          {aiLoading && <div className="text-xs text-muted-foreground">Generating...</div>}
          {error && <div className="text-xs text-red-500">{error}</div>}
          {aiPreview && (
            <div className="border rounded p-2 bg-muted/50 text-sm whitespace-pre-wrap">
              {aiPreview}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleToggleFavorite(aiPreview)}
                className="ml-2"
                title={favorites.includes(aiPreview) ? "Unstar" : "Star"}
              >
                {favorites.includes(aiPreview) ? <Star className="w-4 h-4 text-yellow-500" /> : <StarOff className="w-4 h-4" />}
              </Button>
            </div>
          )}
          {historyOpen && history.length > 0 && (
            <div className="border rounded p-2 bg-muted/30 mt-1">
              <div className="text-xs mb-1">Recent Drafts:</div>
              {history.map((h, i) => (
                <div key={i} className="flex items-center gap-2 mb-1 last:mb-0">
                  <span className="flex-1 text-xs truncate">{h}</span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => {
                      setAiPreview(h)
                      setPreservedAiContent(h)
                    }}
                    className="px-1 h-5"
                  >
                    Preview
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => onChange(h)}
                    className="px-1 h-5"
                  >
                    Insert
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleFavorite(h)}
                    className="ml-1"
                    title={favorites.includes(h) ? "Unstar" : "Star"}
                  >
                    {favorites.includes(h) ? <Star className="w-4 h-4 text-yellow-500" /> : <StarOff className="w-4 h-4" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {favorites.length > 0 && (
            <div className="border rounded p-2 bg-muted/30 mt-1">
              <div className="text-xs mb-1">Favorites:</div>
              {favorites.map((f, i) => (
                <div key={i} className="flex items-center gap-2 mb-1 last:mb-0">
                  <span className="flex-1 text-xs truncate">{f}</span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => {
                      setAiPreview(f)
                      setPreservedAiContent(f)
                    }}
                    className="px-1 h-5"
                  >
                    Preview
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => onChange(f)}
                    className="px-1 h-5"
                  >
                    Insert
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleFavorite(f)}
                    className="ml-1"
                    title={favorites.includes(f) ? "Unstar" : "Star"}
                  >
                    {favorites.includes(f) ? <Star className="w-4 h-4 text-yellow-500" /> : <StarOff className="w-4 h-4" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Accordion type="single" collapsible className="mt-2">
            <AccordionItem value="advanced">
              <AccordionTrigger onClick={() => setShowAdvanced((v) => !v)}>
                Advanced AI Settings
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Prompt</label>
                  <Textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="w-full text-xs"
                    rows={2}
                  />
                  <div className="text-xs text-muted-foreground">
                    You can override the AI prompt for more control.
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  );
}; 