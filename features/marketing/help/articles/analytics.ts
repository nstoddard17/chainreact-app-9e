import type { HelpArticle } from "../helpTypes";

/**
 * Analytics articles (ANALYTICS-RELEASE-1).
 *
 * Customer-facing only. Claims here match what the shipped product actually
 * does: the generic Custom Insight builder, the five chart types, date
 * behavior (inclusive end dates, UTC), previous-period comparison, CSV export,
 * and drill-down with Back/Reset/Save.
 *
 * DELIBERATELY OMITTED: internal certification status, preview-only datasets,
 * provider scan caps, cache internals, and anything about how exposure is
 * decided. Customers see the sources they can actually use; the reasons a
 * source isn't listed stay internal.
 */
export const ANALYTICS_ARTICLES: readonly HelpArticle[] = [
  {
    slug: "build-a-custom-insight",
    title: "Build a Custom Insight",
    summary:
      "Turn your workflow runs or a connected app's data into a chart, one plain-language choice at a time.",
    category: "analytics",
    keywords: [
      "analytics", "insight", "chart", "dashboard", "widget", "report", "graph", "measure",
    ],
    updatedAt: "2026-07-26",
    content: [
      {
        kind: "paragraph",
        text: "A Custom Insight is a chart you build yourself. You pick where the data comes from and what you want to see, and ChainReact works out the rest — there's nothing to write and no query language to learn.",
      },
      {
        kind: "steps",
        items: [
          "Open Analytics and choose Edit dashboard, then Add a widget.",
          "Pick Custom Insight.",
          "App — choose where the data comes from, such as ChainReact or a connected app.",
          "Data — choose what you're looking at, such as workflow runs, invoices, or orders.",
          "Show — choose the number you want, such as a count or a total.",
          "Group by — choose how to break it down: over time, or by a category such as status.",
          "Only include — add filters if you want to narrow it down.",
          "Time — choose the date range, and how to group time for charts over time.",
          "Chart — choose how to display it, then Apply and Done editing to save.",
        ],
      },
      {
        kind: "note",
        text: "Only the choices that make sense together are offered. If you change one choice and another no longer fits, ChainReact clears just that part and tells you why.",
      },
      {
        kind: "paragraph",
        text: "Which apps appear depends on what your account has connected. If an app you've connected isn't listed, its data isn't available for charts yet.",
      },
    ],
    relatedArticleSlugs: [
      "choose-a-chart-type",
      "date-ranges-and-comparison",
      "explore-a-chart-value",
    ],
  },
  {
    slug: "choose-a-chart-type",
    title: "Choose a chart type",
    summary:
      "Number, line, bar, table and donut — what each one is for, and why some aren't always offered.",
    category: "analytics",
    keywords: ["chart", "number", "kpi", "line", "bar", "table", "donut", "pie", "visual"],
    updatedAt: "2026-07-26",
    content: [
      {
        kind: "list",
        items: [
          "Number — a single figure, such as how many runs succeeded this month.",
          "Line — a figure over time, so you can see the trend.",
          "Bar — compare groups side by side, or show time as columns.",
          "Table — the exact figures, row by row, including a Records count where available.",
          "Donut — the share each group makes up of the whole.",
        ],
      },
      {
        kind: "paragraph",
        text: "Only chart types that suit your choices are offered. A single number can't be drawn as a line, and a breakdown by category can't be drawn as a time line.",
      },
      {
        kind: "note",
        text: "Donut is offered only when the groups genuinely add up to the whole. If some data was left out, shares aren't shown as percentages — the slices are still there, but ChainReact won't imply a total it can't stand behind.",
      },
      {
        kind: "paragraph",
        text: "Any chart can show its underlying figures: choose View data to switch to a table, and View chart to switch back.",
      },
    ],
    relatedArticleSlugs: ["build-a-custom-insight", "export-a-chart-to-csv"],
  },
  {
    slug: "date-ranges-and-comparison",
    title: "Date ranges and comparing periods",
    summary:
      "Pick a range in plain language, see exactly which dates are included, and compare against the period before.",
    category: "analytics",
    keywords: [
      "date", "range", "period", "compare", "previous", "month", "custom", "utc", "timezone",
    ],
    updatedAt: "2026-07-26",
    content: [
      {
        kind: "paragraph",
        text: "Every Insight has its own date range — it doesn't follow the dashboard's range selector. Choose a preset such as Last 30 days, This month or Year to date, or choose Custom and pick your own start and end dates.",
      },
      {
        kind: "note",
        text: "Both dates you pick are included. Choosing 1 July to 31 July covers the whole of 31 July.",
      },
      {
        kind: "paragraph",
        text: "Underneath the controls, ChainReact shows the exact window the chart covers, so you never have to guess. Dates are handled in UTC, which is why a range can look slightly different from your local calendar day.",
      },
      {
        kind: "heading",
        text: "Comparing with the previous period",
      },
      {
        kind: "paragraph",
        text: "Tick Compare with the previous period to see the same measure for the period immediately before — the same length of time, ending where your current range begins. The dates being compared are shown before you save.",
      },
      {
        kind: "list",
        items: [
          "Number — shows the change beneath the figure.",
          "Line and bar — draw the previous period alongside, in a muted dashed or hatched style.",
          "Table — adds Previous period, Change and Change % columns.",
          "Donut — comparison isn't available, because two periods can't share one ring honestly.",
        ],
      },
      {
        kind: "note",
        text: "Changes are described neutrally. ChainReact won't call a rise good or a fall bad — more failed runs isn't good news, and lower spend isn't bad news.",
      },
    ],
    relatedArticleSlugs: ["build-a-custom-insight", "explore-a-chart-value"],
  },
  {
    slug: "explore-a-chart-value",
    title: "Explore a value in a chart",
    summary:
      "Click a bar, slice or point to narrow the question, step back, and save what you found as a new chart.",
    category: "analytics",
    keywords: ["drill", "drill-down", "explore", "filter", "breadcrumb", "back", "reset", "segment"],
    updatedAt: "2026-07-26",
    content: [
      {
        kind: "paragraph",
        text: "When a value can be explored, selecting it narrows the chart to just that slice of the data. A trail above the chart shows where you are, and a short line explains what was applied — for example “Exploring: Status is Paid”.",
      },
      {
        kind: "steps",
        items: [
          "Select a bar, donut slice, chart point, or a table row's Explore button.",
          "The chart reloads, narrowed to that value or that date range.",
          "Keep going if you want — you can explore a few levels deep.",
          "Back returns to the previous step; Reset returns to the chart you saved.",
        ],
      },
      {
        kind: "paragraph",
        text: "You can also explore with the keyboard: focus the chart, move with the arrow keys, and press Enter. On a chart that's comparing periods, hold Shift to explore the previous period's own dates instead.",
      },
      {
        kind: "note",
        text: "Not every value can be explored. Some groups can't be turned into a filter safely — those stay as ordinary readable figures rather than pretending to be clickable.",
      },
      {
        kind: "heading",
        text: "Saving what you found",
      },
      {
        kind: "paragraph",
        text: "If you have permission to edit the dashboard, choose Save as new insight to keep the explored question as its own widget. It's added next to the original, with a suggested title you can change. Your original chart is never altered, and exploring is temporary — reloading the page returns to the saved chart.",
      },
      {
        kind: "paragraph",
        text: "Exploring narrows the summary you're already looking at. It doesn't open individual records from a connected app.",
      },
    ],
    relatedArticleSlugs: ["build-a-custom-insight", "export-a-chart-to-csv"],
  },
  {
    slug: "export-a-chart-to-csv",
    title: "Export a chart to CSV",
    summary:
      "Download the figures behind any saved Insight, including how fresh and how complete they are.",
    category: "analytics",
    keywords: ["csv", "export", "download", "spreadsheet", "excel", "data"],
    updatedAt: "2026-07-26",
    content: [
      {
        kind: "steps",
        items: [
          "Find the saved Insight on your dashboard.",
          "Choose the export icon in the widget's header.",
          "The CSV downloads straight away.",
        ],
      },
      {
        kind: "paragraph",
        text: "The file contains exactly what the chart is showing — including any exploring you've done. Each row carries the source, the measure, the dates, the value and its unit, so a row still makes sense on its own in a spreadsheet.",
      },
      {
        kind: "list",
        items: [
          "Values are exported as numbers you can calculate with, alongside a formatted label.",
          "Money is exported as a plain amount with its currency code.",
          "Empty means no value; 0 means a real zero.",
          "When you're comparing periods, each row says whether it's the current or previous period.",
        ],
      },
      {
        kind: "note",
        text: "Every file records how fresh the data was and whether it was complete, so a partial export can't be mistaken for a full one.",
      },
      {
        kind: "paragraph",
        text: "This is different from Export on the dashboard itself, which saves the dashboard's layout as a JSON file rather than one chart's figures.",
      },
    ],
    relatedArticleSlugs: ["choose-a-chart-type", "why-some-data-isnt-available"],
  },
  {
    slug: "why-some-data-isnt-available",
    title: "Why some data or figures aren't available",
    summary:
      "Cached, partial and unavailable data explained — and why an app or measure you expected might be missing.",
    category: "analytics",
    keywords: [
      "cached", "stale", "partial", "incomplete", "missing", "unavailable", "refresh", "limit",
    ],
    updatedAt: "2026-07-26",
    content: [
      {
        kind: "heading",
        text: "Cached and stale data",
      },
      {
        kind: "paragraph",
        text: "Charts built from a connected app reuse recent results for a short time rather than asking the app again on every page load. The chart says how old the figures are, and offers Refresh to fetch them again.",
      },
      {
        kind: "paragraph",
        text: "If the app can't be reached, ChainReact may keep showing the last figures it has and say so, rather than showing you nothing.",
      },
      {
        kind: "heading",
        text: "Partial data",
      },
      {
        kind: "paragraph",
        text: "Charts read a bounded amount of data so they stay fast and stay within what the connected app allows. If there was more than the chart could read, it says so — for example that it's based on the most recent records in that range. Data is never quietly cut short.",
      },
      {
        kind: "heading",
        text: "Missing apps and measures",
      },
      {
        kind: "list",
        items: [
          "The app isn't connected — connect it on the Apps page.",
          "The app is connected, but its data isn't available for charts yet.",
          "The measure doesn't fit the rest of your choices, so it isn't offered.",
          "A measure describes something as it is right now, so it can't be charted over time or compared with a previous period.",
        ],
      },
      {
        kind: "note",
        text: "ChainReact only offers figures it can stand behind. If a total would be misleading — mixing currencies, for instance — it says so instead of showing a number that looks right but isn't.",
      },
    ],
    relatedArticleSlugs: ["build-a-custom-insight", "export-a-chart-to-csv"],
  },
];
