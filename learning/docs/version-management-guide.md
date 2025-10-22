# Version Management Guide

Complete guide for managing application version numbers in ChainReact.

## Overview

ChainReact uses **Semantic Versioning (SemVer)** displayed in the footer of the application. The version is managed through a centralized configuration file that controls what users see across the entire app.

## Current Version System

**Location**: `/lib/config/version.ts`

**Current Version**: v0.9.2-beta (as of January 14, 2025)

**Display Locations**:
- Footer on all authenticated pages (via `NewFooter` component)
- Footer on some pages (via `Footer` component)

---

## Version Number Format

### Semantic Versioning (SemVer)

ChainReact follows the standard semantic versioning format:

```
v[MAJOR].[MINOR].[PATCH]-[PRERELEASE]

Example: v0.9.2-beta
         v1.0.0
         v1.2.3-rc.1
         v2.0.0
```

### Version Components

**MAJOR** (e.g., v**1**.0.0)
- Breaking changes
- Major feature overhauls
- API changes that aren't backwards-compatible
- Significant architectural changes

**MINOR** (e.g., v1.**2**.0)
- New features
- Non-breaking enhancements
- New integrations
- Significant improvements

**PATCH** (e.g., v1.2.**3**)
- Bug fixes
- Small improvements
- Security patches
- Performance optimizations
- Documentation updates

**PRERELEASE** (e.g., v1.0.0-**beta**)
- Development stage indicator
- Common values: `alpha`, `beta`, `rc` (release candidate), `dev`
- Removed for stable releases

### Version Examples

```
v0.9.2-beta     → Beta version, minor 9, patch 2
v1.0.0          → First stable release (no prerelease)
v1.1.0          → New features added
v1.1.1          → Bug fix
v1.2.0-rc.1     → Release candidate 1 for v1.2.0
v2.0.0          → Major version with breaking changes
```

---

## How to Update Version

### Step 1: Edit Version Configuration

**File**: `/lib/config/version.ts`

```typescript
export const APP_VERSION = {
  major: 0,        // ← Update this
  minor: 9,        // ← Update this
  patch: 2,        // ← Update this
  preRelease: 'beta',  // ← Update or remove this
  get full() {
    return `v${this.major}.${this.minor}.${this.patch}${this.preRelease ? `-${this.preRelease}` : ''}`
  },
  get short() {
    return `v${this.major}.${this.minor}.${this.patch}`
  },
  releaseDate: '2025-01-14',  // ← Update this
  codename: 'Lightning'        // ← Update this (optional)
}
```

### Step 2: Update Release Date

```typescript
releaseDate: '2025-10-21',  // Format: YYYY-MM-DD
```

### Step 3: Update Codename (Optional)

Codenames can be used for major/minor releases:

```typescript
codename: 'Lightning'  // v0.9.x
codename: 'Thunder'    // v1.0.0 (example)
codename: 'Storm'      // v1.1.0 (example)
```

### Step 4: Update package.json (Keep in Sync)

**File**: `/package.json`

```json
{
  "version": "0.9.2",  // ← Update to match (without prerelease suffix)
  ...
}
```

**Note**: package.json version should match the short version (no `-beta` suffix).

---

## Version Update Scenarios

### Scenario 1: Bug Fix (Patch Release)

**Before**: v0.9.2-beta
**After**: v0.9.3-beta

**Changes**:
```typescript
// lib/config/version.ts
export const APP_VERSION = {
  major: 0,
  minor: 9,
  patch: 3,      // ← Increment patch
  preRelease: 'beta',
  // ...
  releaseDate: '2025-10-21',  // ← Update date
}
```

**When to use**:
- Fixed integration bug
- Corrected UI issue
- Security patch
- Performance fix
- Small improvements

### Scenario 2: New Feature (Minor Release)

**Before**: v0.9.3-beta
**After**: v0.10.0-beta

**Changes**:
```typescript
export const APP_VERSION = {
  major: 0,
  minor: 10,     // ← Increment minor
  patch: 0,      // ← Reset patch to 0
  preRelease: 'beta',
  // ...
  releaseDate: '2025-10-21',
}
```

