# Trash Scripts

**Purpose:** This folder contains one-off scripts that have already been executed and can be safely deleted.

## Rules

1. **Any script in this folder can be deleted at any time**
2. All one-time migration/fix scripts should be placed here IMMEDIATELY after creating them
3. Once a script has been run successfully, it stays here until periodic cleanup
4. Scripts in this folder should NOT be referenced in package.json or production workflows

## Types of Scripts That Belong Here

- ✅ Database migrations that have been applied
- ✅ One-time fix scripts (fix-*, apply-*, update-*)
- ✅ Debug/test scripts for specific bugs
- ✅ Data transformation scripts
- ✅ Schema modification scripts
- ✅ Template/data cleanup scripts

## Types of Scripts That Do NOT Belong Here

- ❌ Scripts referenced in package.json
- ❌ Recurring maintenance scripts
- ❌ Development tools (build, dev server, logs)
- ❌ Testing infrastructure
- ❌ CLI tools for managing integrations/providers

## 🚨 Cleanup Policy - REGULAR MAINTENANCE REQUIRED

**This folder MUST be cleaned regularly to prevent accumulation.**

### Cleanup Schedule:
- **MONTHLY** - Review and delete old scripts
- **BEFORE MAJOR RELEASES** - Clean out all scripts
- **WHEN 5-10+ FILES** - Immediate cleanup required
- **QUARTERLY AT MINIMUM** - Even if few files

### How to Clean:
```bash
# Delete all scripts in trash (keeps README)
rm scripts/trash/*.{js,ts,cjs,mjs,sh,md} 2>/dev/null || true
# Or on Windows:
del scripts\trash\*.js scripts\trash\*.ts scripts\trash\*.cjs scripts\trash\*.mjs
```

### Before Deleting - Quick Checklist:

✅ Script has been successfully executed
✅ Not referenced anywhere in the codebase
✅ Not documented as a recurring utility
✅ More than 1 week old (or confirmed one-time use)

**If unsure, delete it anyway.** Git preserves history if needed later.

---

**Last Cleanup:** January 2026 - Removed 71 obsolete scripts
