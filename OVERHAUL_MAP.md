# Legacy to New Architecture Mapping

## Overview
This document maps the legacy code structure to the new infrastructure after the major workflow engine overhaul.

## Directory Structure Mapping

### NEW Architecture (src/*)
```
src/
├── infrastructure/           # New comprehensive infrastructure layer
│   ├── workflows/           # Advanced workflow systems
│   ├── security/           # Security & audit systems  
│   ├── performance/        # Performance & monitoring
│   ├── providers/          # Provider adapters
│   └── rate-limiting/      # Rate limiting systems
├── domains/                # Domain-driven design structure
├── shared/                 # Shared utilities and types
└── sdk/                   # SDK generation framework
```

### LEGACY Code (lib/*, services/*)
```
lib/
├── workflows/              # OLD: Basic workflow execution
├── integrations/          # OLD: Integration utilities
├── auth/                  # OLD: Basic auth helpers
├── ai/                   # OLD: AI utilities
└── various utilities/     # OLD: Scattered utilities

services/                  # OLD: Single service file
```

## Specific Mappings

### Workflow Systems
| Legacy | New | Status | Notes |
|--------|-----|--------|-------|
| `lib/workflows/WorkflowExecutor.ts` | `src/infrastructure/workflows/workflow-engine.ts` | ✅ Replace | Advanced execution with priority queuing |
| `lib/workflows/executeNode.ts` | `src/infrastructure/workflows/workflow-engine.ts` | ✅ Replace | Integrated into AdvancedWorkflowEngine |
| `lib/workflows/availableNodes.ts` | `src/infrastructure/workflows/workflow-engine.ts` | 🔍 Merge | Node definitions integrated |
| `lib/workflows/actions/*` | `src/domains/workflows/` | 📝 Migrate | Move to domain structure |

### Security & Performance
| Legacy | New | Status | Notes |
|--------|-----|--------|-------|
| `lib/auth.ts` | `src/infrastructure/security/oauth-token-manager.ts` | ✅ Replace | Enhanced OAuth management |
| `lib/secrets.ts` | `src/infrastructure/security/token-manager.ts` | ✅ Replace | Advanced encryption & rotation |
| No equivalent | `src/infrastructure/security/audit-logger.ts` | ✅ New | Comprehensive audit logging |
| No equivalent | `src/infrastructure/performance/performance-monitor.ts` | ✅ New | Real-time monitoring |

### Integration Systems  
| Legacy | New | Status | Notes |
|--------|-----|--------|-------|
| `lib/integrations/oauthConfig.ts` | `src/infrastructure/providers/*-adapter.ts` | ✅ Replace | Provider-specific adapters |
| `lib/integrations/tokenRefreshService.ts` | `src/infrastructure/security/oauth-token-manager.ts` | ✅ Replace | Enhanced token management |
| `services/integration-service.ts` | `src/domains/integrations/` | 📝 Migrate | Move to domain structure |

### AI & Analytics
| Legacy | New | Status | Notes |
|--------|-----|--------|-------|
| `lib/ai/*` | `src/domains/ai-agent/` | 📝 Migrate | Move to domain structure |
| No equivalent | `src/infrastructure/workflows/workflow-analytics.ts` | ✅ New | Comprehensive analytics |

## Import Pattern Changes

### Before (Legacy)
```typescript
import { WorkflowExecutor } from '@/lib/workflows/WorkflowExecutor'
import { oauthConfig } from '@/lib/integrations/oauthConfig'
import { refreshToken } from '@/lib/integrations/refreshToken'
```

### After (New)
```typescript
import { workflowEngine } from '@/src/infrastructure/workflows/workflow-engine'
import { oauthTokenManager } from '@/src/infrastructure/security/oauth-token-manager'
import { auditLogger } from '@/src/infrastructure/security/audit-logger'
```

## Action Items

### High Priority
1. ❌ **CRITICAL**: Replace all imports from `lib/workflows/WorkflowExecutor` → `src/infrastructure/workflows/workflow-engine`
2. ❌ **CRITICAL**: Replace all imports from `lib/integrations/tokenRefreshService` → `src/infrastructure/security/oauth-token-manager`
3. ❌ **CRITICAL**: Verify no code still imports from `lib/workflows/executeNode.ts`

### Medium Priority  
4. 📝 Migrate `lib/workflows/actions/*` to `src/domains/workflows/`
5. 📝 Migrate `services/integration-service.ts` to `src/domains/integrations/`
6. 🧹 Remove unused legacy files after migration verification

### Low Priority
7. 🧹 Clean up duplicate utilities across `lib/utils/` vs `src/shared/`
8. 🧹 Remove legacy test files that test old implementations

## Verification Commands

```bash
# Check for legacy workflow imports
grep -r "lib/workflows/WorkflowExecutor" --include="*.ts" --include="*.tsx" .

# Check for legacy integration imports  
grep -r "lib/integrations/tokenRefreshService" --include="*.ts" --include="*.tsx" .

# Check for legacy executeNode imports
grep -r "lib/workflows/executeNode" --include="*.ts" --include="*.tsx" .

# Verify new infrastructure is being used
grep -r "src/infrastructure/workflows/workflow-engine" --include="*.ts" --include="*.tsx" .
```

## Notes
- All new infrastructure systems are comprehensive and production-ready
- Legacy systems lack many features present in new architecture (analytics, version control, advanced scheduling)
- Security and performance improvements are significant in new architecture
- Domain-driven design structure provides better organization and maintainability