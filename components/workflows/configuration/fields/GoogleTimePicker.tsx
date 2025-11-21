"use client"

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  MINUTES_IN_DAY,
  formatMinutesForDisplay,
  minutesToTimeString,
  timeStringToMinutes,
  normalizeMinutes,
  getCurrentMinutes,
} from "@/lib/utils/time";

const OPTION_INTERVAL = 15;
const KEYBOARD_INTERVAL = 15;
const CONTEXT_WINDOW_MINUTES = 30;

interface TimeOption {
  minutes: number;
  value: string;
  label: string;
  tokens: string[];
}

interface GoogleTimePickerProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Generate Google Calendar style time options (30 min granularity) with multiple search tokens.
 */
function buildTimeOptions(): TimeOption[] {
  const options: TimeOption[] = [];

  for (let minutes = 0; minutes < MINUTES_IN_DAY; minutes += OPTION_INTERVAL) {
    const label = formatMinutesForDisplay(minutes, { uppercase: true });
    const labelLower = label.toLowerCase();
    const compactLabel = labelLower.replace(/\s/g, "");
    const colonlessLabel = compactLabel.replace(/:/g, "");
    const timeValue = minutesToTimeString(minutes);
    const numeric = timeValue.replace(":", "");
    const hour24 = Math.floor(minutes / 60);
    const hour12 = hour24 % 12 || 12;
    const minute = minutes % 60;
    const minuteStr = minute.toString().padStart(2, "0");
    const periodLetter = hour24 >= 12 ? "p" : "a";
    const shortToken =
      minute === 0 ? `${hour12}${periodLetter}` : `${hour12}${minuteStr}${periodLetter}`;

    options.push({
      minutes,
      value: timeValue,
      label,
      tokens: [
        labelLower,
        compactLabel,
        colonlessLabel,
        numeric,
        shortToken,
        `${hour12}${minuteStr}`,
        `${hour24}${minuteStr}`,
      ].filter(Boolean),
    });
  }

  return options;
}

const TIME_OPTIONS = buildTimeOptions();

/**
 * Convert raw user input to minutes after midnight.
 */
function parseUserInput(input: string, referenceValue?: string): number | null {
  if (!input) return null;
  let core = input.trim().toLowerCase();
  if (core === "") return null;

  // Remove spaces
  core = core.replace(/\s+/g, "");

  // Extract AM/PM hints like "4p" or "430am"
  let meridiem: "am" | "pm" | null = null;
  const meridiemMatch = core.match(/(am|pm|a|p)$/);
  if (meridiemMatch) {
    const marker = meridiemMatch[1];
    meridiem = marker.startsWith("p") ? "pm" : "am";
    core = core.slice(0, -marker.length);
  }

  if (core === "") return null;

  const match = core.match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;

  if (Number.isNaN(hour) || Number.isNaN(minute) || minute > 59) {
    return null;
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    let adjustedHour = hour % 12;
    if (meridiem === "pm") {
      adjustedHour += 12;
    }
    return adjustedHour * 60 + minute;
  }

  if (hour >= 0 && hour <= 23) {
    return hour * 60 + minute;
  }

  // If still ambiguous (e.g., "4" or "430"), infer from reference time
  if (hour >= 1 && hour <= 12) {
    const referenceMinutes =
      timeStringToMinutes(referenceValue) ??
      new Date().getHours() * 60 + new Date().getMinutes();

    const amHour = hour === 12 ? 0 : hour;
    const pmHour = hour === 12 ? 12 : hour + 12;
    const amMinutes = amHour * 60 + minute;
    const pmMinutes = pmHour * 60 + minute;
    const amDistance = Math.abs(amMinutes - referenceMinutes);
    const pmDistance = Math.abs(pmMinutes - referenceMinutes);
    return (amDistance <= pmDistance ? amMinutes : pmMinutes);
  }

  return null;
}

