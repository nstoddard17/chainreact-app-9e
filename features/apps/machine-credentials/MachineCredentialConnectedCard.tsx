"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  disconnectMachineCredential,
  MachineCredentialApiError,
  type MachineCredentialDto,
} from "@/lib/api/machineCredentials";
import { machineCredentialErrorCopy } from "./errorCopy";
import { MachineCredentialForm, type MachineEnvironmentOption } from "./MachineCredentialForm";

/**
 * Connected-state view for a machine credential. Shows ONLY safe, non-secret
 * metadata (environment, certificate subject/fingerprint, expiry, created +
 * rotated dates) — never the client secret, private key, cert body, or token.
 * Supports Replace/rotate (re-renders the generic form) and Disconnect with an
 * inline confirmation. Provider-neutral.
 */

interface Props {
  provider: string;
  credential: MachineCredentialDto;
  environments: readonly MachineEnvironmentOption[];
  onRotated: (dto: MachineCredentialDto) => void;
  onDisconnected: () => void;
}

function envLabel(
  credential: MachineCredentialDto,
  environments: readonly MachineEnvironmentOption[],
): string {
  const value = (credential.metadata?.environment as string | undefined) ?? "";
  return environments.find((e) => e.value === value)?.label ?? value ?? "—";
}

export function MachineCredentialConnectedCard({
  provider,
  credential,
  environments,
  onRotated,
  onDisconnected,
}: Props) {
  const [mode, setMode] = useState<"view" | "rotate" | "confirm">("view");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDisconnect() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await disconnectMachineCredential(provider);
      onDisconnected();
    } catch (err) {
      setError(
        machineCredentialErrorCopy(
          err instanceof MachineCredentialApiError ? err.code : "disconnect_failed",
        ),
      );
      setPending(false);
    }
  }

  if (mode === "rotate") {
    return (
      <div data-testid="mc-rotate" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Replace credentials</h3>
        <p className="text-xs text-muted-foreground">
          Enter the new client secret and certificate. The current connection stays
          active until you save.
        </p>
        <MachineCredentialForm
          provider={provider}
          environments={environments}
          submitLabel="Save new credentials"
          onCancel={() => setMode("view")}
          onConnected={(dto) => {
            setMode("view");
            onRotated(dto);
          }}
        />
      </div>
    );
  }

  return (
    <div data-testid="mc-connected" className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Environment</dt>
        <dd data-testid="mc-connected-env">{envLabel(credential, environments)}</dd>

        <dt className="text-muted-foreground">Certificate</dt>
        <dd data-testid="mc-connected-subject">{credential.certSubject ?? "—"}</dd>

        <dt className="text-muted-foreground">Fingerprint</dt>
        <dd className="break-all">{credential.certFingerprint256}</dd>

        <dt className="text-muted-foreground">Expires</dt>
        <dd className="flex items-center gap-2" data-testid="mc-connected-expiry">
          {new Date(credential.certNotAfter).toLocaleDateString()}
          {credential.certExpired ? (
            <Badge variant="destructive" data-testid="mc-badge-expired">
              Expired
            </Badge>
          ) : credential.certExpiringSoon ? (
            <Badge variant="secondary" data-testid="mc-badge-expiring">
              Expiring soon
            </Badge>
          ) : null}
        </dd>

        <dt className="text-muted-foreground">Connected</dt>
        <dd>{new Date(credential.createdAt).toLocaleDateString()}</dd>

        <dt className="text-muted-foreground">Last rotated</dt>
        <dd data-testid="mc-connected-rotated">
          {credential.rotatedAt ? new Date(credential.rotatedAt).toLocaleDateString() : "Never"}
        </dd>
      </dl>

      {error && (
        <p role="alert" data-testid="mc-error" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {mode === "confirm" ? (
        <div data-testid="mc-confirm" className="rounded-md border border-border p-2">
          <p className="text-xs">
            Disconnect this connection? Workflows that depend on it will stop working
            until you reconnect.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setMode("view")}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={confirmDisconnect}
              data-testid="mc-confirm-disconnect"
            >
              {pending ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMode("rotate")}
            data-testid="mc-rotate-open"
          >
            Replace / rotate
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setMode("confirm")}
            data-testid="mc-disconnect-open"
          >
            Disconnect
          </Button>
        </div>
      )}
    </div>
  );
}
