/**
 * Typed connected-analytics error → customer-safe display state (CD-3A).
 *
 * Every state the query route can return maps to fixed copy + an action kind
 * here; raw backend messages are shown ONLY where the server's copy is itself
 * the designed customer-safe validation sentence (INVALID_QUERY in the
 * builder, where it names the field to fix). Everything unknown falls back to
 * a generic message — never a stack trace or provider payload.
 */

export type InsightErrorAction = "connect" | "reconnect" | "retry" | "edit" | "none";

export interface InsightErrorDisplay {
  title: string;
  body: string;
  action: InsightErrorAction;
}

export function insightErrorDisplay(
  code: string,
  opts: {
    sourceLabel: string;
    /** Server message — used only for the codes whose copy is designed safe. */
    message?: string;
    /** "builder" shows fix-it validation copy; "widget" shows edit-widget copy. */
    context: "builder" | "widget";
    retryAfterSeconds?: number;
  },
): InsightErrorDisplay {
  const { sourceLabel, context } = opts;
  switch (code) {
    case "MISSING_CREDENTIAL":
      return {
        title: `Connect ${sourceLabel}`,
        body: `Connect ${sourceLabel} to use this data in Analytics.`,
        action: "connect",
      };
    case "RECONNECT_REQUIRED":
      return {
        title: `Reconnect ${sourceLabel}`,
        body: `Your ${sourceLabel} connection needs to be re-authorized before this data can refresh.`,
        action: "reconnect",
      };
    case "RATE_LIMITED":
      return {
        title: "Refreshed too recently",
        body: `${sourceLabel} data has been refreshed several times recently. Try again shortly.`,
        action: "retry",
      };
    case "MIXED_CURRENCY":
      return {
        title: "More than one currency",
        body: "This amount includes more than one currency. Filter to one currency or choose a count instead.",
        action: context === "builder" ? "none" : "edit",
      };
    case "PROVIDER_ERROR":
      return {
        title: `${sourceLabel} is unavailable`,
        body: `${sourceLabel} couldn't be reached right now. Your settings are unchanged — try again in a bit.`,
        action: "retry",
      };
    case "UNKNOWN_ENTITY":
      return {
        title: "Selection not found",
        body:
          context === "builder"
            ? "One or more selected items were not found. Remove them and pick again."
            : "This insight refers to items that no longer exist. Edit the widget to update it.",
        action: context === "builder" ? "none" : "edit",
      };
    case "UNKNOWN_SOURCE":
    case "UNKNOWN_DATASET":
      return {
        title: "Data no longer available",
        body: "This insight uses settings that are no longer available. Edit the widget to update it.",
        action: "edit",
      };
    case "INVALID_QUERY":
      if (context === "builder" && opts.message) {
        // validateQuery's sentences are designed customer-safe fix-it copy.
        return { title: "Adjust your choices", body: opts.message, action: "none" };
      }
      return {
        title: "Settings need an update",
        body: "This insight uses settings that are no longer available. Edit the widget to update it.",
        action: "edit",
      };
    default:
      return {
        title: "Couldn't load this insight",
        body: "Something went wrong loading this data. Try again.",
        action: "retry",
      };
  }
}
