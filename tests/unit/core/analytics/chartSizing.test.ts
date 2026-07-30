import {
  ANALYTICS_BAR_ROW_MIN_HEIGHT,
  ANALYTICS_CHART_COMPACT_WIDTH,
  ANALYTICS_DONUT_MIN_SIDE_DIAMETER,
  ANALYTICS_HEATMAP_CELL_GAP,
  ANALYTICS_HEATMAP_MAX_CELL_PX,
  barChartMetrics,
  donutCenterTypography,
  donutLayout,
  donutRadii,
  heatmapCellSize,
  heatmapExtent,
  innerPlot,
  isCompactChartWidth,
  isDrawableChartSize,
  isShortChartHeight,
  lineChartLabelStep,
  lineChartMargins,
  lineChartTickCount,
  sparklineInset,
} from "@/core/analytics/chartSizing";

/**
 * Responsive chart geometry (ANALYTICS-RESPONSIVE-CHART-SURFACES-1).
 *
 * The arithmetic every Analytics chart now derives its pixels from. These tests
 * assert the PROPERTIES that make a chart fit — the inner plot stays inside the
 * box, a heatmap cell stays square, a donut ring stays inside its circle — not
 * the particular constants, which are presentation choices.
 */

describe("thresholds", () => {
  it("classifies compact width and short height", () => {
    expect(isCompactChartWidth(ANALYTICS_CHART_COMPACT_WIDTH - 1)).toBe(true);
    expect(isCompactChartWidth(ANALYTICS_CHART_COMPACT_WIDTH)).toBe(false);
    expect(isShortChartHeight(100)).toBe(true);
    expect(isShortChartHeight(320)).toBe(false);
  });

  it("refuses to call a degenerate box drawable", () => {
    expect(isDrawableChartSize({ width: 600, height: 180 })).toBe(true);
    expect(isDrawableChartSize({ width: 10, height: 180 })).toBe(false);
    expect(isDrawableChartSize({ width: 600, height: 4 })).toBe(false);
    expect(isDrawableChartSize({ width: Number.NaN, height: 180 })).toBe(false);
  });
});

describe("line plot margins", () => {
  // The whole reason the old chart clipped: reserved bands that did not add up
  // to the box it was actually painted into.
  it.each([
    [1370, 117],
    [660, 117],
    [320, 96],
    [270, 117],
    [660, 321],
  ])("leave a positive inner plot inside a %ix%i body", (width, height) => {
    const margins = lineChartMargins(width, height);
    const inner = innerPlot({ width, height }, margins);
    expect(inner.width).toBeGreaterThan(0);
    expect(inner.height).toBeGreaterThan(0);
    expect(margins.left + inner.width + margins.right).toBe(width);
    expect(margins.top + inner.height + margins.bottom).toBe(height);
  });

  it("never returns a negative inner plot for an impossible box", () => {
    const size = { width: 20, height: 10 };
    const inner = innerPlot(size, lineChartMargins(size.width, size.height));
    expect(inner.width).toBe(0);
    expect(inner.height).toBe(0);
  });

  it("tightens the left axis band when compact", () => {
    expect(lineChartMargins(280, 200).left).toBeLessThan(lineChartMargins(700, 200).left);
    expect(lineChartMargins(700, 96).bottom).toBeLessThan(lineChartMargins(700, 320).bottom);
  });
});

describe("axis density", () => {
  it("reduces tick bands as the body gets shorter", () => {
    expect(lineChartTickCount(320)).toBe(4);
    expect(lineChartTickCount(120)).toBe(3);
    expect(lineChartTickCount(80)).toBe(2);
  });

  it("thins category labels on a narrow plot and densifies on a wide one", () => {
    const narrow = lineChartLabelStep(30, 240);
    const wide = lineChartLabelStep(30, 1300);
    expect(narrow).toBeGreaterThan(wide);
    expect(wide).toBeGreaterThanOrEqual(1);
    expect(lineChartLabelStep(1, 240)).toBe(1);
  });
});

describe("sparkline inset", () => {
  it("always leaves room for the end dot", () => {
    for (const height of [24, 42, 90]) {
      const inset = sparklineInset(height);
      expect(inset.side).toBeGreaterThanOrEqual(2.5);
      expect(inset.vertical * 2).toBeLessThan(height);
    }
  });
});

