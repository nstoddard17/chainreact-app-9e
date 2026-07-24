/** @jest-environment node */
import {
  PAGE_RANGE_MAX_PAGES,
  PageRangeError,
  parsePageRange,
  selectPages,
} from "@/core/documents/pageRange";

describe("core/documents/pageRange", () => {
  describe("parsePageRange", () => {
    it.each<[string, number[]]>([
      ["3", [3]],
      ["1-5", [1, 2, 3, 4, 5]],
      ["1-3,7,9-10", [1, 2, 3, 7, 9, 10]],
      [" 2 - 4 , 1 ", [1, 2, 3, 4]],
      ["5-5", [5]],
      ["2,2,2", [2]],
      ["9-10,1-3,7", [1, 2, 3, 7, 9, 10]],
    ])("parses %p → %p (sorted, de-duplicated)", (input, expected) => {
      expect(parsePageRange(input)).toEqual(expected);
    });

    it.each<[string]>([
      [""],
      ["   "],
      ["0"],
      ["0-3"],
      ["5-2"],
      ["abc"],
      ["1-"],
      ["-3"],
      ["1,,3"],
      ["1;3"],
      ["1.5"],
      ["1-3-5"],
    ])("rejects %p with PageRangeError", (input) => {
      expect(() => parsePageRange(input)).toThrow(PageRangeError);
    });

    it("rejects selections larger than the expansion guard", () => {
      expect(() => parsePageRange(`1-${PAGE_RANGE_MAX_PAGES + 1}`)).toThrow(
        PageRangeError,
      );
      expect(parsePageRange(`1-${PAGE_RANGE_MAX_PAGES}`)).toHaveLength(
        PAGE_RANGE_MAX_PAGES,
      );
    });
  });

  describe("selectPages", () => {
    it("splits requested pages into selected and out-of-range", () => {
      expect(selectPages([1, 3, 7, 9], 5)).toEqual({
        selected: [1, 3],
        outOfRange: [7, 9],
      });
    });

    it("returns everything selected when all pages exist", () => {
      expect(selectPages([1, 2], 2)).toEqual({ selected: [1, 2], outOfRange: [] });
    });

    it("returns nothing selected when the document is smaller than all requests", () => {
      expect(selectPages([4, 5], 3)).toEqual({ selected: [], outOfRange: [4, 5] });
    });
  });
});
