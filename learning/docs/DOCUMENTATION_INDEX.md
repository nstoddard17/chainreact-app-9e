# Documentation Index - Quick Reference

**Last Updated**: March 29, 2026

This document tells you which documentation files to reference for common tasks.

---

## 🎯 Quick Links

### Configuration Modal
**Primary Doc**: [configuration-modal-tabs-qa-summary.md](configuration-modal-tabs-qa-summary.md)
- Complete implementation details
- All recent fixes (Nov 3, 2025)
- File organization
- Testing checklist

**When to Use**: Adding/modifying configuration UI, understanding tab system, debugging modal issues

---

### Integration Testing
**Primary Docs**:
1. [NODE_TESTING_SYSTEM.md](/learning/logs/archive/NODE_TESTING_SYSTEM.md) - Automated testing for all 247 nodes
2. [action-trigger-implementation-guide.md](action-trigger-implementation-guide.md) - Action/trigger testing implementation

**When to Use**: Running node tests, adding new integrations, debugging test failures

**Quick Start**:
```bash
# Quick validation (safe, 2-5 seconds)
curl http://localhost:3000/api/testing/nodes

# Full test (real API calls, 5-10 minutes)
curl -X POST http://localhost:3000/api/testing/nodes \
  -H "Content-Type: application/json" \
  -d '{"testRealAPIs": true}'
```

---

### Field Implementation
**Primary Doc**: [field-implementation-guide.md](field-implementation-guide.md)
- How to add new field types
- Field mapping configuration
- Dynamic options loading
- Validation patterns

**When to Use**: Adding new configuration fields, debugging field rendering, implementing custom field types

---

### Modal Overflow
**Primary Doc**: [modal-column-overflow-solution.md](modal-column-overflow-solution.md)
- ConfigurationContainer pattern
- When to use ScrollArea
- Wide content handling

**When to Use**: Fixing overflow issues, understanding content constraints

---

### Adding a New Integration (START HERE)
**Primary Doc**: [complete-integration-guide-2025.md](complete-integration-guide-2025.md)
- Complete step-by-step guide: OAuth, nodes, data handlers, actions, triggers
- All file paths verified against current codebase (March 2026)
- Quick reference checklist of all files to create/modify

**When to Use**: Adding any new integration from scratch

**Estimated Time**: 2-3 hours (simple) to 8-12 hours (complex)

---

### Action/Trigger Deep-Dive
**Primary Doc**: [action-trigger-implementation-guide.md](action-trigger-implementation-guide.md)
- ActionResult interface, error handling patterns
- Trigger lifecycle architecture (webhook, passive, polling)
- Provider-specific notes (Microsoft Graph, Stripe, polling)
- Troubleshooting guide
- Lifecycle management
- Troubleshooting common issues

**When to Use**: Adding new actions/triggers, debugging lifecycle issues

---

### Refactoring Guide
**Primary Doc**: [refactoring-guide.md](refactoring-guide.md)
- Safe refactoring patterns
- Import update checklist
- Handler registration
- Documentation requirements

**When to Use**: Restructuring code, moving files, updating component architecture

---

### Template Management
**Primary Docs**:
1. [template-management-supabase-guide.md](template-management-supabase-guide.md) - Complete guide
2. [template-quick-reference.md](template-quick-reference.md) - Quick lookup

**When to Use**: Creating/editing workflow templates, understanding template schema

---

### AI Agent Flow
**Primary Docs**:
1. [agent-flow-integration-complete.md](agent-flow-integration-complete.md) - Technical details

**When to Use**: Understanding AI agent architecture, planning enhancements

---

### CLAUDE.md Rules
**Primary Doc**: [/CLAUDE.md](/CLAUDE.md) - Project-wide coding guidelines

**Critical Sections**:
- Root Cause Analysis Protocol (mandatory)
- API Efficiency (mandatory)
- Light & Dark Mode Color Schema (mandatory)
- Search Exhaustively (never stop at first instance)
- Admin Debug Panel Logging (mandatory)
- Network Call Requirements (mandatory)

**When to Use**: Before starting ANY task, always review relevant sections

---

## 📁 File Organization

### Active Documentation (`/learning/docs/`)

**Configuration UI**:
- `configuration-modal-tabs-qa-summary.md` ✅ Current
- `modal-column-overflow-solution.md` ✅ Current
- `field-implementation-guide.md` ✅ Current

**Testing**:
- `phase2b-testing-guide.md` ✅ Current

**Integration Development**:
- `integration-development-guide.md` ✅ Current
- `action-trigger-implementation-guide.md` ✅ Current
- `refactoring-guide.md` ✅ Current