describe("heatmap cell size", () => {
  const grid = { columnCount: 16, rowCount: 7 };

  it("grows with the container and shrinks with it", () => {
    const small = heatmapCellSize({ availableWidth: 300, availableHeight: 100, ...grid });
    const large = heatmapCellSize({ availableWidth: 660, availableHeight: 280, ...grid });
    expect(large).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(0);
  });

  it("keeps the whole matrix inside both axes", () => {
    for (const [w, h] of [
      [300, 100],
      [660, 280],
      [1370, 117],
      [270, 117],
    ] as const) {
      const cell = heatmapCellSize({ availableWidth: w, availableHeight: h, ...grid });
      expect(heatmapExtent(grid.columnCount, cell)).toBeLessThanOrEqual(w);
      expect(heatmapExtent(grid.rowCount, cell)).toBeLessThanOrEqual(h);
    }
  });

  it("is bounded above, but well above the old fixed 14px cell", () => {
    const huge = heatmapCellSize({ availableWidth: 4000, availableHeight: 4000, ...grid });
    expect(huge).toBe(ANALYTICS_HEATMAP_MAX_CELL_PX);
    expect(huge).toBeGreaterThan(14);
  });

  it("returns zero rather than a nonsense cell for an unusable box", () => {
    expect(heatmapCellSize({ availableWidth: 20, availableHeight: 20, ...grid })).toBe(0);
    expect(heatmapCellSize({ availableWidth: 400, availableHeight: 200, columnCount: 0, rowCount: 7 })).toBe(0);
    expect(
      heatmapCellSize({ availableWidth: Number.NaN, availableHeight: 200, ...grid }),
    ).toBe(0);
  });

  it("counts gaps between cells, not after them", () => {
    expect(heatmapExtent(4, 10, ANALYTICS_HEATMAP_CELL_GAP)).toBe(
      4 * 10 + 3 * ANALYTICS_HEATMAP_CELL_GAP,
    );
    expect(heatmapExtent(1, 10)).toBe(10);
    expect(heatmapExtent(0, 10)).toBe(0);
  });
});

describe("donut geometry", () => {
  it("keeps the painted ring inside the box", () => {
    for (const diameter of [64, 117, 190, 300]) {
      const { outerRadius, strokeWidth } = donutRadii({ width: diameter, height: diameter });
      // The stroke straddles the radius; its outer edge must not reach the edge.
      expect(outerRadius + strokeWidth / 2).toBeLessThan(diameter / 2);
      expect(outerRadius).toBeGreaterThan(0);
    }
  });

  it("stays circular by taking the inscribed square of a rectangle", () => {
    expect(donutRadii({ width: 400, height: 120 }).diameter).toBe(120);
    expect(donutRadii({ width: 90, height: 300 }).diameter).toBe(90);
  });

  it("scales the ring thickness with the diameter", () => {
    expect(donutRadii({ width: 300, height: 300 }).strokeWidth).toBeGreaterThan(
      donutRadii({ width: 100, height: 100 }).strokeWidth,
    );
  });

  it("puts the legend beside the ring only when both fit", () => {
    const wide = donutLayout({ width: 660, height: 190, sliceCount: 2 });
    expect(wide.orientation).toBe("side");
    expect(wide.diameter).toBeGreaterThanOrEqual(ANALYTICS_DONUT_MIN_SIDE_DIAMETER);

    const narrow = donutLayout({ width: 210, height: 190, sliceCount: 2 });
    expect(narrow.orientation).toBe("stacked");
    expect(narrow.diameter).toBeGreaterThan(0);
  });

  it("keeps donut plus legend inside the body in both orientations", () => {
    const side = donutLayout({ width: 660, height: 190, sliceCount: 2 });
    expect(side.diameter + side.legendWidthPx).toBeLessThanOrEqual(660);
    expect(side.diameter).toBeLessThanOrEqual(190);

    const stacked = donutLayout({ width: 210, height: 190, sliceCount: 2 });
    expect(stacked.diameter + stacked.legendHeightPx).toBeLessThanOrEqual(190);
    expect(stacked.diameter).toBeLessThanOrEqual(210);
  });

  it("grows the ring when the widget gets bigger", () => {
    const oneByOne = donutLayout({ width: 270, height: 117, sliceCount: 2 });
    const twoByTwo = donutLayout({ width: 660, height: 321, sliceCount: 2 });
    expect(twoByTwo.diameter).toBeGreaterThan(oneByOne.diameter);
  });

  it("shrinks the centre readout so it cannot spill past the inner radius", () => {
    const small = donutCenterTypography(20, 3);
    const large = donutCenterTypography(90, 3);
    expect(large.valueFontSize).toBeGreaterThan(small.valueFontSize);
    for (const [innerRadius, length] of [
      [20, 3],
      [40, 4],
      [90, 6],
    ] as const) {
      const type = donutCenterTypography(innerRadius, length);
      // Rough advance width of the string must stay inside the inner square.
      expect(type.valueFontSize * 0.62 * length).toBeLessThanOrEqual(innerRadius * 1.45);
    }
  });

  it("drops the sublabel only when the ring is too small to hold it", () => {
    expect(donutCenterTypography(90, 3).showLabel).toBe(true);
    expect(donutCenterTypography(14, 3).showLabel).toBe(false);
  });
});

