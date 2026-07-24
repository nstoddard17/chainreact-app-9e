"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CredentialPasteApiError,
  submitProviderCredentials,
} from "@/lib/api/credentialPaste";

/**
 * Provider-neutral credential-paste connect form (FLEETIO-1).
 *
 * Renders the fields a `credential_paste` provider declared in its manifest's
 * `credentialFields` — NOTHING here is hardcoded to any provider. The server
 * page (`app/integrations/credential-paste/[provider]/page.tsx`) resolves the
 * manifest and passes only serializable, non-secret metadata down.
 *
 * Secret handling (mirrors the token-paste page's rules):
 *   - values live ONLY in component state and the single POST body — never in
 *     localStorage/sessionStorage, never in a Zustand store, never logged;
 *   - secret fields render as password inputs with an explicit reveal toggle;
 *   - on success the state is cleared before navigating away;
 *   - an invalid-credential error keeps the guide + labels intact (non-secret
 *     context survives) — only the problem is surfaced.
 *
 * Boundary: component → typed client API (`lib/api/credentialPaste`) → route.
 * No imports from services/ or repositories/ (client-server boundary test).
 */

export interface CredentialPasteFieldMeta {
  id: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
  help?: string;
}

export interface CredentialPasteGuideMeta {
  intro: string;
  steps: readonly string[];
  note?: string;
}

interface Props {
  provider: string;
  displayName: string;
  fields: readonly CredentialPasteFieldMeta[];
  guide?: CredentialPasteGuideMeta;
  /** Single-use signed state minted by the connect route. */
  state: string | null;
}

function navigateTo(path: string): void {
  if (typeof window === "undefined") return;
  window.location.replace(path);
}

/** Humanize the route's safe error codes for a non-technical user. */
function humanizeError(err: unknown, displayName: string): string {
  if (err instanceof CredentialPasteApiError) {
    if (err.status === 502) {
      return `${displayName} couldn't be reached right now. Your details were not saved — please try again in a moment.`;
    }
    if (err.message === "invalid state") {
      return "This connection link has expired. Please start again from the Apps page.";
    }
    // 400 verification reasons are already safe, human-readable sentences.
    if (err.status === 400) return `That didn't work: ${err.message}.`;
    return "Something went wrong finishing the connection. Please try again.";
  }
  return "Network error. Please check your connection and try again.";
}

export function CredentialPasteForm({ provider, displayName, fields, guide, state }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingRequired = fields.some(
    (f) => f.required && !(values[f.id] ?? "").trim(),
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!state) {
      setError("This connection link is incomplete. Please start again from the Apps page.");
      return;
    }
    if (missingRequired) {
      setError("Fill in every required field to continue.");
      return;
    }

    const credentials: Record<string, string> = {};
    for (const f of fields) {
      const v = (values[f.id] ?? "").trim();
      if (v) credentials[f.id] = v;
    }

    setSubmitting(true);
    try {
      const { redirect } = await submitProviderCredentials(provider, {
        state,
        credentials,
      });
      // Clear secrets from state before navigating away.
      setValues({});
      navigateTo(redirect ?? "/apps?integration=connected");
      return;
    } catch (err) {
      setError(humanizeError(err, displayName));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-foreground">
        Connect {displayName}
      </h1>
      {guide && (
        <div className="rounded border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <p>{guide.intro}</p>
          {guide.steps.length > 0 && (
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {guide.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
          {guide.note && <p className="mt-2 text-xs">{guide.note}</p>}
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        These values are sent once to finish connecting and are stored
        encrypted — they are never shown again.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {fields.map((f) => (
          <div key={f.id} className="flex flex-col gap-1.5">
            <Label htmlFor={`credential-${f.id}`}>
              {f.label}
              {f.required ? " *" : ""}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={`credential-${f.id}`}
                name={f.id}
                type={f.secret && !revealed[f.id] ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                value={values[f.id] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [f.id]: e.target.value }))
                }
                placeholder={f.placeholder}
                disabled={submitting}
                data-testid={`credential-input-${f.id}`}
                className="font-mono"
              />
              {f.secret && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={submitting}
                  aria-label={revealed[f.id] ? `Hide ${f.label}` : `Show ${f.label}`}
                  data-testid={`credential-reveal-${f.id}`}
                  onClick={() =>
                    setRevealed((prev) => ({ ...prev, [f.id]: !prev[f.id] }))
                  }
                >
                  {revealed[f.id] ? "Hide" : "Show"}
                </Button>
              )}
            </div>
            {f.help && (
              <span className="text-xs text-muted-foreground">{f.help}</span>
            )}
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={submitting || missingRequired}
            data-testid="credential-paste-submit"
          >
            {submitting ? "Verifying…" : `Connect ${displayName}`}
          </Button>
          <Button asChild variant="outline" disabled={submitting}>
            <a href="/apps">Cancel</a>
          </Button>
        </div>
      </form>
    </div>
  );
}
