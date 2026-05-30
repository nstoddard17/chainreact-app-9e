import { formatRelativeTime } from "@/features/workflows/relativeTime";

describe("formatRelativeTime", () => {
  const NOW = new Date("2026-05-30T12:00:00Z");

  it("returns 'just now' for sub-45-second ages and future times", () => {
    expect(formatRelativeTime("2026-05-30T11:59:30Z", NOW)).toBe("just now");
    expect(formatRelativeTime("2026-05-30T12:00:05Z", NOW)).toBe("just now");
  });

  it("formats minutes / hours / days / weeks / months / years", () => {
    expect(formatRelativeTime("2026-05-30T11:57:00Z", NOW)).toBe("3 minutes ago");
    expect(formatRelativeTime("2026-05-30T11:00:00Z", NOW)).toBe("1 hour ago");
    expect(formatRelativeTime("2026-05-29T12:00:00Z", NOW)).toBe("yesterday");
    expect(formatRelativeTime("2026-05-27T12:00:00Z", NOW)).toBe("3 days ago");
    expect(formatRelativeTime("2026-05-22T12:00:00Z", NOW)).toBe("last week");
    expect(formatRelativeTime("2026-05-15T12:00:00Z", NOW)).toBe("2 weeks ago");
    expect(formatRelativeTime("2026-04-15T12:00:00Z", NOW)).toBe("last month");
    expect(formatRelativeTime("2026-01-15T12:00:00Z", NOW)).toBe("4 months ago");
    expect(formatRelativeTime("2025-05-30T12:00:00Z", NOW)).toBe("last year");
  });

  it("returns the input verbatim on a non-ISO string", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("not-a-date");
  });
});
