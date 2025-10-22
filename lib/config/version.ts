/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APPLICATION VERSION CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file controls the version number displayed throughout the entire app.
 * Update this file every time you make changes and want to release a new version.
 *
 * CURRENT VERSION: v1.0.0-beta
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SEMANTIC VERSIONING FORMAT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Format: v[MAJOR].[MINOR].[PATCH]-[PRERELEASE]
 * Example: v1.2.3-beta
 *
 * MAJOR: Breaking changes, major overhauls (stay at 1 during beta)
 * MINOR: New features, new integrations, significant improvements
 * PATCH: Bug fixes, small improvements, security patches
 * PRERELEASE: 'beta', 'rc.1', or '' (empty for stable)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BETA VERSION STRATEGY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * During beta phase:
 * - Keep MAJOR at 1 (you're building toward v1.0.0 stable)
 * - Keep preRelease as 'beta'
 * - Increment MINOR for new features: 1.0.0-beta → 1.1.0-beta → 1.2.0-beta
 * - Increment PATCH for bug fixes: 1.2.0-beta → 1.2.1-beta → 1.2.2-beta
 *
 * Example progression during beta:
 *   v1.0.0-beta  → Initial beta release
 *   v1.0.1-beta  → Bug fixes
 *   v1.1.0-beta  → Added new integration
 *   v1.1.1-beta  → Bug fixes
 *   v1.2.0-beta  → Major new feature
 *   v1.0.0       → Public launch (remove -beta)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHEN TO INCREMENT WHAT (QUICK REFERENCE)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SCENARIO 1: Fixed a bug
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Before: major: 1, minor: 0, patch: 0, preRelease: 'beta'               │
 * │ Change: Increment PATCH                                                 │
 * │ After:  major: 1, minor: 0, patch: 1, preRelease: 'beta'               │
 * │ Result: v1.0.0-beta → v1.0.1-beta                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * SCENARIO 2: Added new feature or integration
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Before: major: 1, minor: 0, patch: 1, preRelease: 'beta'               │
 * │ Change: Increment MINOR, reset PATCH to 0                              │
 * │ After:  major: 1, minor: 1, patch: 0, preRelease: 'beta'               │
 * │ Result: v1.0.1-beta → v1.1.0-beta                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * SCENARIO 3: Multiple bug fixes after new feature
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Before: major: 1, minor: 1, patch: 0, preRelease: 'beta'               │
 * │ Change: Increment PATCH                                                 │
 * │ After:  major: 1, minor: 1, patch: 1, preRelease: 'beta'               │
 * │ Result: v1.1.0-beta → v1.1.1-beta                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * SCENARIO 4: Ready to launch publicly (exit beta)
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Before: major: 1, minor: 5, patch: 3, preRelease: 'beta'               │
 * │ Change: Set preRelease to '' (empty string)                             │
 * │ After:  major: 1, minor: 5, patch: 3, preRelease: ''                   │
 * │ Result: v1.5.3-beta → v1.5.3 (stable release)                           │
 * │                                                                          │
 * │ OR if you want a clean v1.0.0 launch:                                   │
 * │ After:  major: 1, minor: 0, patch: 0, preRelease: ''                   │
 * │ Result: v1.5.3-beta → v1.0.0 (clean stable release)                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * SCENARIO 5: Major breaking change after stable (future)
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Before: major: 1, minor: 8, patch: 2, preRelease: ''                   │
 * │ Change: Increment MAJOR, reset MINOR and PATCH to 0                    │
 * │ After:  major: 2, minor: 0, patch: 0, preRelease: ''                   │
 * │ Result: v1.8.2 → v2.0.0                                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UPDATE CHECKLIST (Do these every time you change version)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Update major/minor/patch below based on what changed
 * 2. Update releaseDate to TODAY'S DATE (format: 'YYYY-MM-DD')
 * 3. Update package.json version to match (without -beta suffix)
 * 4. Update /learning/logs/CHANGELOG.md with what changed
 * 5. Commit: git commit -m "chore: bump version to vX.Y.Z-beta"
 * 6. Deploy to development and test
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const APP_VERSION = {
  // ↓ UPDATE THESE VALUES ↓
  major: 1,              // During beta: Keep at 1. After launch: Increment for breaking changes
  minor: 0,              // Increment for new features/integrations
  patch: 0,              // Increment for bug fixes
  preRelease: 'beta',    // 'beta' during beta, '' (empty) for stable launch

  // ↓ DO NOT MODIFY THESE (auto-generated) ↓
  get full() {
    return `v${this.major}.${this.minor}.${this.patch}${this.preRelease ? `-${this.preRelease}` : ''}`
  },
  get short() {
    return `v${this.major}.${this.minor}.${this.patch}`
  },

  // ↓ UPDATE THESE VALUES ↓
  releaseDate: '2025-10-21',  // Format: YYYY-MM-DD (TODAY'S DATE)
  codename: 'Lightning'       // Optional: Update for major releases
}

// ↓ DO NOT MODIFY THESE (used throughout the app) ↓
export const getVersion = () => APP_VERSION.full
export const getShortVersion = () => APP_VERSION.short