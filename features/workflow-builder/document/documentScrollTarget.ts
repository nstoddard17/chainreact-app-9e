/**
 * Document Builder — where to scroll so a sentence is actually READABLE
 * (DOC-REACT-AGENT-2).
 *
 * The Document's scroll container also hosts the sticky bottom React Agent dock.
 * A plain `scrollIntoView({ block: "center" })` centres a step in the container
 * — which, with the agent workspace expanded, lands it squarely UNDER the dock.
 * Measured in Chromium on a 12-step workflow with an expanded workspace, the
 * referenced sentence was fully covered at 1440 / 1024 / 820px (49 / 53 / 55px
 * of a 46px sentence hidden behind a 464 / 418 / 390px dock).
 *
 * This pure helper centres the target inside the region ABOVE whatever is
 * occluding the bottom, so every navigation path (agent references, Guided
 * Stops, the Whole Workflow map) reveals a sentence the user can read and click.
 * With `bottomInset = 0` it behaves like the old centring.
 */
export interface ScrollTargetInput {
  /** Scrollable height of the container (`clientHeight`). */
  readonly containerHeight: number;
  /** Current scroll offset of the container (`scrollTop`). */
  readonly containerScrollTop: number;
  /** Target's top, in viewport coords (`getBoundingClientRect().top`). */
  readonly targetTop: number;
  /** Container's top, in viewport coords (`getBoundingClientRect().top`). */
  readonly containerTop: number;
  /** Target's rendered height. */
  readonly targetHeight: number;
  /** Height occluded at the BOTTOM of the container (the sticky agent dock). */
  readonly bottomInset: number;
  /** Total scrollable content height (`scrollHeight`), to clamp the result. */
  readonly scrollHeight: number;
}

/** Minimum breathing room above a revealed sentence. */
export const SCROLL_TOP_MARGIN = 16;

/**
 * The `scrollTop` that puts `target` in the middle of the UNOCCLUDED region.
 * Total and clamped: never negative, never past the end of the content, and it
 * degrades to "as high as possible" when the target is taller than the space.
 */
export function computeScrollTarget(input: ScrollTargetInput): number {
  const {
    containerHeight,
    containerScrollTop,
    targetTop,
    containerTop,
    targetHeight,
    bottomInset,
    scrollHeight,
  } = input;

  // Where the target sits in the container's CONTENT coordinate space.
  const targetContentTop = targetTop - containerTop + containerScrollTop;
  // The band the user can actually see, once the dock is taken off the bottom.
  const usableHeight = Math.max(0, containerHeight - Math.max(0, bottomInset));
  // Centre within that band, but never crowd the top edge.
  const lead = Math.max(SCROLL_TOP_MARGIN, (usableHeight - targetHeight) / 2);

  const desired = targetContentTop - lead;
  const maxScroll = Math.max(0, scrollHeight - containerHeight);
  return Math.min(Math.max(0, desired), maxScroll);
}

/**
 * Measure the bottom occlusion of a Document scroll container: the sticky agent
 * dock when it is present. Returns 0 when nothing is docked (e.g. the agent
 * surface is not rendered), which restores plain centring.
 */
export function measureBottomInset(container: HTMLElement): number {
  const dock = container.querySelector('[data-testid="document-agent-workspace"]');
  if (!dock) return 0;
  const height = dock.getBoundingClientRect().height;
  if (!Number.isFinite(height) || height <= 0) return 0;
  // The dock is `sticky bottom-3`; add that offset so the sentence clears it.
  return height + 12;
}