export function GoogleTimePicker({
  value,
  onChange,
  placeholder = "Add time",
  disabled,
  className,
}: GoogleTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(
    value ? formatMinutesForDisplay(timeStringToMinutes(value) ?? 0, { uppercase: true }) : ""
  );
  const [isInvalid, setIsInvalid] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectingRef = useRef(false);
  const [popoverWidth, setPopoverWidth] = useState<number>();
  const selectInputContents = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.select();
    });
  }, []);

  // Sync local display when value changes externally
  useEffect(() => {
    if (!value) {
      setDraftValue("");
      return;
    }
    const minutes = timeStringToMinutes(value);
    if (minutes !== null) {
      setDraftValue(formatMinutesForDisplay(minutes, { uppercase: true }));
    }
  }, [value]);

  // Track popover width to match the trigger width
  useEffect(() => {
    if (!open || !wrapperRef.current) return;

    const node = wrapperRef.current;
    const updateWidth = () => setPopoverWidth(node.getBoundingClientRect().width);
    updateWidth();

    const resizeObserver = new ResizeObserver(() => updateWidth());
    resizeObserver.observe(node);

    return () => resizeObserver.disconnect();
  }, [open]);

  const handleCommit = useCallback(() => {
    const trimmed = draftValue.trim();
    if (trimmed === "") {
      onChange("");
      setIsInvalid(false);
      return;
    }

    const parsed = parseUserInput(trimmed, value);
    if (parsed === null) {
      setIsInvalid(true);
      return;
    }

    const normalizedValue = minutesToTimeString(parsed);
    setDraftValue(formatMinutesForDisplay(parsed, { uppercase: true }));
    setIsInvalid(false);
    onChange(normalizedValue);
  }, [draftValue, onChange, value]);

  const toggleOpen = useCallback(
    (next?: boolean) => {
      if (disabled) return;
      setOpen((prev) => (typeof next === "boolean" ? next : !prev));
    },
    [disabled]
  );

  const handleSelect = useCallback(
    (minutes: number) => {
      selectingRef.current = false;
      const normalizedValue = minutesToTimeString(minutes);
      setDraftValue(formatMinutesForDisplay(minutes, { uppercase: true }));
      setIsInvalid(false);
      onChange(normalizedValue);
      setOpen(false);
      inputRef.current?.focus();
    },
    [onChange]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const reference =
        timeStringToMinutes(value) ??
        parseUserInput(draftValue, value) ??
        9 * 60; // default to 9:00 AM
      const step = event.shiftKey ? 5 : KEYBOARD_INTERVAL;
      const direction = event.key === "ArrowUp" ? 1 : -1;
      const nextMinutes = normalizeMinutes((reference ?? 0) + direction * step);

      handleSelect(nextMinutes);
      toggleOpen(true);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      handleCommit();
      setOpen(false);
    }

    if (event.key === "Tab") {
      handleCommit();
      setOpen(false);
    }

    if (event.key === "Escape") {
      setOpen(false);
      setDraftValue(value ? formatMinutesForDisplay(timeStringToMinutes(value) ?? 0, { uppercase: true }) : "");
    }
  };

  const normalizedQuery = draftValue.trim().toLowerCase();
  const collapsedQuery = normalizedQuery.replace(/\s+/g, "");
  const colonlessQuery = collapsedQuery.replace(/:/g, "");
  const shortQuery = colonlessQuery.replace(/(am|pm)/g, (match) => match[0]);
  const queryTokens = [normalizedQuery, collapsedQuery, colonlessQuery, shortQuery].filter(Boolean);
  const hasSearchQuery = queryTokens.length > 0;

  const referenceMinutes =
    timeStringToMinutes(value) ??
    parseUserInput(draftValue, value) ??
    getCurrentMinutes();

  const listOptions = hasSearchQuery
    ? TIME_OPTIONS.filter((option) =>
        queryTokens.some((query) => option.tokens.some((token) => token.includes(query)))
      )
    : TIME_OPTIONS;

  const activeValue = value ?? "";
  const scrollAnchorValue = minutesToTimeString(
    normalizeMinutes(referenceMinutes - CONTEXT_WINDOW_MINUTES)
  );

  useEffect(() => {
    if (!open || !listRef.current) return;

    requestAnimationFrame(() => {
      let target: HTMLButtonElement | null = null;

      if (!hasSearchQuery) {
        target =
          listRef.current?.querySelector<HTMLButtonElement>(
            `[data-time-value="${scrollAnchorValue}"]`
          ) || null;
      }

      if (!target) {
        target = listRef.current?.querySelector<HTMLButtonElement>('[data-selected="true"]') || null;
      }

      target?.scrollIntoView({ block: hasSearchQuery ? "center" : "start" });
    });
  }, [open, scrollAnchorValue, hasSearchQuery, value]);

  const renderOptionButton = (option: TimeOption) => (
    <button
      key={option.value}
      type="button"
      role="option"
      aria-selected={option.value === activeValue}
      data-selected={option.value === activeValue ? "true" : undefined}
      data-time-value={option.value}
      className={cn(
        "flex w-full items-center justify-between px-4 py-2 text-sm transition-colors",
        option.value === activeValue
          ? "bg-muted text-foreground"
          : "hover:bg-muted/70"
      )}
      onMouseDown={(event) => {
        event.preventDefault();
        selectingRef.current = true;
      }}
      onClick={() => handleSelect(option.minutes)}
    >
      <span>{option.label}</span>
      {option.value === activeValue && <Check className="h-4 w-4 text-primary" />}
    </button>
  );

  return (
    <Popover open={open && !disabled} onOpenChange={(next) => toggleOpen(next)}>
      <PopoverTrigger asChild>
        <div
          ref={wrapperRef}
          className="relative"
          onClick={() => {
            if (disabled) return;
            inputRef.current?.focus();
            selectInputContents();
            toggleOpen(true);
          }}
        >
          <Input
            ref={inputRef}
            value={draftValue}
            onFocus={() => {
              if (disabled) return;
              toggleOpen(true);
              selectInputContents();
            }}
            onBlur={() => {
              requestAnimationFrame(() => {
                if (selectingRef.current) {
                  selectingRef.current = false;
                  return;
                }
                handleCommit();
                setOpen(false);
              });
            }}
            onChange={(event) => {
              setDraftValue(event.target.value);
              setIsInvalid(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            className={cn(
              "h-11 pl-3 pr-9 text-base font-medium tracking-tight",
              "focus-visible:ring-2 focus-visible:ring-offset-0",
              isInvalid && "border-destructive focus-visible:ring-destructive",
              className
            )}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={placeholder}
          />
          <button
            type="button"
            aria-label="Toggle time options"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-ring"
            onMouseDown={(event) => {
              event.preventDefault();
              if (disabled) return;
              if (open) {
                handleCommit();
              }
              toggleOpen(!open);
              inputRef.current?.focus();
              selectInputContents();
            }}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </PopoverTrigger>
      {!disabled && (
        <PopoverContent
          className="p-0"
          align="start"
          style={popoverWidth ? { width: popoverWidth } : undefined}
        >
          <div className="py-2">
            <div className="max-h-72 overflow-y-auto" ref={listRef}>
              {listOptions.length > 0 ? (
                <div className="space-y-0">{listOptions.map(renderOptionButton)}</div>
              ) : (
                <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                  {draftValue.trim()
                    ? <>No times match “{draftValue.trim()}”. Type Enter to use it.</>
                    : "No time found."}
                </div>
              )}
            </div>
            <div className="border-t px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Type “4p” or “16:45” then press Enter
            </div>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