**Templates**:
- `template-management-supabase-guide.md` ✅ Current
- `template-quick-reference.md` ✅ Current

**AI Agent**:
- `agent-flow-integration-complete.md` ✅ Current

**Other**:
- `combobox-field-styling-guide.md` ✅ Current
- `cors-security-guide.md` ✅ Current
- `logging-best-practices.md` ✅ Current

### Archived Documentation

**Moved to `/learning/docs/archive/`** (historical reference only):
- `ConfigurationModal-Refactoring.md` - 2023 refactoring plan (already completed)
- `ConfigurationModal-Migration.md` - 2023 migration guide (already completed)

**Removed** (no longer relevant):
- `/learning/walkthroughs/ConfigurationModal.md` - Superseded by configuration-modal-tabs-qa-summary.md

---

## 🚨 Documentation Update Protocol

### When to Update Documentation

After completing ANY of these:
1. Bug fix that took >30 minutes to solve
2. New integration, action, or trigger added
3. Discovering gotchas or non-obvious behavior
4. Architectural changes
5. New patterns that should be reused

### Which File to Update

| What Changed | Update This File |
|-------------|------------------|
| Configuration UI | `configuration-modal-tabs-qa-summary.md` |
| Node testing | `/learning/logs/archive/NODE_TESTING_SYSTEM.md` |
| Action/trigger implementation | `action-trigger-implementation-guide.md` |
| New integration | `integration-development-guide.md` |
| Field types | `field-implementation-guide.md` |
| Template structure | `template-quick-reference.md` |
| AI agent features | `agent-flow-integration-complete.md` |
| Bug fix walkthrough | `/learning/walkthroughs/[descriptive-name].md` |
| Major feature | `/learning/logs/CHANGELOG.md` |
| Social media update | `/learning/logs/socialMedia.md` (ADD AT TOP) |

### Update Format

```markdown
### [Date]
- What changed
- Why it changed
- Files affected
- How to use the new pattern
```

---

## 🗑️ Files Safe to Delete

These files are outdated and can be removed:

### Already Archived
- ✅ `ConfigurationModal-Refactoring.md` → Moved to `archive/`
- ✅ `ConfigurationModal-Migration.md` → Moved to `archive/`

### Can Be Deleted
- ❌ `/learning/walkthroughs/ConfigurationModal.md` - Superseded by configuration-modal-tabs-qa-summary.md

**Note**: Don't delete files in `/learning/walkthroughs/` that describe specific bug fixes or troubleshooting sessions - these are valuable historical context.

---

## 📚 Documentation by Task Type

### "I want to add a new integration"
1. Read: `integration-development-guide.md`
2. Read: `action-trigger-implementation-guide.md`
3. Reference: `field-implementation-guide.md`
4. After completion, update: `integration-development-guide.md` with lessons learned

### "I want to modify the configuration UI"
1. Read: `configuration-modal-tabs-qa-summary.md`
2. Read: `modal-column-overflow-solution.md`
3. Reference: `field-implementation-guide.md`
4. After completion, update: `configuration-modal-tabs-qa-summary.md` changelog

### "I want to test all nodes"
1. Read: `/learning/logs/archive/NODE_TESTING_SYSTEM.md`
2. Run: Quick validation first (2-5 seconds)
3. Fix: Failed nodes
4. Run: Full test with real APIs (careful!)

### "I want to add a new workflow template"
1. Read: `template-quick-reference.md`
2. Reference: `template-management-supabase-guide.md`
3. Use: Supabase dashboard or API

### "I'm getting an error I don't understand"
1. Check: `CLAUDE.md` for related protocols
2. Search: `/learning/walkthroughs/` for similar issues
3. Use: Admin Debug Panel (if admin user)
4. After fix, document in: `/learning/walkthroughs/[issue-name].md`

---

## 🎯 Most Important Docs (Read First)

1. **[/CLAUDE.md](/CLAUDE.md)** - Project-wide rules (MANDATORY)
2. **[configuration-modal-tabs-qa-summary.md](configuration-modal-tabs-qa-summary.md)** - UI reference
3. **[NODE_TESTING_SYSTEM.md](/learning/logs/archive/NODE_TESTING_SYSTEM.md)** - Testing guide
4. **[integration-development-guide.md](integration-development-guide.md)** - Integration basics
5. **[action-trigger-implementation-guide.md](action-trigger-implementation-guide.md)** - Action/trigger checklist

---

**Maintained By**: Development Team
**Review Frequency**: After major changes
**Next Review**: December 2025
