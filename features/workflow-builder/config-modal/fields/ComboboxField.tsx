"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2, Lock, RefreshCw } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";
import { useOptionsSource } from "@/features/workflow-builder/hooks/useOptionsSource";
import type { OptionItem } from "@/lib/api/options";
import { normalizeDependsOn } from "@/contracts/actionMeta";
// REACT-AGENT-REVIEW-RECOVERY-MERGE-1 — one source for the account-scoped reconnect deep link,
// shared with the React rail's recovery block so both surfaces point at the same place.
import { reconnectHrefForProvider } from "@/core/workflows/options/optionsRecovery";
import { useGraphSlice } from "../../state/graphSlice";
import { useConfigSlice } from "../../state/configSlice";
import { useResourceLabelCache } from "../../state/resourceLabelCache";
import { useActiveNodeUpstreamVariables } from "../../hooks/useActiveNodeUpstreamVariables";
import { VariablePickerButton } from "./VariablePickerButton";
import { FieldSetupHint } from "./FieldSetupHint";
import { describePrefillSource } from "./_prefillSource";
import { classifyConfigFieldValue } from "@/core/workflows/configFieldClassification";
import { MultiOptionsField } from "./MultiOptionsField";

/**
 * `combobox` field renderer. Searchable single-select.
 *
 * Static path (Slice 3.1): `field.options` declared on the meta.
 * Async path (Slice 3.31): `field.optionsSource` set — items loaded
 * via `useOptionsSource` against `lib/api/options.ts`. The two are
 * mutually exclusive per `FieldMetaSchema`'s `superRefine`.
 *
 * Multi-select (FieldMeta.multiple) delegates to MultiOptionsField
 * (CONFIG-UX-AUDIT-1) — static and async paths both write `string[]`.
 *
 * Async UX per docs/slices/phase-3/options-source-plan.md §7.1:
 *   - loading: spinner row
 *   - ready: items
 *   - empty: "No matches."
 *   - error: inline message + retry button (via hook.refetch)
 *   - disconnected: "Connect <provider> first" message
 *   - idle (caller signaled enabled=false): "Select <parent> first"
 *     style helper text (rendered when `dependsOn` is set; the
 *     parent's label drives the wording)
 *
 * `dependsOn` cascade — Slice 3.33.
 *   - SchemaForm passes `deps` (resolved parent values) + `enabled`
 *     (false when a `dependsOn` parent value is missing) + `parentLabel`
 *     (parent field's display label) into this renderer.
 *   - When `enabled === false` for a field that declares `dependsOn`,
 *     the renderer short-circuits to a passive "Select <parentLabel>
 *     first" trigger — popover doesn't open, async hook never mounts.
 *   - When `enabled !== false`, `deps` flows through to
 *     `useOptionsSource` so the resolver receives the parent values
 *     via the route's `?deps[parent]=…` query string.
 */

interface AsyncComboboxBodyProps {
  controlId: string;
  field: FieldRendererProps["field"];
  value: string;
  onChange: (next: string) => void;
  error: string | undefined;
  disabled: boolean | undefined;
  deps: Readonly<Record<string, string>> | undefined;
}

