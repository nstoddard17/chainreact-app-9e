# IntegrationStore.ts Refactoring Plan

## Current State Analysis

**File Size**: 1,830 lines  
**Main Issues**:
- Single Responsibility Principle violations
- Mixed concerns in one massive file
- Global state management with module-level variables
- Difficult to test, debug, and maintain
- Multiple responsibilities bundled together

## Refactoring Strategy: Module Extraction

### Phase 1: Extract Utility Modules (Low Risk)

#### 1.1 Session Management → `lib/auth/session.ts`
**Extract**: `getSecureUserAndSession()` function
```typescript
// lib/auth/session.ts
export class SessionManager {
  static async getSecureUserAndSession() {
    // Current implementation moved here
  }
  
  static async refreshSession() {
    // Session refresh logic
  }
  
  static validateUser(user: any) {
    // User validation logic
  }
}
```

#### 1.2 OAuth Popup Management → `lib/oauth/popup-manager.ts`
**Extract**: Popup-related functions and global variables
```typescript
// lib/oauth/popup-manager.ts
export class OAuthPopupManager {
  private static currentPopup: Window | null = null
  private static windowHasLostFocus = false
  
  static isPopupValid(popup: Window | null): boolean { }
  static closeExistingPopup(): void { }
  static openOAuthPopup(url: string, provider: string): Window | null { }
  static setupPopupListeners(popup: Window, provider: string): Promise<any> { }
}
```

#### 1.3 Integration Data Service → `services/integration-service.ts`
**Extract**: API communication logic
```typescript
// services/integration-service.ts
export class IntegrationService {
  static async fetchIntegrations(userId: string): Promise<Integration[]> { }
  static async loadIntegrationData(providerId: string, integrationId: string): Promise<any> { }
  static async connectProvider(providerId: string): Promise<void> { }
  static async disconnectProvider(integrationId: string): Promise<void> { }
}
```

### Phase 2: Extract Business Logic (Medium Risk)

#### 2.1 OAuth Connection Flow → `lib/oauth/connection-flow.ts`
**Extract**: OAuth connection orchestration
```typescript
// lib/oauth/connection-flow.ts
export class OAuthConnectionFlow {
  static async startConnection(providerId: string): Promise<void> { }
  static async handleOAuthCallback(data: any): Promise<void> { }
  static async setupStoragePolling(providerId: string): Promise<void> { }
}
```

#### 2.2 Reconnection Logic → `lib/oauth/reconnection-flow.ts`
**Extract**: Integration reconnection logic
```typescript
// lib/oauth/reconnection-flow.ts
export class ReconnectionFlow {
  static async reconnectIntegration(integrationId: string): Promise<void> { }
  static async generateReconnectionUrl(integration: Integration): Promise<string> { }
  static async handleReconnectionCallback(data: any): Promise<void> { }
}
```

#### 2.3 Scope Validation → `lib/integrations/scope-validator.ts`
**Extract**: Scope checking and validation
```typescript
// lib/integrations/scope-validator.ts
export class ScopeValidator {
  static validateScopes(providerId: string, grantedScopes: string[]): boolean { }
  static getRequiredScopes(providerId: string): string[] { }
  static getMissingScopes(providerId: string, grantedScopes: string[]): string[] { }
}
```

### Phase 3: Create Custom Hooks (Low Risk)

#### 3.1 OAuth Hooks → `hooks/use-oauth.ts`
**Create**: React hooks for OAuth operations
```typescript
// hooks/use-oauth.ts
export function useOAuth() {
  const connectProvider = useCallback(async (providerId: string) => { }, [])
  const reconnectIntegration = useCallback(async (integrationId: string) => { }, [])
  
  return { connectProvider, reconnectIntegration, isConnecting, error }
}
```

#### 3.2 Integration Data Hooks → `hooks/use-integration-data.ts`
**Create**: Hooks for data fetching
```typescript
// hooks/use-integration-data.ts
export function useIntegrationData(providerId: string, integrationId: string) {
  // Data fetching logic with caching
  return { data, loading, error, refetch }
}
```

### Phase 4: Refactor Core Store (High Risk)

#### 4.1 Slimmed Down Store → `stores/integration-store.ts`
**Keep**: Only essential state management (target: ~300 lines)
```typescript
// stores/integration-store.ts
interface IntegrationState {
  integrations: Integration[]
  providers: Provider[]
  loading: boolean
  error: string | null
}

interface IntegrationActions {
  // Core state updates only
  setIntegrations: (integrations: Integration[]) => void
  addIntegration: (integration: Integration) => void
  removeIntegration: (id: string) => void
  updateIntegrationStatus: (id: string, status: string) => void
}

export const useIntegrationStore = create<IntegrationState & IntegrationActions>(...)
```