**When to use**:
- Added new integration
- New workflow feature
- Significant enhancement
- New major component

### Scenario 3: First Stable Release (Major Release)

**Before**: v0.10.5-beta
**After**: v1.0.0

**Changes**:
```typescript
export const APP_VERSION = {
  major: 1,      // ← Increment major
  minor: 0,      // ← Reset minor to 0
  patch: 0,      // ← Reset patch to 0
  preRelease: '', // ← Remove prerelease (or set to empty string)
  // ...
  releaseDate: '2025-11-01',
  codename: 'Thunder'  // ← New codename for v1.0
}
```

**When to use**:
- Launching to public (removing beta)
- Breaking changes
- Major architectural overhaul
- Complete redesign

### Scenario 4: Release Candidate

**Before**: v0.10.5-beta
**After**: v1.0.0-rc.1

**Changes**:
```typescript
export const APP_VERSION = {
  major: 1,
  minor: 0,
  patch: 0,
  preRelease: 'rc.1',  // ← Release candidate 1
  // ...
  releaseDate: '2025-10-28',
}
```

**When to use**:
- Testing before stable release
- Feature freeze for v1.0.0
- Final bug fixes before launch

**Subsequent release candidates**:
- rc.1 → rc.2 → rc.3 → stable (no prerelease)

### Scenario 5: Hotfix After Stable Release

**Before**: v1.0.0
**After**: v1.0.1

**Changes**:
```typescript
export const APP_VERSION = {
  major: 1,
  minor: 0,
  patch: 1,      // ← Increment patch
  preRelease: '', // ← No prerelease (still stable)
  // ...
  releaseDate: '2025-11-02',
}
```

**When to use**:
- Critical bug in production
- Security vulnerability fix
- Urgent patch needed

---

## Version Update Workflow

### Complete Version Update Process

```bash
# 1. Decide version increment (patch/minor/major)
# Based on changes since last release

# 2. Update version.ts
# Edit /lib/config/version.ts with new version

# 3. Update package.json
# Edit package.json "version" field

# 4. Update CHANGELOG.md
# Document changes in /learning/logs/CHANGELOG.md

# 5. Test locally
npm run build
npm run dev
# Verify version shows in footer

# 6. Commit changes
git add lib/config/version.ts package.json learning/logs/CHANGELOG.md
git commit -m "chore: bump version to v1.0.0"

# 7. Create git tag (optional but recommended)
git tag -a v1.0.0 -m "Release v1.0.0: First stable release"
git push origin v1.0.0

# 8. Deploy
# Follow standard deployment workflow
git push origin development  # Test on dev first
# Then merge to main for production
```

---

## Automation Ideas (Future Enhancement)

### Option 1: npm version Command

```bash
# Automatically bump version in package.json
npm version patch  # 0.9.2 → 0.9.3
npm version minor  # 0.9.3 → 0.10.0
npm version major  # 0.10.0 → 1.0.0

# Then sync to version.ts manually
```

### Option 2: Custom Script

Create `/scripts/bump-version.js`:

```javascript
#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

// Get version type from command line
const versionType = process.argv[2] // 'patch', 'minor', or 'major'

// Read current version
const versionPath = path.join(__dirname, '../lib/config/version.ts')
const content = fs.readFileSync(versionPath, 'utf8')

// Parse current version
const majorMatch = content.match(/major: (\d+)/)
const minorMatch = content.match(/minor: (\d+)/)
const patchMatch = content.match(/patch: (\d+)/)

let major = parseInt(majorMatch[1])
let minor = parseInt(minorMatch[1])
let patch = parseInt(patchMatch[1])

// Increment based on type
if (versionType === 'major') {
  major++
  minor = 0
  patch = 0
} else if (versionType === 'minor') {
  minor++
  patch = 0
} else if (versionType === 'patch') {
  patch++
}

// Update version.ts
const newContent = content
  .replace(/major: \d+/, `major: ${major}`)
  .replace(/minor: \d+/, `minor: ${minor}`)
  .replace(/patch: \d+/, `patch: ${patch}`)
  .replace(/releaseDate: '[^']*'/, `releaseDate: '${new Date().toISOString().split('T')[0]}'`)

fs.writeFileSync(versionPath, newContent)

console.log(`✅ Version bumped to v${major}.${minor}.${patch}`)
console.log(`📝 Don't forget to update package.json and CHANGELOG.md`)
```

**Usage**:
```bash
node scripts/bump-version.js patch
node scripts/bump-version.js minor
node scripts/bump-version.js major
```

### Option 3: GitHub Actions (Automated)

Create `.github/workflows/version-bump.yml`:

```yaml
name: Version Bump