const AsyncComboboxBody: React.FC<AsyncComboboxBodyProps> = ({
  controlId,
  field,
  value,
  onChange,
  error,
  disabled,
  deps,
}) => {
  const [open, setOpen] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState("");

  // 4.TEAM-WORKFLOWS-2 (TW-2): the open workflow's id, read from the builder's
  // canonical graph store. Threaded into the options request so the server
  // applies the 22D-2 credential-sharing policy (account-shared vs.
  // creator-pinned). `null` (no workflow yet) → undefined.
  const workflowId = useGraphSlice((s) => s.workflowId) ?? undefined;

  // CS-4: the node being configured (config rail's active node). Threaded so the
  // server resolves an ACCEPTED per-node credential owner (flag-gated). `null`
  // (no open node) → undefined.
  const nodeId = useConfigSlice((s) => s.activeNodeId) ?? undefined;

  const { state, refetch } = useOptionsSource({
    source: field.optionsSource ?? null,
    query: searchInput,
    ...(deps !== undefined && { deps }),
    ...(workflowId !== undefined && { workflowId }),
    ...(nodeId !== undefined && { nodeId }),
  });

  // Selected-option lookup. When the user picks an option, we cache its
  // label so the trigger keeps showing it even if the next search filter
  // would hide it from the visible list. Pre-existing values (e.g.
  // re-opening a saved workflow) won't have this cached, so the trigger
  // falls back to the raw `value` until the items load.
  const [selectedSnapshot, setSelectedSnapshot] = React.useState<
    OptionItem | null
  >(null);

  const knownSelected = React.useMemo<OptionItem | null>(() => {
    if (selectedSnapshot && selectedSnapshot.value === value) {
      return selectedSnapshot;
    }
    if (state.status === "ready" || state.status === "loading") {
      const match = state.items.find((o) => o.value === value);
      return match ?? null;
    }
    return null;
  }, [selectedSnapshot, state, value]);

  // CONFIG-UX-NODE-SUMMARY-1 — feed every loaded option's label into the shared
  // resource-label cache so node summaries can show recognizable names instead
  // of stored ids. Display-only: the saved value is untouched.
  const setLabels = useResourceLabelCache((s) => s.setLabels);
  const optionsSource = field.optionsSource;
  React.useEffect(() => {
    if (!optionsSource) return;
    if (state.status !== "ready" && state.status !== "loading") return;
    if (state.items.length === 0) return;
    setLabels(
      optionsSource,
      state.items.map((o) => ({ value: o.value, label: o.label })),
    );
  }, [optionsSource, state, setLabels]);

  const triggerLabel = value
    ? (knownSelected?.label ?? value)
    : (field.placeholder ?? "Choose...");

  // RESOLVERS-1 — a saved identifier that is absent from the loaded
  // options (deleted/archived resource, or beyond the first page) must
  // read as an UNAVAILABLE SAVED SELECTION — never silently cleared,
  // never mistaken for a fresh pick. Variable tokens are excluded (the
  // raw-token display is their normal presentation), as is anything the
  // user just committed via manual entry / variable insert (snapshot).
  const savedValueMissingFromList =
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("{{") &&
    knownSelected === null &&
    state.status === "ready" &&
    state.items.length > 0;

  // CS-2 — opt-in manual "name-or-ID" entry. When `field.allowManualEntry`,
  // a power user can commit exactly what they typed (e.g. paste a stable id the
  // resolver can't enumerate) instead of being forced to pick a loaded option.
  // Shown only when the typed input is non-empty AND doesn't exactly match an
  // already-loaded option value (so it never shadows a real pick).
  const loadedItems =
    state.status === "ready" || state.status === "loading" ? state.items : [];
  const manualValue = searchInput.trim();
  const showManualEntry =
    field.allowManualEntry === true &&
    manualValue.length > 0 &&
    !loadedItems.some((o) => o.value === manualValue);

  const commitManualEntry = (): void => {
    onChange(manualValue);
    setSelectedSnapshot({ value: manualValue, label: manualValue });
    setOpen(false);
  };

  // CONFIG-FIELD-UX-SWEEP-2 (Scope A) — variable insertion. A field that accepts
  // free values (allowManualEntry) can also be set to an upstream `{{node.field}}`
  // token. Reuses the same VariablePickerButton + upstream-variable source that
  // TextField/TextareaField use; the button hides itself when there are no
  // upstream variables (e.g. trigger config). Setting a variable REPLACES the
  // single combobox value (it isn't a cursor insert) — the trigger then shows the
  // token via the raw-value fallback, and option selection / manual entry are
  // unaffected.
  const { sources, latestValuesBySource } = useActiveNodeUpstreamVariables();
  const showVariablePicker = field.allowManualEntry === true;
  const setToVariable = (token: string): void => {
    onChange(token);
    setSelectedSnapshot({ value: token, label: token });
    setOpen(false);
  };

  const renderList = (): React.ReactNode => {
    switch (state.status) {
      case "idle":
      case "loading":
        return (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            <span>Loading options…</span>
          </div>
        );
      case "ready":
        return (
          <>
            <CommandGroup>
              {state.items.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  onSelect={(val) => {
                    onChange(val);
                    setSelectedSnapshot(opt);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      opt.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{opt.label}</span>
                    {opt.description ? (
                      <span className="text-xs text-muted-foreground">
                        {opt.description}
                      </span>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {state.hasMore ? (
              <p className="px-2 py-2 text-[11px] text-muted-foreground">
                Showing first results. Refine search to narrow.
              </p>
            ) : null}
          </>
        );
      case "empty":
        return <CommandEmpty>No matches.</CommandEmpty>;
      case "error":
        return (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 px-2 py-3 text-xs text-destructive"
          >
            <span>{state.message}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-1.5 h-3 w-3" aria-hidden />
              Try again
            </Button>
          </div>
        );
      case "disconnected":
        // V2-READY-8: parity with `needs-reconnect` below. A disconnected /
        // not-connected provider now gets actionable guidance + a link to Apps
        // (not a full-page inline OAuth nav from the builder, which would drop
        // unsaved edits). We name ONLY the provider slug — never an account id,
        // integration id, provider-account, email, token, scope, or raw provider
        // error — so this arm carries no identifier leak.
        return (
          <div
            role="alert"
            data-testid="combobox-disconnected"
            className="flex flex-col items-start gap-2 px-2 py-3 text-xs text-muted-foreground"
          >
            <span>
              This {state.provider} connection is disconnected. Reconnect it from
              Apps to load options.
            </span>
            <a
              href={reconnectHrefForProvider(state.provider)}
              data-testid="combobox-disconnected-link"
              className="font-medium text-foreground underline underline-offset-2"
            >
              Reconnect {state.provider} in Apps
            </a>
          </div>
        );
      case "needs-reconnect":
        // Token rejected (auth/scope class) — point at Reconnect, not a bare
        // retry. Link to Apps (not inline OAuth) so unsaved builder edits survive.
        return (
          <div
            role="alert"
            data-testid="combobox-needs-reconnect"
            className="flex flex-col items-start gap-2 px-2 py-3 text-xs text-muted-foreground"
          >
            <span>{state.message}</span>
            <a
              href={reconnectHrefForProvider(state.provider)}
              data-testid="combobox-reconnect-link"
              className="font-medium text-foreground underline underline-offset-2"
            >
              Reconnect {state.provider} in Apps
            </a>
          </div>
        );
      case "owner-gated":
      case "owner-must-connect":
        // Owner-gated states are normally handled by the inline affordance
        // above (the popover never opens for them since its trigger is
        // disabled). This arm is a defensive fallback that keeps the switch
        // exhaustive; it carries no testid so the inline affordance is the
        // single rendered source.
        return (
          <div
            role="status"
            className="flex flex-col items-start gap-1 px-2 py-3 text-xs text-muted-foreground"
          >
            <span>{state.message}</span>
          </div>
        );
      default: {
        const _never: never = state;
        return _never;
      }
    }
  };

  // 4.TEAM-WORKFLOWS-4 (TW-3): owner-gated credential states render an INLINE,
  // disabled, lock-marked affordance (no popover, no retry) so the reason is
  // visible without a click. `owner-gated` (non-creator): the step runs under
  // the workflow owner's connection — only they configure it; we name the
  // PROVIDER only, never a personal label/email. `owner-must-connect` (the
  // creator hasn't connected): a connect call-to-action.
  if (state.status === "owner-gated" || state.status === "owner-must-connect") {
    const mustConnect = state.status === "owner-must-connect";
    return (
      <FieldShell
        controlId={controlId}
        label={field.label}
        required={field.required}
        description={field.description}
        error={error}
      >
        <Button
          id={controlId}
          type="button"
          variant="outline"
          disabled
          aria-disabled
          className="w-full justify-between font-normal text-muted-foreground"
        >
          <span className="flex items-center gap-2 truncate">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {mustConnect
              ? `Connect ${state.provider} to configure`
              : "Managed by the workflow owner"}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
        <p
          role="status"
          data-testid={
            mustConnect ? "combobox-owner-must-connect" : "combobox-owner-gated"
          }
          className="text-xs text-muted-foreground"
        >
          {state.message}
        </p>
        {/* REACT-AGENT-REVIEW-RECOVERY-MERGE-1 — the tray can now send a user straight here, so this
            state must not be a dead end. `owner-must-connect` is the CREATOR's own missing
            connection: they can fix it, so give them the account-scoped link. `owner-gated` is
            someone else's personal credential — there is no action this user can take, and we do
            NOT offer a retry or a link that would imply otherwise. */}
        {mustConnect ? (
          <a
            href={reconnectHrefForProvider(state.provider)}
            data-testid="combobox-owner-connect-link"
            className="text-xs font-medium text-foreground underline underline-offset-2"
          >
            Connect {state.provider} in Apps
          </a>
        ) : null}
      </FieldShell>
    );
  }

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      {/* SPREADSHEET-GUIDED-CONFIG-S3 — `min-w-0` on both the row and the
          trigger. A flex item's default `min-width: auto` is its CONTENT
          width, so a combobox showing a long workbook name refused to shrink
          and pushed the variable-picker button out of this row inside the
          builder's 331px overlay config sheet. The first responsive sweep of
          the guided panel measured that escape at every width from 360 to
          1600. `flex-1` allocates the space; `min-w-0` is what lets the
          allocation actually apply. The trigger already truncates its label. */}
      <div className="flex min-w-0 items-start gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={controlId}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            className="min-w-0 flex-1 justify-between font-normal"
          >
            <span className="min-w-0 truncate">{triggerLabel}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={field.placeholder ?? "Search..."}
              value={searchInput}
              onValueChange={setSearchInput}
            />
            <CommandList>
              {showManualEntry ? (
                <CommandGroup>
                  <CommandItem
                    value={`__manual_entry__:${manualValue}`}
                    data-testid="combobox-manual-entry"
                    onSelect={commitManualEntry}
                  >
                    <Check className="mr-2 h-4 w-4 opacity-0" />
                    <span>
                      Use this ID: <span className="font-medium">{manualValue}</span>
                    </span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
              {renderList()}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {showVariablePicker ? (
        <VariablePickerButton
          sources={sources}
          onInsertAtCursor={setToVariable}
          ariaLabel={`Insert variable into ${field.label}`}
          testIdRoot={`combobox-${field.name}-picker`}
          latestValuesBySource={latestValuesBySource}
        />
      ) : null}
      </div>
      {savedValueMissingFromList ? (
        <p
          role="status"
          data-testid="combobox-saved-value-missing"
          className="text-xs text-muted-foreground"
        >
          Saved value <span className="font-mono">{value}</span> isn&rsquo;t in
          the current list — it may have been deleted, renamed, or be further
          down. It stays saved unless you pick something else.
        </p>
      ) : null}
      {error ? null : (
        <FieldSetupHint
          state={classifyConfigFieldValue({ value, required: field.required })}
          fieldLabel={field.label}
          sourceLabel={describePrefillSource({ value, sources })}
        />
      )}
    </FieldShell>
  );
};

export const ComboboxField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
  deps,
  enabled,
  parentLabel,
}) => {
  const stringValue = typeof value === "string" ? value : "";
  const controlId = `field-${field.name}`;
  const [open, setOpen] = React.useState(false);

  if (field.multiple) {
    // CONFIG-UX-AUDIT-1 — multi-select is real now. MultiOptionsField
    // handles both static `options` and async `optionsSource` paths and
    // writes `string[]`.
    return <MultiOptionsField {...{ field, value, error, onChange, disabled, deps, enabled, parentLabel }} />;
  }

  // Async path — meta declared `optionsSource`. The static-options
  // branch and the async branch never coexist (the contract's
  // `superRefine` rejects metas declaring both).
  if (field.optionsSource) {
    // dependsOn cascade — Slice 3.33; multi-parent in
    // Slice 4.BUILDER-OPTIONS-1. When SchemaForm signals
    // `enabled === false` AND the meta declares one or more `dependsOn`
    // parents, render a passive "Select <parentLabel> first" trigger and
    // don't mount the async body (so the hook never fires). `parentLabel`
    // is supplied by SchemaForm (the still-missing parent labels, joined);
    // the normalize fallback keeps this safe if it's ever omitted.
    const dependsOnNames = normalizeDependsOn(field.dependsOn);
    if (enabled === false && dependsOnNames.length > 0) {
      const parentHint = parentLabel ?? dependsOnNames.join(", ");
      return (
        <FieldShell
          controlId={controlId}
          label={field.label}
          required={field.required}
          description={field.description}
          error={error}
        >
          <Button
            id={controlId}
            type="button"
            variant="outline"
            disabled
            aria-disabled
            data-testid="combobox-parent-missing"
            className="w-full justify-between font-normal text-muted-foreground"
          >
            <span>{`Select ${parentHint} first`}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </FieldShell>
      );
    }
    return (
      <AsyncComboboxBody
        controlId={controlId}
        field={field}
        value={stringValue}
        onChange={(next) => onChange(next)}
        error={error}
        disabled={disabled}
        deps={deps}
      />
    );
  }

  if (!field.options || field.options.length === 0) {
    return (
      <FieldShell
        controlId={controlId}
        label={field.label}
        required={field.required}
        description={field.description}
        error="The choices for this field aren't available right now. Try reopening this step, or contact support if it keeps happening."
      >
        <Button variant="outline" disabled className="w-full justify-between">
          —
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </FieldShell>
    );
  }

  const options = field.options;
  const selected = options.find((o) => o.value === stringValue);

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={controlId}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            {selected ? selected.label : (field.placeholder ?? "Choose...")}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <Command>
            <CommandInput placeholder={field.placeholder ?? "Search..."} />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={(val) => {
                      onChange(val);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        opt.value === stringValue ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error ? null : (
        <FieldSetupHint
          state={classifyConfigFieldValue({ value: stringValue, required: field.required })}
          fieldLabel={field.label}
        />
      )}
    </FieldShell>
  );
};
