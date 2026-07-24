import { getProvider } from "@/integrations/_registry";
import {
  CredentialPasteForm,
  type CredentialPasteFieldMeta,
} from "@/features/apps/credential-paste/CredentialPasteForm";

/**
 * Credential-paste connect page (FLEETIO-1 — `credential_paste` providers).
 *
 * SERVER component: resolves the provider's manifest, refuses providers that
 * don't use the credential-paste flow, and hands ONLY serializable non-secret
 * field metadata (ids/labels/help) to the shared client form. The single-use
 * `state` (minted by the connect route) arrives as a search param — it is a
 * signed nonce, not a secret credential.
 *
 * Unlike the token-INGEST page there is no URL fragment to scrub: no secret
 * ever appears in this page's URL. The credentials exist only inside the
 * client form's state and its one POST to
 * `/api/integrations/oauth/<provider>/credential-ingest`.
 */

interface PageProps {
  params: Promise<{ provider: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CredentialPastePage({ params, searchParams }: PageProps) {
  const { provider } = await params;
  const search = await searchParams;
  const stateParam = search.state;
  const state = typeof stateParam === "string" && stateParam.length > 0 ? stateParam : null;

  const manifest = getProvider(provider);
  if (
    !manifest ||
    !manifest.isEnabled ||
    manifest.authFlow !== "credential_paste" ||
    !manifest.credentialFields ||
    manifest.credentialFields.length === 0
  ) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-lg font-semibold text-foreground">Connection unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This app doesn&apos;t connect with pasted credentials. Please start from the{" "}
          <a href="/apps" className="underline">
            Apps page
          </a>
          .
        </p>
      </main>
    );
  }

  const fields: CredentialPasteFieldMeta[] = manifest.credentialFields.map((f) => ({
    id: f.id,
    label: f.label,
    secret: f.secret,
    required: f.required,
    ...(f.placeholder !== undefined ? { placeholder: f.placeholder } : {}),
    ...(f.help !== undefined ? { help: f.help } : {}),
  }));

  return (
    <main>
      <CredentialPasteForm
        provider={manifest.id}
        displayName={manifest.displayName}
        fields={fields}
        {...(manifest.credentialGuide !== undefined
          ? {
              guide: {
                intro: manifest.credentialGuide.intro,
                steps: manifest.credentialGuide.steps,
                ...(manifest.credentialGuide.note !== undefined
                  ? { note: manifest.credentialGuide.note }
                  : {}),
              },
            }
          : {})}
        state={state}
      />
    </main>
  );
}
