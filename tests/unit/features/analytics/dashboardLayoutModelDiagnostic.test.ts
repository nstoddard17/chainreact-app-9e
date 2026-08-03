/** @jest-environment node */
/**
 * ANALYTICS-EDIT-MODE-LAYOUT-AUDIT-1 — diagnostic evidence, not a feature test.
 *
 * These tests exist to PROVE the audit's structural findings against the code
 * and data that actually ship, rather than asserting them in prose:
 *
 *   1. The rendered grid is pure CSS sparse row auto-flow, so mixed widget
 *      widths leave grid cells permanently empty — the shipped default board
 *      at the 3-column breakpoint, and any mixed-width board at 4 columns.
 *      (Simulated with the auto-placement algorithm from CSS Grid Layout §8.5,
 *      driven by the SHIPPED size→span map and the SHIPPED default widgets.)
 *   2. Those empty cells are not drop destinations: the drag session builds one
 *      slot per widget card, so a pointer inside a hole hit-tests to `null`,
 *      which the session reads as "keep the current destination".
 *   3. The ordered-array model cannot even REPRESENT a chosen gap: every layout
 *      it can produce is a permutation of the same widget set, and sparse flow
 *      always fills from the cursor — so no drag handler, threshold or
 *      heuristic can add the missing expressive power.
 *
 * See docs/slices/phase-5/analytics/analytics-edit-mode-layout-audit.md.
 */

import {
  computeDragPreview,
  hitTestSlot,
  type DragSlot,
} from "@/features/analytics/dashboardHelpers";
import { ANALYTICS_SIZE_FOOTPRINT } from "@/contracts/analytics";
import { DEFAULT_OVERVIEW_WIDGETS } from "@/contracts/analyticsDefaults";
import type { AnalyticsWidget, AnalyticsWidgetSize } from "@/contracts/analytics";

// ── The shipped size → footprint map, read from the shipped Tailwind classes ──

function spanOf(size: AnalyticsWidgetSize): { w: number; h: number } {
  // Read from the shipped footprint map. Until S4 these values lived in
  // Tailwind span classes on the card; the numbers are unchanged, and this
  // diagnostic still describes the OLD auto-flow model it was written to expose.
  return ANALYTICS_SIZE_FOOTPRINT[size];
}

// ── CSS Grid auto-placement, sparse `grid-auto-flow: row` (spec §8.5) ────────
//
// The grid in AnalyticsDashboard.tsx sets NO grid-column-start / grid-row-start
// on any card and does NOT use `dense`, so every card is auto-placed. The
// defining property of sparse packing is that the placement cursor never moves
// backwards — which is exactly why a hole, once created, is never filled.

interface Placed {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Flowed {
  readonly placed: readonly Placed[];
  readonly occupied: ReadonlySet<string>;
  readonly rows: number;
}

function autoFlow(items: readonly { w: number; h: number }[], columns: number): Flowed {
  const occupied = new Set<string>();
  const placed: Placed[] = [];
  const free = (x: number, y: number, w: number, h: number) => {
    for (let dy = 0; dy < h; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) {
        if (occupied.has(`${x + dx},${y + dy}`)) return false;
      }
    }
    return true;
  };

  let cursorRow = 0;
  let cursorCol = 0;
  for (const item of items) {
    // SIMPLIFICATION: a real browser does NOT clamp an over-wide span — §8.5
    // step 1 grows the IMPLICIT grid to fit it, which is its own responsive
    // defect (a `w` 4-wide widget on the 1- and 2-column breakpoints). No board
    // asserted below reaches that case, so clamping keeps this simulator
    // faithful for everything it is used to prove.
    const w = Math.min(item.w, columns);
    let row = cursorRow;
    let col = cursorCol;
    // Scan FORWARD only. That is the whole point of sparse packing.
    for (;;) {
      if (col + w > columns) {
        row += 1;
        col = 0;
        continue;
      }
      if (free(col, row, w, item.h)) break;
      col += 1;
    }
    for (let dy = 0; dy < item.h; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) occupied.add(`${col + dx},${row + dy}`);
    }
    placed.push({ x: col, y: row, w, h: item.h });
    cursorRow = row;
    cursorCol = col + w;
  }
  return {
    placed,
    occupied,
    rows: placed.reduce((m, p) => Math.max(m, p.y + p.h), 0),
  };
}