on:
  workflow_dispatch:
    inputs:
      version-type:
        description: 'Version bump type'
        required: true
        type: choice
        options:
          - patch
          - minor
          - major

jobs:
  bump-version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Bump version
        run: node scripts/bump-version.js ${{ inputs.version-type }}

      - name: Create PR
        uses: peter-evans/create-pull-request@v5
        with:
          commit-message: "chore: bump version to ${{ steps.version.outputs.new-version }}"
          title: "Version bump: ${{ steps.version.outputs.new-version }}"
          branch: version-bump-${{ github.run_number }}
```

---

## Version Display

### Current Implementation

**Footer Component** (`/components/layout/Footer.tsx`):
```typescript
import { getVersion } from '@/lib/config/version'

export function Footer() {
  return (
    <footer>
      <span className="font-mono">{getVersion()}</span>
      {/* Displays: v0.9.2-beta */}
    </footer>
  )
}
```

**NewFooter Component** (`/components/new-design/layout/NewFooter.tsx`):
```typescript
// Currently hardcoded
<div className="text-sm text-muted-foreground">
  v1.0.0  {/* ← Should use getVersion() */}
</div>
```

**Recommendation**: Update `NewFooter.tsx` to use the centralized version.

### Recommended Update

**File**: `/components/new-design/layout/NewFooter.tsx`

```typescript
"use client"

import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { getVersion } from "@/lib/config/version"  // ← Add this import

export function NewFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-gray-50 dark:bg-gray-950 mt-auto">
      <div className="px-6 py-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Left Side - Copyright */}
          <div className="text-sm text-muted-foreground">
            &copy; {currentYear} ChainReact. All rights reserved.
          </div>

          {/* Center - Links */}
          <div className="flex items-center gap-4 text-sm">
            {/* ... links ... */}
          </div>

          {/* Right Side - Version */}
          <div className="text-sm text-muted-foreground">
            {getVersion()}  {/* ← Use dynamic version */}
          </div>
        </div>
      </div>
    </footer>
  )
}
```

---

## Version Strategy Recommendations

### Development Phase (Current: v0.x.x-beta)

**Purpose**: Rapid iteration, breaking changes allowed

**Version pattern**:
- v0.9.0-beta → v0.9.1-beta → v0.9.2-beta (bug fixes)
- v0.9.2-beta → v0.10.0-beta (new features)
- Keep `beta` suffix until public launch

**When to increment**:
- **Patch**: Every bug fix or small improvement
- **Minor**: Every new feature or integration
- **Major**: Stay at 0 until public launch

### Pre-Launch Phase (Suggested: v1.0.0-rc.x)

**Purpose**: Feature freeze, final testing

**Version pattern**:
- v0.10.5-beta → v1.0.0-rc.1 (first release candidate)
- v1.0.0-rc.1 → v1.0.0-rc.2 (bug fixes)
- v1.0.0-rc.2 → v1.0.0 (stable release)

**Timeline**:
- rc.1: 2 weeks before launch
- rc.2+: Bug fixes only
- v1.0.0: Launch day

### Production Phase (Future: v1.x.x)

**Purpose**: Stable, backwards-compatible releases

**Version pattern**:
- v1.0.0 → v1.0.1 → v1.0.2 (hotfixes)
- v1.0.2 → v1.1.0 (new features)
- v1.1.0 → v2.0.0 (breaking changes)

**Release cadence**:
- **Patch**: As needed (hotfixes)
- **Minor**: Every 2-4 weeks (feature releases)
- **Major**: Every 6-12 months (major updates)

---

## Changelog Integration

### Update CHANGELOG.md with Every Version

**File**: `/learning/logs/CHANGELOG.md`

**Format**:
```markdown
# Changelog