describe("bar rows", () => {
  it("fills a tall body with generous rows and a short one with tight rows", () => {
    const tall = barChartMetrics({ width: 660, height: 300, rowCount: 6 });
    const short = barChartMetrics({ width: 660, height: 110, rowCount: 6 });
    expect(tall.rowHeight).toBeGreaterThan(short.rowHeight);
    expect(short.rowHeight).toBeGreaterThanOrEqual(ANALYTICS_BAR_ROW_MIN_HEIGHT);
  });

  it("never lays out rows taller than the body it was given", () => {
    for (const [width, height, rowCount] of [
      [660, 300, 6],
      [660, 110, 6],
      [270, 117, 6],
      [1370, 117, 6],
    ] as const) {
      const m = barChartMetrics({ width, height, rowCount });
      const used = m.visibleRows * m.rowHeight + (m.visibleRows - 1) * m.rowGap;
      expect(used).toBeLessThanOrEqual(height);
    }
  });

  it("reduces the row COUNT only when the readable floor cannot be met", () => {
    // 130px still fits six rows at the floor, so nothing is dropped.
    const fits = barChartMetrics({ width: 660, height: 130, rowCount: 6 });
    expect(fits.visibleRows).toBe(6);
    expect(fits.hiddenRows).toBe(0);
    expect(fits.rowHeight).toBeGreaterThanOrEqual(ANALYTICS_BAR_ROW_MIN_HEIGHT);

    // 60px cannot, so rows are dropped — and counted, so the chart can say so
    // rather than silently hiding records or slicing the last row in half.
    const cramped = barChartMetrics({ width: 660, height: 60, rowCount: 6 });
    expect(cramped.visibleRows).toBeLessThan(6);
    expect(cramped.visibleRows).toBeGreaterThan(0);
    expect(cramped.visibleRows + cramped.hiddenRows).toBe(6);
    expect(cramped.rowHeight).toBeGreaterThanOrEqual(ANALYTICS_BAR_ROW_MIN_HEIGHT);
  });

  it("never shows fewer rows in a taller body", () => {
    let previous = 0;
    for (const height of [50, 70, 90, 110, 130, 200, 300]) {
      const rows = barChartMetrics({ width: 660, height, rowCount: 6 }).visibleRows;
      expect(rows).toBeGreaterThanOrEqual(previous);
      previous = rows;
    }
    expect(previous).toBe(6);
  });

  it("bounds the label column instead of letting a long name take the bar's room", () => {
    const wide = barChartMetrics({ width: 1370, height: 200, rowCount: 6 });
    const narrow = barChartMetrics({ width: 270, height: 200, rowCount: 6 });
    expect(wide.labelMaxPx).toBeGreaterThan(narrow.labelMaxPx);
    expect(wide.labelMaxPx).toBeLessThan(1370 / 2);
    expect(narrow.labelMaxPx).toBeLessThan(270);
  });

  it("handles an empty row set", () => {
    const m = barChartMetrics({ width: 660, height: 200, rowCount: 0 });
    expect(m.visibleRows).toBe(0);
    expect(m.hiddenRows).toBe(0);
  });
});