/** Empty cells inside the board's own bounds — i.e. holes the user can see. */
function holesIn(flowed: Flowed, columns: number): Placed[] {
  const holes: Placed[] = [];
  for (let y = 0; y < flowed.rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (!flowed.occupied.has(`${x},${y}`)) holes.push({ x, y, w: 1, h: 1 });
    }
  }
  return holes;
}

const CELL = 300;
const ROW = 190;

/** The drag session's slot capture: exactly one box per rendered widget card. */
function slotsFrom(placed: readonly Placed[]): DragSlot[] {
  return placed.map((p) => ({
    left: p.x * CELL,
    top: p.y * ROW,
    width: p.w * CELL,
    height: p.h * ROW,
  }));
}

const defaultBoard = () => DEFAULT_OVERVIEW_WIDGETS.map((w) => spanOf(w.size));

/**
 * The smallest board that reproduces the reported screenshot at the widest
 * (4-column) breakpoint: four 1×1s and one 2×1. Nothing exotic — it is what a
 * user gets by resizing one default stat tile.
 */
const MIXED_BOARD: AnalyticsWidgetSize[] = ["s", "s", "s", "m", "s"];
const mixedBoard = () => MIXED_BOARD.map(spanOf);

describe("finding 1 — sparse auto-flow leaves permanently empty cells", () => {
  it("the SHIPPED default board holes at the 3-column breakpoint", () => {
    const flowed = autoFlow(defaultBoard(), 3);
    const holes = holesIn(flowed, 3).map((h) => `${h.x},${h.y}`);
    // Recorded exactly so that a change to the default board fails loudly here
    // rather than silently invalidating the audit document — which is what
    // happened: ANALYTICS-DEFAULT-OVERVIEW-WELCOME-FIRST-1 moved the welcome
    // note to the front, so these are no longer the audit's original numbers
    // (`1,1 · 2,1 · 2,4…2,8`, measured against the note-last order). The FINDING
    // is unchanged and is what matters: sparse flow abandons cells it never
    // returns to, and a column-2 run of them is still the result.
    expect(holes).toEqual(["2,4", "2,5", "2,6", "2,7"]);
  });

  it("the default board no longer even packs cleanly at 4 columns", () => {
    // The audit recorded that the note-last default happened to pack 20
    // column-units into 5 exact rows, and called that luck rather than design —
    // it was why the defect stayed invisible on a fresh wide board. Leading with
    // a 2-wide welcome note spends that luck: the 3-wide `ov-overtime` no longer
    // fits beside the stat tiles, so even the widest fresh board has holes.
    //
    // Under the SHIPPING explicit renderer those cells are DELIBERATE empty
    // space that a user can drag into, which is the whole point of S3/S4. This
    // test is about the RETIRED sparse-flow model, where they were untargetable.
    const flowed = autoFlow(defaultBoard(), 4);
    expect(holesIn(flowed, 4).map((h) => `${h.x},${h.y}`)).toEqual(["2,1", "3,1", "2,5", "3,5"]);
  });

  it("one resize is enough to open an untargetable hole at 4 columns", () => {
    const flowed = autoFlow(mixedBoard(), 4);
    const holes = holesIn(flowed, 4).map((h) => `${h.x},${h.y}`);
    // Row 0 column 3 is visibly empty, and row 1 column 3 beside the moved tile.
    expect(holes).toEqual(["3,0", "3,1"]);
  });

  it("the top-left cell can never be left empty, under ANY ordering", () => {
    // Sparse flow always places the first item at the cursor's origin, so no
    // permutation of any board can express "start one cell in". This is the
    // clearest proof that hole POSITION is a consequence of width and order,
    // never something the user can choose.
    for (const order of permutations(mixedBoard())) {
      expect(autoFlow(order, 4).occupied.has("0,0")).toBe(true);
    }
  });
});

