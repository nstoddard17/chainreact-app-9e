/**
 * @jest-environment node
 */
import {
  RowChangedInputConfigSchema,
  requiresExtendedSnapshot,
  SNAPSHOT_ROW_LIMIT_DEFAULT,
  SNAPSHOT_ROW_LIMIT_MAX,
  SNAPSHOT_ROW_LIMIT_MIN,
} from "@/integrations/google-sheets/triggers/rowChanged/schema";

describe("RowChangedInputConfigSchema", () => {
  describe("backwards-compat — Slice 5 minimal shape", () => {
    it("accepts the minimal Slice 5 config (spreadsheetId + sheetName)", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      });
      expect(result).toEqual({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        headerRow: false,
        changeKinds: ["added"],
        snapshotRowLimit: SNAPSHOT_ROW_LIMIT_DEFAULT,
        keyColumn: null,
      });
    });

    it("defaults headerRow to false", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      });
      expect(result.headerRow).toBe(false);
    });

    it("defaults changeKinds to ['added'] — preserves Slice 5 fast path", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      });
      expect(result.changeKinds).toEqual(["added"]);
    });

    it("defaults snapshotRowLimit to 1000", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      });
      expect(result.snapshotRowLimit).toBe(1000);
      expect(SNAPSHOT_ROW_LIMIT_DEFAULT).toBe(1000);
    });

    it("defaults keyColumn to null", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      });
      expect(result.keyColumn).toBeNull();
    });
  });

  describe("required fields", () => {
    it("rejects missing spreadsheetId", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({ sheetName: "Sheet1" }),
      ).toThrow(/spreadsheetId/);
    });

    it("rejects missing sheetName", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({ spreadsheetId: "ss-1" }),
      ).toThrow(/sheetName/);
    });

    it("rejects empty spreadsheetId", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "",
          sheetName: "Sheet1",
        }),
      ).toThrow();
    });

    it("rejects empty sheetName", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "",
        }),
      ).toThrow();
    });
  });

  describe("changeKinds", () => {
    it("accepts ['added']", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["added"],
      });
      expect(result.changeKinds).toEqual(["added"]);
    });

    it("accepts ['updated']", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["updated"],
      });
      expect(result.changeKinds).toEqual(["updated"]);
    });

    it("accepts ['removed']", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["removed"],
      });
      expect(result.changeKinds).toEqual(["removed"]);
    });

    it("accepts all three combined", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["added", "updated", "removed"],
      });
      expect(result.changeKinds).toEqual(["added", "updated", "removed"]);
    });

    it("rejects empty changeKinds array", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          changeKinds: [],
        }),
      ).toThrow(/at least one/);
    });

    it("rejects unknown changeKind values", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          changeKinds: ["modified"],
        }),
      ).toThrow();
    });

    it("rejects duplicate changeKind entries", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          changeKinds: ["added", "added"],
        }),
      ).toThrow(/duplicate/i);
    });
  });

  describe("snapshotRowLimit", () => {
    it("accepts the minimum (100)", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        snapshotRowLimit: SNAPSHOT_ROW_LIMIT_MIN,
      });
      expect(result.snapshotRowLimit).toBe(100);
    });

    it("accepts the maximum (10000)", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        snapshotRowLimit: SNAPSHOT_ROW_LIMIT_MAX,
      });
      expect(result.snapshotRowLimit).toBe(10000);
    });

    it("rejects below the minimum (99)", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          snapshotRowLimit: 99,
        }),
      ).toThrow(/100/);
    });

    it("rejects above the maximum (10001)", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          snapshotRowLimit: 10001,
        }),
      ).toThrow(/10000/);
    });

    it("rejects non-integer", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          snapshotRowLimit: 1000.5,
        }),
      ).toThrow();
    });

    it("rejects negative values", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          snapshotRowLimit: -1,
        }),
      ).toThrow();
    });
  });

  describe("keyColumn", () => {
    it("accepts a non-empty string with headerRow=true", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        headerRow: true,
        keyColumn: "id",
      });
      expect(result.keyColumn).toBe("id");
    });

    it("accepts null (positional mode default)", () => {
      const result = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        keyColumn: null,
      });
      expect(result.keyColumn).toBeNull();
    });

    it("rejects empty string", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          headerRow: true,
          keyColumn: "",
        }),
      ).toThrow();
    });

    it("rejects keyColumn without headerRow=true", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          keyColumn: "id",
          // headerRow defaults to false
        }),
      ).toThrow(/keyColumn requires headerRow/);
    });

    it("rejects keyColumn when headerRow is explicitly false", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          headerRow: false,
          keyColumn: "id",
        }),
      ).toThrow(/keyColumn requires headerRow/);
    });
  });

  describe("strict mode — V1 / builder chrome rejection", () => {
    it("rejects V1 polling chrome: hasHeaders", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          hasHeaders: true,
        }),
      ).toThrow();
    });

    it("rejects V1 polling chrome: skipEmptyRows", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          skipEmptyRows: true,
        }),
      ).toThrow();
    });

    it("rejects V1 polling chrome: requiredColumns", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          requiredColumns: ["A", "B"],
        }),
      ).toThrow();
    });

    it("rejects V1 polling chrome: googleSheetsRowSnapshot", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          googleSheetsRowSnapshot: { rowHashes: {}, rowCount: 0 },
        }),
      ).toThrow();
    });

    it("rejects builder chrome: arbitrary unknown field", () => {
      expect(() =>
        RowChangedInputConfigSchema.parse({
          spreadsheetId: "ss-1",
          sheetName: "Sheet1",
          extraField: "anything",
        }),
      ).toThrow();
    });
  });

  describe("requiresExtendedSnapshot", () => {
    it("returns false for changeKinds=['added']", () => {
      const config = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      });
      expect(requiresExtendedSnapshot(config)).toBe(false);
    });

    it("returns true when 'updated' is included", () => {
      const config = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["added", "updated"],
      });
      expect(requiresExtendedSnapshot(config)).toBe(true);
    });

    it("returns true when 'removed' is included", () => {
      const config = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["added", "removed"],
      });
      expect(requiresExtendedSnapshot(config)).toBe(true);
    });

    it("returns true when both 'updated' and 'removed' are included", () => {
      const config = RowChangedInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        changeKinds: ["updated", "removed"],
      });
      expect(requiresExtendedSnapshot(config)).toBe(true);
    });
  });
});
