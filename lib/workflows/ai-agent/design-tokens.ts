/**
 * Design Tokens - Single Source of Truth
 * AI Agent Flow Builder - Spacing, Layout, Typography
 */

export const DESIGN_TOKENS = {
  // Panel Widths
  AGENT_PANEL_WIDTH: 420, // px ± 4
  INSPECTOR_PANEL_WIDTH: 380, // px ± 4

  // Canvas
  CANVAS_DOT_GRID: 8, // px
  CANVAS_FIT_PADDING: 64, // px
  CANVAS_DEFAULT_ZOOM: 0.85,

  // Node Spacing
  NODE_GAP_X: 160, // px ± 12
  NODE_GAP_Y: 96, // px ± 12
  NODE_WIDTH: 450, // Standard node width

  // Typography Scale (px)
  FONT_SIZE_XS: 11,
  FONT_SIZE_SM: 12.5,
  FONT_SIZE_BASE: 14,
  FONT_SIZE_LG: 16,

  // Edge Styling
  EDGE_STROKE_WIDTH: 1.5, // px
  EDGE_COLOR: '#9ca3af', // neutral gray
  EDGE_COLOR_ACTIVE: '#3b82f6', // blue for active

  // Node States
  SKELETON_OPACITY: 0.65,
  SKELETON_GRAYSCALE: 1,
  ACTIVE_HALO_COLOR: '#3b82f680', // soft blue with alpha
  ACTIVE_HALO_BLUR: 12, // px

  // Animations
  SHIMMER_DURATION: 2000, // ms
  SHIMMER_OPACITY: 0.35,
  BUILD_STAGGER_DELAY: 120, // ms between nodes
  CAMERA_PAN_DURATION: 550, // ms
  CAMERA_EASING: 'cubic-bezier(0.22, 1, 0.36, 1)',
  SAVE_DEBOUNCE: 600, // ms

  // Status Timing
  THINKING_MIN_DURATION: 300, // ms - minimum "thinking" feedback
  LATENCY_THRESHOLD_FAST: 500, // ms - skip intermediate chips
  LATENCY_THRESHOLD_SLOW: 3000, // ms - show all steps

  // Badge
  BADGE_FADE_OUT_DELAY: 2000, // ms after "ready"

  // Branch Layout
  BRANCH_LANE_OFFSET: 200, // px - vertical offset between parallel branches

  // Z-Index Layers
  Z_INDEX_CANVAS: 0,
  Z_INDEX_NODES: 10,
  Z_INDEX_EDGES: 5,
  Z_INDEX_BADGE: 100,
  Z_INDEX_DRAWER: 200,
  Z_INDEX_MODAL: 300,
} as const

export const ANIMATION_TIMING = {
  fast: 200,
  normal: 300,
  slow: 500,
  cameraPan: DESIGN_TOKENS.CAMERA_PAN_DURATION,
} as const

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
} as const

export const COLORS = {
  skeleton: {
    bg: '#f3f4f6',
    border: '#e5e7eb',
  },
  active: {
    halo: DESIGN_TOKENS.ACTIVE_HALO_COLOR,
    border: '#3b82f6',
  },
  success: {
    bg: '#dcfce7',
    border: '#22c55e',
    text: '#166534',
  },
  error: {
    bg: '#fee2e2',
    border: '#ef4444',
    text: '#991b1b',
  },
  running: {
    ring: '#60a5fa',
  },
} as const

export const TYPOGRAPHY = {
  xs: {
    fontSize: `${DESIGN_TOKENS.FONT_SIZE_XS}px`,
    lineHeight: '16px',
  },
  sm: {
    fontSize: `${DESIGN_TOKENS.FONT_SIZE_SM}px`,
    lineHeight: '18px',
  },
  base: {
    fontSize: `${DESIGN_TOKENS.FONT_SIZE_BASE}px`,
    lineHeight: '20px',
  },
  lg: {
    fontSize: `${DESIGN_TOKENS.FONT_SIZE_LG}px`,
    lineHeight: '24px',
  },
} as const

// Validation helpers
export function validatePanelWidth(width: number, target: 'agent' | 'inspector'): boolean {
  const targetWidth = target === 'agent'
    ? DESIGN_TOKENS.AGENT_PANEL_WIDTH
    : DESIGN_TOKENS.INSPECTOR_PANEL_WIDTH
  return Math.abs(width - targetWidth) <= 4
}

export function validateNodeGap(gap: number, axis: 'x' | 'y'): boolean {
  const targetGap = axis === 'x' ? DESIGN_TOKENS.NODE_GAP_X : DESIGN_TOKENS.NODE_GAP_Y
  return Math.abs(gap - targetGap) <= 12
}