describe("finding 2 — a visibly empty cell is not a drop destination", () => {
  it.each([
    ["the default board at 3 columns", defaultBoard, 3],
    ["a mixed-size board at 4 columns", mixedBoard, 4],
  ])("hit-tests to null everywhere inside every hole: %s", (_name, board, columns) => {
    const flowed = autoFlow(board(), columns);
    const slots = slotsFrom(flowed.placed);
    const holes = holesIn(flowed, columns);
    expect(holes.length).toBeGreaterThan(0);
    for (const hole of holes) {
      // null is what `useWidgetDragSession` reads as "keep the current
      // destination" — so releasing over a visibly open cell drops the widget
      // wherever it last was, never into the cell the user aimed at.
      expect(hitTestSlot(slots, hole.x * CELL + CELL / 2, hole.y * ROW + ROW / 2)).toBeNull();
      // Corners too — this is not a rounding artefact at the centre.
      expect(hitTestSlot(slots, hole.x * CELL + 1, hole.y * ROW + 1)).toBeNull();
      expect(hitTestSlot(slots, (hole.x + 1) * CELL - 1, (hole.y + 1) * ROW - 1)).toBeNull();
    }
  });

  it("offers exactly one destination per widget, so destinations are identities, not places", () => {
    const flowed = autoFlow(mixedBoard(), 4);
    const slots = slotsFrom(flowed.placed);
    expect(slots).toHaveLength(MIXED_BOARD.length);

    const reachable = new Set<number>();
    let addressableCells = 0;
    for (let y = 0; y < flowed.rows; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const hit = hitTestSlot(slots, x * CELL + CELL / 2, y * ROW + ROW / 2);
        if (hit !== null) {
          reachable.add(hit);
          addressableCells += 1;
        }
      }
    }
    // Every destination the pointer can reach is an existing widget's own box.
    expect(reachable.size).toBe(slots.length);
    // …and the grid holds strictly more cells than the pointer can address.
    expect(addressableCells).toBeLessThan(flowed.rows * 4);
  });
});

describe("finding 3 — the ordered array cannot represent a chosen gap at all", () => {
  const board: AnalyticsWidget[] = ["a", "b", "c", "d"].map((id) => ({
    id,
    type: "stat",
    size: "s",
    title: id,
    config: { source: "any", metric: "runs" },
  }));

  it("every reachable preview is a permutation of the same widget set", () => {
    const ids = new Set(board.map((w) => w.id));
    for (const dragged of board) {
      for (let slot = 0; slot < board.length; slot += 1) {
        const preview = computeDragPreview(board, dragged.id, slot);
        expect(preview).not.toBeNull();
        expect(preview).toHaveLength(board.length);
        expect(new Set(preview!.map((w) => w.id))).toEqual(ids);
      }
    }
  });

  it("has no field in which 'leave this cell empty' could be stored", () => {
    // The only positional information a widget carries is its index in the
    // array plus its `size`. There is nowhere to record "there is a deliberate
    // hole before me", so no drag handler can preserve one.
    const widgetKeys = Object.keys(board[0]!).sort();
    expect(widgetKeys).toEqual(["config", "id", "size", "title", "type"]);
    expect(widgetKeys).not.toContain("x");
    expect(widgetKeys).not.toContain("y");
    expect(widgetKeys).not.toContain("layout");
  });

  it("an out-of-range destination is clamped into the array, never left as a free cell", () => {
    const preview = computeDragPreview(board, "a", 99);
    expect(preview!.map((w) => w.id)).toEqual(["b", "c", "d", "a"]);
  });
});

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const tail of permutations(rest)) out.push([items[i]!, ...tail]);
  }
  return out;
}