#### 4.2 Store Orchestration → `stores/integration-orchestrator.ts`
**Create**: Coordinates between services and store
```typescript
// stores/integration-orchestrator.ts
export class IntegrationOrchestrator {
  static async initializeProviders(): Promise<void> {
    // Coordinate provider initialization
  }
  
  static async refreshIntegrations(): Promise<void> {
    // Coordinate integration refresh
  }
}
```

### Phase 5: Event Management (Low Risk)

#### 5.1 Event System → `lib/events/integration-events.ts`
**Extract**: Event management system
```typescript
// lib/events/integration-events.ts
export enum IntegrationEventTypes {
  CONNECTED = 'integration:connected',
  DISCONNECTED = 'integration:disconnected',
  RECONNECTED = 'integration:reconnected',
  ERROR = 'integration:error'
}

export class IntegrationEventManager {
  static emit(event: IntegrationEventTypes, data: any): void { }
  static subscribe(event: IntegrationEventTypes, callback: Function): () => void { }
}
```

## Implementation Strategy

### Step-by-Step Implementation

#### Week 1: Extract Utilities (Safe)
1. Extract `SessionManager` to `lib/auth/session.ts`
2. Extract `OAuthPopupManager` to `lib/oauth/popup-manager.ts`
3. Update imports in `integrationStore.ts`
4. Test existing functionality

#### Week 2: Extract Services (Medium Risk)
1. Extract `IntegrationService` to `services/integration-service.ts`
2. Extract scope validation to `lib/integrations/scope-validator.ts`
3. Update integrationStore to use services
4. Comprehensive testing

#### Week 3: Extract OAuth Logic (High Risk)
1. Extract `OAuthConnectionFlow` to `lib/oauth/connection-flow.ts`
2. Extract `ReconnectionFlow` to `lib/oauth/reconnection-flow.ts`
3. Update store to orchestrate flows
4. End-to-end testing

#### Week 4: Create Hooks & Finalize (Medium Risk)
1. Create custom hooks for common operations
2. Slim down core store to ~300 lines
3. Create orchestrator for complex operations
4. Final testing and optimization

## Benefits After Refactoring

### Code Quality
- **Single Responsibility**: Each module has one clear purpose
- **Testability**: Individual modules can be unit tested
- **Maintainability**: Changes are isolated to specific concerns
- **Readability**: Smaller, focused files are easier to understand

### Performance
- **Bundle Splitting**: Smaller modules enable better code splitting
- **Lazy Loading**: Non-critical features can be loaded on demand
- **Memory Usage**: Reduced memory footprint per component

### Developer Experience
- **Easier Debugging**: Issues isolated to specific modules
- **Better IDE Support**: Smaller files load and analyze faster
- **Clearer Dependencies**: Explicit imports show relationships

## File Structure After Refactoring

```
lib/
├── auth/
│   └── session.ts                 (~100 lines)
├── oauth/
│   ├── popup-manager.ts          (~150 lines)
│   ├── connection-flow.ts        (~200 lines)
│   └── reconnection-flow.ts      (~250 lines)
├── integrations/
│   └── scope-validator.ts        (~100 lines)
└── events/
    └── integration-events.ts     (~50 lines)

services/
└── integration-service.ts        (~200 lines)

hooks/
├── use-oauth.ts                  (~100 lines)
└── use-integration-data.ts       (~80 lines)

stores/
├── integration-store.ts          (~300 lines) ⬅️ Slimmed down
└── integration-orchestrator.ts   (~150 lines)
```

**Total Lines**: ~1,780 lines (distributed across 11 focused files)  
**Average per File**: ~162 lines  
**Largest File**: ~300 lines (core store)

## Risk Mitigation

### Testing Strategy
1. **Before Refactoring**: Create comprehensive integration tests
2. **During Refactoring**: Maintain test coverage for each extracted module
3. **After Refactoring**: Verify all existing functionality works

### Rollback Plan
- Use feature flags to switch between old and new implementations
- Keep original `integrationStore.ts` as backup until refactoring is complete
- Gradual migration with ability to rollback at each phase

### Quality Gates
- All existing tests must pass after each phase
- No performance regressions
- Bundle size should not increase significantly
- All OAuth flows must work identically

This refactoring will transform a monolithic 1,830-line file into a well-structured, maintainable architecture following React and TypeScript best practices.