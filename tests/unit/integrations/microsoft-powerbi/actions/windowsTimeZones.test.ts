/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/actions/_shared/windowsTimeZones.ts`
 * — the curated Windows time-zone list backing `localTimeZoneId` on both
 * refresh-schedule actions. Power BI expects a WINDOWS id, never an IANA name.
 */
import { POWERBI_WINDOWS_TIME_ZONE_OPTIONS } from "@/integrations/microsoft-powerbi/actions/_shared/windowsTimeZones";
import { FieldOptionSchema } from "@/contracts/actionMeta";

describe("POWERBI_WINDOWS_TIME_ZONE_OPTIONS", () => {
  it("is non-empty", () => {
    expect(POWERBI_WINDOWS_TIME_ZONE_OPTIONS.length).toBeGreaterThan(0);
  });

  it("has no duplicate values", () => {
    const values = POWERBI_WINDOWS_TIME_ZONE_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("includes UTC itself", () => {
    expect(
      POWERBI_WINDOWS_TIME_ZONE_OPTIONS.some((o) => o.value === "UTC"),
    ).toBe(true);
  });

  it("carries no IANA-style ids (Power BI rejects them)", () => {
    const ianaLike = POWERBI_WINDOWS_TIME_ZONE_OPTIONS.filter((o) =>
      o.value.includes("/"),
    );
    expect(ianaLike).toEqual([]);
  });

  it("every entry satisfies the FieldOption contract", () => {
    for (const option of POWERBI_WINDOWS_TIME_ZONE_OPTIONS) {
      expect(FieldOptionSchema.safeParse(option).success).toBe(true);
    }
  });
});
