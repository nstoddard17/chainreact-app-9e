# Quick Version Update Reference

Fast reference for updating the application version.

## Current Version

**File**: `/lib/config/version.ts`

**Current**: v0.9.2-beta (Released: 2025-01-14)

---

## Quick Update Steps

### 1. Edit Version File

Open `/lib/config/version.ts` and update:

```typescript
export const APP_VERSION = {
  major: 0,              // ← Change this for major releases
  minor: 9,              // ← Change this for new features
  patch: 2,              // ← Change this for bug fixes
  preRelease: 'beta',    // ← Remove for stable release
  // ...
  releaseDate: '2025-01-14',  // ← Update to today's date
  codename: 'Lightning'        // ← Update for major/minor releases
}
```

### 2. Update package.json

Open `/package.json` and update version (no prerelease suffix):

```json
{
  "version": "0.9.2",  // ← Keep in sync with version.ts
}
```

### 3. Document Changes

Add entry to `/learning/logs/CHANGELOG.md`:

```markdown
## [0.9.3-beta] - 2025-10-21

### Fixed
- Description of what was fixed

### Added
- Description of what was added

### Changed
- Description of what was changed
```

### 4. Test & Deploy

```bash
# Test build
npm run build

# Commit
git add lib/config/version.ts package.json learning/logs/CHANGELOG.md
git commit -m "chore: bump version to v0.9.3-beta"

# Push to development
git push origin development

# After testing, merge to main
git checkout main
git merge development
git push origin main
```

---

## Version Increment Decision Tree

```
┌─────────────────────────────────────┐
│  What changed?                      │
└─────────────────────────────────────┘
           │
           ├─ Bug fix, small improvement
           │  → Increment PATCH (0.9.2 → 0.9.3)
           │
           ├─ New feature, new integration
           │  → Increment MINOR, reset PATCH (0.9.3 → 0.10.0)
           │
           ├─ Breaking change, major overhaul
           │  → Increment MAJOR, reset MINOR & PATCH (0.10.0 → 1.0.0)
           │
           └─ Ready for stable release
              → Remove preRelease (0.10.0-beta → 1.0.0)
```

---

## Common Version Updates

### Bug Fix (Patch)
```typescript
// Before: v0.9.2-beta
major: 0,
minor: 9,
patch: 3,  // ← Increment
preRelease: 'beta',
releaseDate: '2025-10-21',  // ← Update
// After: v0.9.3-beta
```

### New Feature (Minor)
```typescript
// Before: v0.9.3-beta
major: 0,
minor: 10,  // ← Increment
patch: 0,   // ← Reset
preRelease: 'beta',
releaseDate: '2025-10-21',  // ← Update
// After: v0.10.0-beta
```

### Stable Release (Remove Beta)
```typescript
// Before: v0.10.5-beta
major: 1,   // ← Increment
minor: 0,   // ← Reset
patch: 0,   // ← Reset
preRelease: '',  // ← Remove
releaseDate: '2025-11-01',  // ← Update
codename: 'Thunder',  // ← Update
// After: v1.0.0
```

### Hotfix After Stable
```typescript
// Before: v1.0.0
major: 1,
minor: 0,
patch: 1,  // ← Increment
preRelease: '',  // ← Keep empty
releaseDate: '2025-11-02',  // ← Update
// After: v1.0.1
```

---

## Version Format Examples

```
v0.9.2-beta     → Beta version (current)
v0.9.3-beta     → Bug fix in beta
v0.10.0-beta    → New feature in beta
v1.0.0-rc.1     → Release candidate 1
v1.0.0          → First stable release
v1.0.1          → Hotfix
v1.1.0          → New feature (stable)
v2.0.0          → Major version (breaking changes)
```

---

## Where Version Is Displayed

- **Footer**: All authenticated pages (via `NewFooter` and `Footer` components)
- **Automatically pulls from**: `/lib/config/version.ts` via `getVersion()`

---

## Complete File Reference

### `/lib/config/version.ts`
```typescript
export const APP_VERSION = {
  major: 0,
  minor: 9,
  patch: 2,
  preRelease: 'beta',
  get full() {
    return `v${this.major}.${this.minor}.${this.patch}${this.preRelease ? `-${this.preRelease}` : ''}`
  },
  get short() {
    return `v${this.major}.${this.minor}.${this.patch}`
  },
  releaseDate: '2025-01-14',
  codename: 'Lightning'
}

export const getVersion = () => APP_VERSION.full
export const getShortVersion = () => APP_VERSION.short
```

---

## One-Command Version Check

```bash
# View current version
grep -A 8 "APP_VERSION = {" lib/config/version.ts
```

**Output**:
```
export const APP_VERSION = {
  major: 0,
  minor: 9,
  patch: 2,
  preRelease: 'beta',
  get full() {
    return `v${this.major}.${this.minor}.${this.patch}${this.preRelease ? `-${this.preRelease}` : ''}`
  },
```

---

## Git Tag (Optional)

```bash
# Create version tag
git tag -a v0.9.3-beta -m "Release v0.9.3-beta: Bug fixes"

# Push tag
git push origin v0.9.3-beta

# List all version tags
git tag -l "v*"
```

---

## Full Documentation

For complete details, see: `/learning/docs/version-management-guide.md`

**Last Updated**: 2025-10-21
