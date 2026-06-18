"use client";

import { AnalyticsIcon } from "@/components/analytics/icons";

/**
 * Small shared presentational parts for the widget config drawer (Slice
 * ANALYTICS-SOURCES-SLACK-UI-1). Extracted so WidgetConfigPanel and
 * WidgetConnectedAppConfig can share them without either growing past the
 * file-size limit.
 */

export function SectionHeading({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
      <span className="text-primary">
        <AnalyticsIcon name={icon} size={11} />
      </span>
      <span>{label}</span>
    </div>
  );
}

export function SourceToggle({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] " +
        (active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border bg-muted text-foreground hover:border-foreground/25")
      }
    >
      <AnalyticsIcon name={icon} size={12} /> {label}
    </button>
  );
}
