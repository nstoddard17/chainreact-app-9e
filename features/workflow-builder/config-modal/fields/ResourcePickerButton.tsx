"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { fetchPickerSession } from "@/lib/api/pickerSession";
import type { PickerSessionErrorCode } from "@/lib/api/pickerSession";
import { openResourcePicker } from "./googlePickerLoader";
import type { FieldResourcePicker } from "@/contracts/actionMeta";

/**
 * "Choose from Google Drive" button (GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2).
 *
 * Replaces a resolver-backed dropdown for provider resources whose enumeration
 * would otherwise require a restricted whole-corpus scope. The user picks in
 * Google's own UI; the selection IS the per-file authorization grant, and the
 * stable resource id is committed to the field exactly as before.
 *
 * Failure states follow the option-source recovery contract's spirit — say what
 * happened and offer the recovery that state actually supports — and never
 * strand the field: the text input beside this button always remains usable, so
 * a known id can still be pasted or mapped from an upstream step.
 *
 * SECURITY: the session token lives in a local variable inside the click
 * handler for the lifetime of the picker only. It is never placed in component
 * state, storage, a URL, or a log.
 */

const PICKER_TITLE: Readonly<Record<FieldResourcePicker, string>> = {
  "google-sheets:spreadsheet": "Select a spreadsheet",
};

function recoveryMessage(code: PickerSessionErrorCode, message: string): string {
  switch (code) {
    case "INTEGRATION_NOT_CONNECTED":
      return "Connect your Google Sheets account in Apps, then choose a file.";
    case "PROVIDER_REAUTH_REQUIRED":
      return "Reconnect your Google Sheets account in Apps, then choose a file.";
    case "NOT_WORKFLOW_OWNER":
      return "This step uses the workflow owner's connection. Ask them to choose the file.";
    case "PICKER_NOT_CONFIGURED":
      return "File picking isn't set up for this environment — paste the ID instead.";
    case "UNAUTHENTICATED":
      return "Your session expired. Refresh the page and try again.";
    default:
      return message;
  }
}

export const ResourcePickerButton: React.FC<{
  picker: FieldResourcePicker;
  fieldLabel: string;
  fieldName: string;
  workflowId?: string | undefined;
  nodeId?: string | undefined;
  disabled?: boolean | undefined;
  onPicked: (resourceId: string) => void;
}> = ({ picker, fieldLabel, fieldName, workflowId, nodeId, disabled, onPicked }) => {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const session = await fetchPickerSession({
        picker,
        workflowId: workflowId ?? null,
        nodeId: nodeId ?? null,
      });
      if (!session.ok) {
        setError(recoveryMessage(session.code, session.message));
        return;
      }
      const picked = await openResourcePicker({
        accessToken: session.accessToken,
        appId: session.appId,
        apiKey: session.apiKey,
        mimeType: session.mimeType,
        title: PICKER_TITLE[picker],
      });
      // Cancel is not an error — leave the current value untouched.
      if (picked) onPicked(picked.id);
    } catch {
      setError("Couldn't open the Google picker. Try again, or paste the ID.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        onClick={() => void handleClick()}
        data-testid={`resource-picker-${fieldName}`}
        aria-label={`Choose ${fieldLabel} from Google Drive`}
      >
        {busy ? "Opening…" : "Choose from Google Drive"}
      </Button>
      {error ? (
        <p
          role="status"
          className="mt-1 text-xs text-warning-foreground"
          data-testid={`resource-picker-${fieldName}-error`}
        >
          {error}
        </p>
      ) : null}
    </>
  );
};
