"use client";

import { useState } from "react";
import type { MachineCredentialDto } from "@/lib/api/machineCredentials";
import { MachineCredentialForm, type MachineEnvironmentOption } from "./MachineCredentialForm";
import { MachineCredentialConnectedCard } from "./MachineCredentialConnectedCard";

/**
 * Provider-neutral panel that orchestrates the machine-credential connection
 * lifecycle: shows the connect FORM when nothing is connected, and the
 * secret-free CONNECTED CARD (with rotate + disconnect) once a credential exists.
 * Drop it into any `machine_credentials` provider's Apps detail surface — the
 * provider id + environments + initial DTO are props, nothing is ADP-specific.
 */
interface Props {
  provider: string;
  providerDisplayName: string;
  environments: readonly MachineEnvironmentOption[];
  /** The already-connected credential (safe DTO), or null when not connected. */
  initialCredential?: MachineCredentialDto | null;
}

export function MachineCredentialPanel({
  provider,
  providerDisplayName,
  environments,
  initialCredential = null,
}: Props) {
  const [credential, setCredential] = useState<MachineCredentialDto | null>(initialCredential);

  return (
    <section data-testid="mc-panel" className="flex flex-col gap-3">
      <header>
        <h2 className="text-sm font-semibold">{providerDisplayName}</h2>
        <p className="text-xs text-muted-foreground">
          {credential
            ? "This connection is active."
            : "Connect with your client credentials and certificate."}
        </p>
      </header>

      {credential ? (
        <MachineCredentialConnectedCard
          provider={provider}
          credential={credential}
          environments={environments}
          onRotated={setCredential}
          onDisconnected={() => setCredential(null)}
        />
      ) : (
        <MachineCredentialForm
          provider={provider}
          environments={environments}
          onConnected={setCredential}
        />
      )}
    </section>
  );
}
