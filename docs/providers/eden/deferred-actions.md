# Eden — Deferred Publishing Actions (CS-6D)

**Status:** three Eden actions are DEFERRED (hidden) pending live success
certification. Local/unpushed.

## What is deferred, and why

Eden ships 33 live-certified actions. Three social-publish WRITE actions are
**not** live success-certified — the certification account has **no connected
social accounts**, so `schedule_post` / `publish_post_now` /
`update_scheduled_post` only ever returned a deterministic 400 ("No active
connection"). Their error path is certified; their SUCCESS path is not. Two of
them are `riskLevel: "high"` public-publish writes. Shipping an unverified
public-publish success path is not acceptable, so they are hidden.

| Action | Type | Risk | Why deferred |
|---|---|---|---|
| Schedule Post | `schedule_post` | high | public auto-publish; success path not live-certified (no connected social account) |
| Publish Post Now | `publish_post_now` | high + confirm | immediate public publish; success path not live-certified |
| Update Scheduled Post | `update_scheduled_post` | write | edits a scheduled public post; success path not live-certified |

## How they are hidden (CS-6D)

- **Discovery/meta registration:** removed from `EDEN_ACTION_METAS`
  (`services/discovery/providers/eden.ts`) — not in the builder node picker, the
  React-Agent capability catalog, or the Apps surface.
- **Execution registration:** removed from `_handlerInventory.ts` — the engine
  cannot dispatch them (a workflow cannot reference them).
- **Manifest honesty:** `integrations/eden/manifest.ts` states 33 registered
  actions; `provider_metadata_consistency` sees 33 metas / 33 handlers.
- **Implementation retained:** the `.meta.ts` / `.schema.ts` / `.ts` files stay
  in `integrations/eden/actions/scheduling/` as orphans (CLAUDE.md rule 14 —
  registry presence, not file presence, defines the shipped set). Their metadata
  contract is still unit-tested via direct import
  (`tests/unit/integrations/eden/scheduling-metadata.test.ts`).

## Re-enabling (the exact steps)

Once a disposable Eden account with a connected social channel exists and the
success shapes are live-captured:

1. Live-capture each tool's success result (evidence).
2. Re-add the 3 meta imports + array entries to `services/discovery/providers/eden.ts`.
3. Re-add the 3 handler imports + inventory entries to `_handlerInventory.ts`.
4. Update `scheduling-metadata.test.ts` to move the 3 from `BATCH3_DEFERRED` back
   to `BATCH3_VISIBLE` and restore the registry-backed assertions.
5. Update the manifest note 33 → 36.
6. Curate/verify their bounded outputs from the captured success shapes.

Do NOT re-enable without a live success capture.
