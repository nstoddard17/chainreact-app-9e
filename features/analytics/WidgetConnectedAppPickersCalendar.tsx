"use client";

import { SectionHeading } from "./widgetConfigParts";
import { OptionsSelectField } from "./WidgetConnectedAppPickerShared";

/**
 * Calendar-provider picker fields (Google Calendar / Outlook Calendar) for the
 * connected-app config drawer. Split out of WidgetConnectedAppPickers.tsx in the
 * Monday-slice cleanup. Pure move — NO behavior change.
 */

/**
 * Google Calendar calendar field — a manual calendar-id input that DEFAULTS to
 * the viewer's primary calendar, so there's no guessing for the common case.
 *
 * Deliberately NOT a dropdown: listing calendars needs the `calendar.readonly`
 * (calendarList.list) scope, which we do not add silently. The granted
 * `calendar.events` scope reads events on a known calendar id, so the safe v1 is
 * "primary by default, type a calendar ID to target another" (often your email,
 * or a shared calendar's address). Server-side validation stays authoritative.
 */
export function GcalCalendarField({
  value,
  onChange,
  connected,
}: {
  value: string;
  onChange: (v: string) => void;
  connected: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading icon="Clock" label="Calendar" />
      <p className="text-xs text-muted-foreground">
        Defaults to your <span className="font-mono">primary</span> calendar. Enter a calendar ID
        (often your email, or a shared calendar&apos;s address) to target another.
      </p>
      <input
        className="w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-[13px] text-foreground outline-none focus:border-primary"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="primary"
        aria-label="Google Calendar ID"
        spellCheck={false}
        autoComplete="off"
      />
      {!connected && (
        <span className="text-[11px] text-muted-foreground">
          Connect Google Calendar to load this widget&apos;s data.
        </span>
      )}
    </section>
  );
}

/**
 * Outlook Calendar picker (`microsoft-outlook-calendar:calendars`) — OPTIONAL; the
 * empty option means "use your primary calendar" (server defaults to /me/calendarView).
 */
export function OutlookCalendarField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="microsoft-outlook-calendar:calendars"
      icon="Clock"
      sectionLabel="Calendar"
      hint="Defaults to your primary calendar. Pick another to scope the widget."
      disconnectedHint="Connect Outlook Calendar to choose a calendar."
      loadingNoun="calendars"
      errorFallback="Couldn't load Outlook calendars."
      ariaLabel="Outlook calendar"
      placeholder="Your primary calendar"
      {...props}
    />
  );
}
