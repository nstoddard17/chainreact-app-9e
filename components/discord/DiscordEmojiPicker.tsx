import React, { useEffect, useState, useRef } from "react";
import { fetchGuildEmojis } from "@/lib/discord/fetchGuildEmojis";
import { UNICODE_EMOJI_CATEGORIES, getEmojiByCategory } from "@/lib/discord/emojiData";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiscordEmojiPickerProps {
  guildId?: string;
  onSelect: (emoji: any) => void;
  trigger: React.ReactNode | null;
}

export function DiscordEmojiPicker({ guildId, onSelect, trigger }: DiscordEmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [customEmojis, setCustomEmojis] = useState<any[]>([]);
  const [category, setCategory] = useState("Smileys & Emotion");
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!guildId) return;
    const cached = localStorage.getItem(`guild-emojis-${guildId}`);
    if (cached) setCustomEmojis(JSON.parse(cached));
    fetchGuildEmojis(guildId).then(emojis => {
      setCustomEmojis(emojis);
      localStorage.setItem(`guild-emojis-${guildId}`, JSON.stringify(emojis));
    });
  }, [guildId]);

  // Scroll to show emoji picker when it opens
  useEffect(() => {
    if (open && trigger !== null) {
      // Small delay to ensure the picker is rendered
      const timer = setTimeout(() => {
        // Get the picker element
        const pickerElement = document.querySelector('[data-emoji-picker]');
        if (pickerElement) {
          // Scroll the picker into view with smooth behavior
          pickerElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
          });
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [open, trigger]);

  // Click outside handler
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    // Add event listener with a small delay to avoid immediate closure
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const categories = [
    ...UNICODE_EMOJI_CATEGORIES,
    ...(customEmojis.length ? [{ key: "custom", label: "Custom" }] : []),
  ];

  const emojis =
    category === "custom"
      ? customEmojis
      : getEmojiByCategory(category, search);

  const renderEmojiPicker = () => (
    <div 
      ref={pickerRef}
      className="bg-background border border-border rounded-lg shadow-lg w-[800px] max-h-[500px] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">Choose an emoji</h3>
        {trigger !== null && (
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-md hover:bg-muted transition-colors"
            type="button"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-md text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            placeholder="Search emojis..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex border-b border-border bg-muted/20">
        <div className="flex overflow-x-auto scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat.key}
              className={cn(
                "flex-shrink-0 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap",
                category === cat.key
                  ? "bg-background text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              onClick={() => setCategory(cat.key)}
              type="button"
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Emojis Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {emojis.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-4xl mb-2">🔍</div>
            <p className="text-sm text-muted-foreground">No emojis found</p>
            <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
          </div>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(2rem, 1fr))' }}>
            {emojis.map(emoji =>
              emoji.custom ? (
                <button
                  key={emoji.id}
                  onClick={() => { 
                    onSelect(emoji); 
                    if (trigger !== null) setOpen(false);
                  }}
                  className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-muted transition-colors group"
                  type="button"
                  title={emoji.name}
                >
                  <img 
                    src={emoji.url} 
                    alt={emoji.name} 
                    className="w-6 h-6 group-hover:scale-110 transition-transform" 
                  />
                </button>
              ) : (
                <button
                  key={emoji.unified}
                  onClick={() => { 
                    onSelect(emoji); 
                    if (trigger !== null) setOpen(false);
                  }}
                  className="w-10 h-10 text-xl flex items-center justify-center rounded-md hover:bg-muted transition-colors group"
                  type="button"
                  title={emoji.name}
                >
                  <span className="group-hover:scale-110 transition-transform">
                    {emoji.native}
                  </span>
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border bg-muted/20">
        <p className="text-xs text-muted-foreground text-center">
          {emojis.length} emoji{emojis.length !== 1 ? 's' : ''} in {category}
        </p>
      </div>
    </div>
  );

  // If trigger is null, render picker content directly (for popover use)
  if (trigger === null) {
    return (
      <div
        ref={pickerRef}
        className="fixed z-[9999]"
        style={{ 
          top: "50%", 
          left: "50%", 
          transform: "translate(-50%, -50%)",
          maxWidth: "90vw"
        }}
      >
        {renderEmojiPicker()}
      </div>
    );
  }

  // Normal trigger-based rendering
  return (
    <div className="relative inline-block">
      <span onClick={() => setOpen(v => !v)}>{trigger}</span>
      {open && (
        <div
          data-emoji-picker
          className="fixed z-[9999]"
          style={{ 
            top: "50%", 
            left: "50%", 
            transform: "translate(-50%, -50%)",
            maxWidth: "90vw"
          }}
        >
          {renderEmojiPicker()}
        </div>
      )}
    </div>
  );
} 