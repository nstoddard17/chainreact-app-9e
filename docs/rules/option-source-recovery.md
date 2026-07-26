# Option-source recovery contract

**Slice:** REACT-AGENT-RESOLVER-RECOVERY-1 · **Status:** durable rule

A provider option resolver can fail. When it does, the field it backs must stay **finishable**.
A resolver outage, an expired connection, a missing scope, an empty account, or a transient
provider error must never leave a required field non-editable with no way forward.

## The rule

> Every resolver-backed field must, in every non-ready state, tell the user honestly what happened
> and offer every recovery that situation actually supports.

Concretely, a renderer for an `optionsSource` field may **not**:

- collapse distinguishable failures into one message ("Couldn't load options."),
- render an instruction it cannot carry out ("You can finish this in the step editor" with no such
  action wired),
- offer a retry for a state where retrying provably cannot change the answer, or
- leave the field read-only when a hand-typed provider identifier would legitimately unblock it.

## The shared pieces

| Concern | Module |
| --- | --- |
| Classify a non-ready resolver state → honest copy + which recoveries apply | `core/workflows/options/optionsRecovery.ts` (`classifyOptionsRecovery`) |
| Validate a hand-typed provider identifier | same module (`validateManualOptionId`) |
| Render the recovery block (React rail setup cards) | `features/workflow-builder/panels/SetupFieldRecovery.tsx` |
| Load options | `features/workflow-builder/hooks/useOptionsSource` → `lib/api/options` → `GET /api/options/[source]` |

`classifyOptionsRecovery` is **pure** and lives in `core/` — no React, no fetch, no store, and
**no provider branches**. Adding recovery for a new provider is never a code change: it is already
covered. If a state reads badly for one provider, fix the classifier, not the call site.

## Recovery states

Derived from the closed `OptionsSourceErrorCode` union (`services/options/types.ts`) plus the
hook's `disconnected` / `needs-reconnect` / `owner-gated` / `owner-must-connect` / `empty` arms:

| Kind | Cause | Retry | Reconnect | Manual ID |
| --- | --- | --- | --- | --- |
| `connection-missing` | `INTEGRATION_DISCONNECTED` · `OWNER_MUST_CONNECT` | ✓ | ✓ | ✓ |
| `reconnect-required` | `PROVIDER_REAUTH_REQUIRED` (revoked token **or** missing scope) | ✓ | ✓ | ✓ |
| `owner-managed` | `NOT_WORKFLOW_OWNER` (personal-credential provider) | — | — | ✓ |
| `provider-unavailable` | `PROVIDER_ERROR` | ✓ | — | ✓ |
| `request-failed` | `SERVER_ERROR` · `UNKNOWN` (transport) | ✓ | — | ✓ |
| `not-available` | `SOURCE_NOT_FOUND` | — | — | ✓ |
| `parent-required` | `MISSING_DEPENDENCY` | — | — | — |
| `sign-in-required` | `UNAUTHENTICATED` | — | — | — |
| `no-results` | resolver returned zero items | ✓ | — | ✓ |

Notes that keep this honest:

- **Scope failures are `reconnect-required`, not a new code.** Provider `_shared` mappers already
  classify a 403 / insufficient-scope as `PROVIDER_REAUTH_REQUIRED` with a sanitized message that
  names the permission; the renderer shows that message verbatim. Do not add a scope-specific error
  code without a mapper sweep across every provider.
- **There is no timeout state.** The options contract cannot distinguish a timeout from any other
  transport failure today, so a stall surfaces as `request-failed` ("we couldn't reach ChainReact"),
  which is true. Do not invent copy for a state the system cannot observe.
- **`owner-managed` offers no retry on purpose.** A non-creator will never resolve another user's
  personal credential, so a retry would be a lie. They can still type an id they already know — the
  step runs on the owner's connection either way.

## Reconnect deep links

Reconnect is an `<a href="/apps?provider=<slug>">`, never an inline OAuth navigation — navigating
away from the builder would drop the unsaved draft. Use `reconnectHrefForProvider`.

## Manual identifier entry

Offered for resolver-backed fields whose committed value is a provider id string. It commits through
the **same** `onChange` the picker uses, so nothing downstream (seeding, readiness, runtime schema)
can tell the difference.

- A **valid** id is committed.
- An **invalid** id is *not* committed and clears any previously committed value, so readiness stays
  honest — while the user's typed text is preserved for correction.
- `validateManualOptionId` refuses whitespace (the "I pasted the display name" case), `{{…}}`
  variable tokens (those belong in the step editor), markup / control characters, and absurd
  lengths. The runtime `.strict()` Zod schema remains the authoritative contract server-side.

## "Open step editor"

Render the action **only** when a working handler is wired, and label it for what it really does:

- **Existing draft node** → "Open step editor". Selects the node, opens its config panel, highlights
  the field (`configSlice.revealNode({ nodeId, fieldKey })`). Navigation only.
- **Preview node (not in the draft yet)** → "Add to draft & open step". A preview node has no config
  panel, so the honest implementation runs the same explicit additive local-draft apply the Apply
  button performs (carrying every entered value), then reveals the resulting node. The preview id →
  real node id mapping is exact (`previewIdToPatchRef` + `applyAdditivePatch`'s `addedNodeIdByRef`) —
  never positional, so a skipped trigger cannot misroute it.

## Safety

Nothing here may surface a token, a scope list, an account/integration id, a provider response body,
or a stack trace. Only two provider-derived strings reach user copy: the option-source key (public
builder metadata) and the route's own sanitized message. This is enforced by tests in
`tests/unit/core/workflows/options/optionsRecovery.test.ts` and
`tests/integration/features/workflow-builder/hermes-guidance/react-agent-resolver-recovery.test.ts`.

## Where this applies

Both React-rail setup cards (`BuilderPreviewSetupCard`, `BuilderNodeSetupCard`) via
`builderSetupFieldControls.tsx`. The config-modal `ComboboxField` already shipped differentiated
disconnected / needs-reconnect / owner-gated states and an opt-in `allowManualEntry`; it is the
precedent this generalizes, and a future sweep should move it onto `classifyOptionsRecovery` so the
copy has exactly one source.