## [1.0.0] - 2025-11-01 (Codename: Thunder)

### Added
- New Gmail advanced filters
- Workflow templates marketplace
- Team collaboration features

### Changed
- Redesigned workflow builder UI
- Improved integration connection flow

### Fixed
- Fixed Airtable webhook deduplication
- Resolved Discord message formatting issue

### Breaking Changes
- Removed deprecated v1 API endpoints
- Changed workflow node configuration format

## [0.10.0-beta] - 2025-10-21

### Added
- Slack thread support
- Microsoft Teams integration

### Fixed
- OAuth redirect bug on mobile

## [0.9.2-beta] - 2025-10-13

### Fixed
- Integration status display bug
- Workflow activation error handling
```

---

## Version Communication

### User-Facing Version Information

**Where to show version**:
- ✅ Footer (already implemented)
- ✅ Settings page (recommended)
- ✅ About page (recommended)
- ✅ Support requests (automatic)

**Additional displays** (optional):
```typescript
// Settings page
<div>
  <h3>Version Information</h3>
  <p>Version: {getVersion()}</p>
  <p>Released: {APP_VERSION.releaseDate}</p>
  <p>Codename: {APP_VERSION.codename}</p>
</div>

// About page
<div>
  <h1>ChainReact {getVersion()}</h1>
  <p>Codename: {APP_VERSION.codename}</p>
  <Link href="/changelog">View Changelog</Link>
</div>
```

### Update Notifications (Future Enhancement)

When users have an outdated client:

```typescript
// Check version in API
export async function GET(req: Request) {
  const clientVersion = req.headers.get('x-client-version')
  const currentVersion = getShortVersion()

  if (clientVersion && clientVersion !== currentVersion) {
    return Response.json({
      updateAvailable: true,
      currentVersion: currentVersion,
      message: 'A new version is available. Please refresh.'
    })
  }
}

// Show banner to user
if (response.updateAvailable) {
  showBanner('New version available! Please refresh to update.')
}
```

---

## Quick Reference

### Version Update Checklist

**Before Every Release**:
- [ ] Update `lib/config/version.ts` (major/minor/patch)
- [ ] Update `package.json` version
- [ ] Update release date in `version.ts`
- [ ] Update `CHANGELOG.md` with changes
- [ ] Test build locally (`npm run build`)
- [ ] Verify version displays in footer
- [ ] Commit with version message
- [ ] Create git tag (optional)
- [ ] Deploy to development first
- [ ] Test on development deployment
- [ ] Deploy to production

### Common Version Commands

```bash
# View current version
grep -A 3 "APP_VERSION = {" lib/config/version.ts

# Update version manually
# Edit lib/config/version.ts

# Create version tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# List all version tags
git tag -l "v*"
```

### Files to Update

1. `/lib/config/version.ts` - **Primary version source**
2. `/package.json` - Keep in sync
3. `/learning/logs/CHANGELOG.md` - Document changes
4. `/components/new-design/layout/NewFooter.tsx` - Use getVersion()

---

## Summary

**Current Version**: v0.9.2-beta
**Version File**: `/lib/config/version.ts`
**Display**: Footer component
**Format**: Semantic Versioning (SemVer)

**To Update Version**:
1. Edit `/lib/config/version.ts`
2. Update `major`, `minor`, or `patch`
3. Update `releaseDate`
4. Update `package.json` to match
5. Document in `CHANGELOG.md`
6. Commit and deploy

**Last Updated**: 2025-10-21
