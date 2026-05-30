import { formatRunStats } from "@/features/workflows/formatRunStats";

describe("formatRunStats", () => {
  it("returns 'No runs yet' when total is zero", () => {
    expect(
      formatRunStats({
        total: 0,
        succeeded: 0,
        successRate: 0,
        lastRunAt: null,
        lastRunStatus: null,
      }),
    ).toBe("No runs yet");
  });

  it("formats counts + percent with generic lifetime copy (NEVER 'today' / '24h')", () => {
    const text = formatRunStats({
      total: 217,
      succeeded: 204,
      successRate: 204 / 217,
      lastRunAt: "2026-05-30T11:00:00Z",
      lastRunStatus: "succeeded",
    });
    expect(text).toBe("Ran 217 times · 94% successful");
    expect(text).not.toMatch(/today/i);
    expect(text).not.toMatch(/24h/i);
  });

  it("uses singular 'time' for one run", () => {
    expect(
      formatRunStats({
        total: 1,
        succeeded: 1,
        successRate: 1,
        lastRunAt: null,
        lastRunStatus: "succeeded",
      }),
    ).toBe("Ran 1 time · 100% successful");
  });
});
