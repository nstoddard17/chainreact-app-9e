# Pre‑Activation Checks and “Fix” Links

This doc explains how the Pre‑Activation Check modal works in the Workflow Builder and how to add new checks with actionable “Fix” links.

## Overview

- The builder includes a Pre‑Activation Check button in the header that runs a set of readiness checks before activating a workflow.
- Results appear in a modal. Each failing item can include a “Fix” button that navigates the user directly to the appropriate configuration panel.
- Admins also have a toolbar button to “Clean Up Add Buttons” that normalizes the “+ Add Action” positions (separate feature).

## Files

- Builder container and UI: `components/workflows/CollaborativeWorkflowBuilder.tsx`
  - Pre‑Activation state/layout: see `WorkflowBuilderContent()`
  - Checks runner: `runPreActivationCheck()`
  - Modal UI: Pre‑Activation Check modal in the builder header area
  - Fix actions: inline handler attached to the “Fix” button

## How Checks Work

1. The Pre‑Activation button sets `showPrecheck` to true and calls `runPreActivationCheck()`.
2. `runPreActivationCheck()` builds an array of results: `{ name: string; ok: boolean; info?: string }[]`
   - Structural checks: Trigger present, AI Agent present, has connections
   - Trigger‑specific checks: Discord (server/channel), Webhook (path/method)
   - Integration connection checks: scans nodes; for each provider found, verifies it’s connected
3. Results are rendered in the modal as a green (✓) or red (✗) line.
4. For failing checks, a “Fix” button appears that opens the relevant config quickly.

## The “Fix” Links

- The modal currently dispatches fix actions based on the `name` of the failing result. For example:
  - If `name` includes “discord”, it finds the trigger node and calls `handleConfigureNode(trigger.id)`.
  - If `name` includes “webhook”, it also opens the trigger node configuration.
- The core API for opening a configuration panel is available in the builder scope:
  - `handleConfigureNode(nodeId: string)`

### Where to Add Fixes

- In `WorkflowBuilderContent()`, look for the Pre‑Activation modal markup where results are listed and the “Fix” button is rendered.
- The inline handler looks like:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    const nodes = getNodes()
    const trigger = nodes.find((n: any) => n?.data?.isTrigger)
    if (trigger && r.name.toLowerCase().includes('discord')) {
      handleConfigureNode(trigger.id)
      setShowPrecheck(false)
      return
    }
    if (trigger && r.name.toLowerCase().includes('webhook')) {
      handleConfigureNode(trigger.id)
      setShowPrecheck(false)
      return
    }
  }}
>
  Fix
</Button>
```

## Adding New Checks

1. Add a check in `runPreActivationCheck()`
   - Expand the function to detect a new condition and push a result:

```ts
// Example: Slack channel configured for any Slack action
const slackAction = all.find((n: any) => n.data?.providerId === 'slack')
if (slackAction) {
  const channel = slackAction.data?.config?.channel
  results.push({ name: 'Slack channel configured', ok: !!channel })
}
```

2. Add a matching Fix action
   - In the modal’s “Fix” button handler, locate the appropriate node and call `handleConfigureNode(node.id)`.

```tsx
if (r.name.toLowerCase().includes('slack')) {
  const slackNode = getNodes().find((n: any) => n.data?.providerId === 'slack')
  if (slackNode) {
    handleConfigureNode(slackNode.id)
    setShowPrecheck(false)
    return
  }
}
```

3. (Optional) Add a provider ping
   - You can also check if a provider’s API is reachable using an existing data fetch endpoint.
   - Example for Discord guilds: `fetch('/api/integrations/fetch-user-data?dataType=discord_guilds')` and evaluate `res.ok`.

## Guardrails vs. Pre‑Checks

- Pre‑Activation Check: non‑blocking; guides the user before they activate.
- Activation Guard: blocking; prevents activation until a hard requirement is met (e.g., Discord trigger needs server & channel). See `handleToggleLive()`.

## Tips

- Keep `name` clear and descriptive. The “Fix” handler maps on name text; short prefixes like “Slack: channel configured” or “Notion: database selected” are easy to match.
- If a Fix requires opening a non‑trigger node (e.g., Notion action), search nodes by `providerId` or `data.type`.
- If a check relates to multiple nodes (e.g., several Slack actions), send the user to the first one or the one currently selected.
- Prefer small, fast checks; put heavier, optional pings behind an extra button if necessary.

## Related Features

- Add Action normalization
  - “+ Add Action” buttons are normalized after load and available via the admin “Clean Up Add Buttons” toolbar button.
  - See: `normalizeAddActionButtons()` and the admin cleanup button in the header.

## Future Enhancements

- Centralize Fix mapping (a map from result keys to fix functions) to avoid string matching in the modal.
- Add more provider pings (Slack/Notion/Trello/Gmail/Outlook) and surface detailed error messages.
- Provide deep linking to a specific field within the configuration panel once field‑level anchors are available.

