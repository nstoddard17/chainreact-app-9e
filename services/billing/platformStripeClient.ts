import {
  STRIPE_API_VERSION,
  stripeApiBase,
} from "@/integrations/_shared/stripe/api/_base";
import { surfaceStripeError } from "@/integrations/_shared/stripe/errors";
import { flattenForStripe } from "@/integrations/_shared/stripe/flattenForStripe";

/**
 * PLATFORM Stripe client (Slice 4.BILLING-PLAN-METADATA-3 / CS-2).
 *
 * This is ChainReact's OWN billing Stripe account — entirely separate from the WORKFLOW
 * Stripe provider in `integrations/stripe/`. The workflow provider authenticates with a
 * per-merchant connected-account OAuth token (`integrations.access_token_encrypted`) to
 * act on the END USER's Stripe account. THIS client authenticates with the platform
 * secret key (`STRIPE_SECRET_KEY`) to manage ChainReact's subscriptions/customers. The
 * two must never be conflated: this file does not import or reuse the provider's
 * `stripeRequest` (whose 401 → OAuth-refresh semantics are wrong for platform billing).
 *
 * SERVER-ONLY. The secret key must never reach the browser. There is no `server-only`
 * package in V2, so — like `repositories/supabase/serviceRoleClient.ts` — we guard with
 * a `typeof window` check and never expose the key as a property (it is captured in the
 * request closure). No `"use client"` file may import this module.
 *
 * LAZY. Per the V2 lazy-client rule, nothing is read or constructed at module load
 * (module-level `new Stripe()` / env reads break `next build` in CI when keys are
 * absent). The key is resolved only when `getPlatformStripeClient()` /
 * `getPlatformStripeSecretKey()` is actually called.
 *
 * SCOPE (CS-2): this is the client FOUNDATION only. The generic `request` method is the
 * plumbing later slices build on; CS-2 wires NO checkout, portal, or webhook call sites.
 */

/** Env var holding the platform Stripe secret key. */
export const PLATFORM_STRIPE_SECRET_ENV = "STRIPE_SECRET_KEY";

/**
 * Thrown when platform billing code tries to use Stripe but `STRIPE_SECRET_KEY` is not
 * configured. A typed, generic config error (never echoes the env value) so callers /
 * routes can map it to a clean 5xx without leaking detail.
 */
export class PlatformStripeConfigError extends Error {
  readonly code = "PLATFORM_STRIPE_NOT_CONFIGURED";
  constructor(message: string) {
    super(message);
    this.name = "PlatformStripeConfigError";
  }
}

/**
 * Lazily resolve the platform Stripe secret key. Server-only.
 * Throws {@link PlatformStripeConfigError} when the key is missing/blank — never at
 * import, only when invoked.
 */
export function getPlatformStripeSecretKey(): string {
  if (typeof window !== "undefined") {
    throw new Error(
      "getPlatformStripeSecretKey: platform Stripe is server-only and must not run in the browser.",
    );
  }
  const key = process.env[PLATFORM_STRIPE_SECRET_ENV]?.trim();
  if (!key) {
    throw new PlatformStripeConfigError(
      `${PLATFORM_STRIPE_SECRET_ENV} is not set — platform billing is not configured.`,
    );
  }
  return key;
}

export interface PlatformStripeRequest {
  method: "GET" | "POST" | "DELETE";
  /** Path relative to the Stripe API base, e.g. `/v1/checkout/sessions`. */
  path: string;
  /** Optional query params appended to the URL. */
  query?: URLSearchParams;
  /** Optional body — flattened to Stripe bracket notation + form-encoded. */
  body?: Readonly<Record<string, unknown>>;
  /** Optional `Idempotency-Key` header (Stripe's 24-hour dedup window). */
  idempotencyKey?: string;
}

export interface PlatformStripeClient {
  readonly apiBase: string;
  readonly apiVersion: string;
  /**
   * Authenticated platform Stripe REST call. The secret key is held in the closure and
   * never exposed on the client object. Non-2xx responses throw a generic
   * `Error` with the Stripe envelope's message surfaced (no secret echoed).
   */
  request<T>(input: PlatformStripeRequest): Promise<T>;
}

/**
 * Build the lazy platform Stripe client. Resolves the secret key on call (throws
 * {@link PlatformStripeConfigError} if unset) and returns a thin REST client that
 * reuses the shared Stripe base URL + pinned API version + error surfacing.
 *
 * NOTE: the returned object exposes only `apiBase` / `apiVersion` / `request` — the
 * secret key is captured privately and is never a property.
 */
export function getPlatformStripeClient(): PlatformStripeClient {
  const secretKey = getPlatformStripeSecretKey();
  const apiBase = stripeApiBase();

  return {
    apiBase,
    apiVersion: STRIPE_API_VERSION,
    async request<T>(input: PlatformStripeRequest): Promise<T> {
      const queryString = input.query ? input.query.toString() : "";
      const url = `${apiBase}${input.path}${queryString ? `?${queryString}` : ""}`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${secretKey}`,
        "Stripe-Version": STRIPE_API_VERSION,
      };

      let bodyString: string | undefined;
      if (input.body !== undefined) {
        const flat = flattenForStripe(input.body);
        if (Object.keys(flat).length > 0) {
          headers["Content-Type"] = "application/x-www-form-urlencoded";
          bodyString = new URLSearchParams(flat).toString();
        }
      }
      if (input.idempotencyKey) {
        headers["Idempotency-Key"] = input.idempotencyKey;
      }

      const res = await fetch(url, {
        method: input.method,
        headers,
        body: bodyString,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Platform Stripe ${input.method} ${input.path} failed: ${surfaceStripeError(text, res.status)}`,
        );
      }

      return (await res.json()) as T;
    },
  };
}
