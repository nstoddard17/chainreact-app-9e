"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  validateMachineCertificate,
  connectMachineCredential,
  MachineCredentialApiError,
  type MachineCredentialDto,
  type MachineCertValidation,
} from "@/lib/api/machineCredentials";
import { machineCredentialErrorCopy } from "./errorCopy";

/**
 * Provider-neutral machine-credential (client_credentials + mTLS) connect / rotate
 * form. Reusable by ANY `machine_credentials` provider — the provider id +
 * environments are props, nothing is hard-coded to ADP.
 *
 * Captures: environment · client id · client secret · client certificate ·
 * private key (paste or file upload). Offers a pre-submit "Validate certificate"
 * (server-side X.509 parse/expiry/key-pair check returning only SAFE metadata),
 * shows clear errors without exposing secret material, and submits to the connect
 * route. Secret fields are NEVER rehydrated: on success they are cleared and the
 * parent swaps in the connected-state card.
 */

export interface MachineEnvironmentOption {
  value: string;
  label: string;
}

interface Props {
  provider: string;
  environments: readonly MachineEnvironmentOption[];
  /** Label for the primary button (e.g. "Connect" or "Save new credentials"). */
  submitLabel?: string;
  onConnected: (dto: MachineCredentialDto) => void;
  onCancel?: () => void;
}

async function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsText(file);
  });
}

export function MachineCredentialForm({
  provider,
  environments,
  submitLabel = "Connect",
  onConnected,
  onCancel,
}: Props) {
  const [environment, setEnvironment] = useState(environments[0]?.value ?? "");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [certPem, setCertPem] = useState("");
  const [keyPem, setKeyPem] = useState("");
  const [validation, setValidation] = useState<MachineCertValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allFilled =
    environment.trim() &&
    clientId.trim() &&
    clientSecret.trim() &&
    certPem.trim() &&
    keyPem.trim();

  async function onUpload(
    e: ChangeEvent<HTMLInputElement>,
    set: (v: string) => void,
  ): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      set(await readFileText(file));
      setValidation(null);
    } catch {
      setError("Couldn't read that file. Paste the PEM instead.");
    }
  }

  async function onValidate() {
    if (!certPem.trim() || !keyPem.trim()) {
      setError("Add both the certificate and the private key to validate.");
      return;
    }
    setValidating(true);
    setError(null);
    try {
      const result = await validateMachineCertificate(provider, { certPem, keyPem });
      setValidation(result);
      if (!result.ok && result.code) setError(machineCredentialErrorCopy(result.code));
    } catch (err) {
      setError(
        machineCredentialErrorCopy(
          err instanceof MachineCredentialApiError ? err.code : undefined,
        ),
      );
    } finally {
      setValidating(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || !allFilled) return;
    setPending(true);
    setError(null);
    try {
      const dto = await connectMachineCredential(provider, {
        clientId,
        clientSecret,
        certPem,
        keyPem,
        environment,
      });
      // Secret fields are never rehydrated — clear them immediately on success.
      setClientSecret("");
      setKeyPem("");
      onConnected(dto);
    } catch (err) {
      setError(
        machineCredentialErrorCopy(
          err instanceof MachineCredentialApiError ? err.code : undefined,
        ),
      );
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="mc-form">
      <div className="flex flex-col gap-1">
        <Label htmlFor="mc-env">Environment</Label>
        <select
          id="mc-env"
          data-testid="mc-env"
          value={environment}
          onChange={(e) => setEnvironment(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {environments.map((env) => (
            <option key={env.value} value={env.value}>
              {env.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="mc-client-id">Client ID</Label>
        <Input
          id="mc-client-id"
          data-testid="mc-client-id"
          value={clientId}
          autoComplete="off"
          onChange={(e) => setClientId(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="mc-client-secret">Client secret</Label>
        <Input
          id="mc-client-secret"
          data-testid="mc-client-secret"
          type="password"
          value={clientSecret}
          autoComplete="off"
          onChange={(e) => setClientSecret(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="mc-cert">Client certificate (PEM)</Label>
          <input
            type="file"
            data-testid="mc-cert-file"
            accept=".pem,.crt,.cer"
            className="text-xs"
            onChange={(e) => void onUpload(e, setCertPem)}
          />
        </div>
        <Textarea
          id="mc-cert"
          data-testid="mc-cert"
          rows={4}
          value={certPem}
          spellCheck={false}
          placeholder="-----BEGIN CERTIFICATE-----"
          onChange={(e) => {
            setCertPem(e.target.value);
            setValidation(null);
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="mc-key">Private key (PEM)</Label>
          <input
            type="file"
            data-testid="mc-key-file"
            accept=".pem,.key"
            className="text-xs"
            onChange={(e) => void onUpload(e, setKeyPem)}
          />
        </div>
        <Textarea
          id="mc-key"
          data-testid="mc-key"
          rows={4}
          value={keyPem}
          spellCheck={false}
          placeholder="-----BEGIN PRIVATE KEY-----"
          onChange={(e) => {
            setKeyPem(e.target.value);
            setValidation(null);
          }}
        />
        <p className="text-xs text-muted-foreground">
          The private key is encrypted at rest and never shown again after you save.
        </p>
      </div>

      {validation?.cert && (
        <div
          data-testid="mc-cert-details"
          className="rounded-md border border-border bg-muted/40 p-2 text-xs"
        >
          <p>
            <span className="text-muted-foreground">Subject:</span>{" "}
            <span data-testid="mc-cert-subject">{validation.cert.subject}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Fingerprint:</span>{" "}
            {validation.cert.fingerprint256}
          </p>
          <p>
            <span className="text-muted-foreground">Expires:</span>{" "}
            {new Date(validation.cert.validTo).toLocaleDateString()}
          </p>
          <p
            data-testid="mc-cert-verdict"
            className={validation.ok ? "text-foreground" : "text-destructive"}
          >
            {validation.ok
              ? "Certificate and key are valid."
              : validation.cert.expired
                ? "Certificate has expired."
                : validation.cert.notYetValid
                  ? "Certificate is not valid yet."
                  : !validation.cert.keyMatches
                    ? "Private key does not match the certificate."
                    : "Certificate is not usable."}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" data-testid="mc-error" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={validating || !certPem.trim() || !keyPem.trim()}
          onClick={onValidate}
          data-testid="mc-validate"
        >
          {validating ? "Validating…" : "Validate certificate"}
        </Button>
        <Button type="submit" size="sm" disabled={pending || !allFilled} data-testid="mc-submit">
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
