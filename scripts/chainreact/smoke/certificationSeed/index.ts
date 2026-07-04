/**
 * Action smoke harness — Provider Action CERTIFICATION matrix SEED DATA.
 *
 * The durable, version-controlled list of which provider/action smoke fixtures
 * have passed LIVE verification, split into PROVIDER-SCOPED modules (the
 * monolithic certificationSeed.ts outgrew the max-lines cap). This barrel
 * preserves the original import surface: `import { CERTIFICATIONS } from
 * "./certificationSeed"` resolves here, and certification.ts re-exports it
 * unchanged.
 *
 * SAFETY — this is a committed artifact, so it holds SAFE FACTS ONLY: the
 * provider/action key, a status enum, an optional ISO date / git short-commit,
 * and an optional SHORT sanitized note. It MUST NEVER contain secrets, tokens,
 * selector values, account/run/workflow ids, provider payloads, message/cell
 * bodies, records, or PII. A unit test guards this.
 *
 * Pure + dependency-free (type-only imports; no runtime import cycle).
 */
import type { CertificationRecord } from "../certification";
import { SLACK_CERTIFICATIONS } from "./slack";
import { GMAIL_CERTIFICATIONS } from "./gmail";
import { HUBSPOT_CERTIFICATIONS } from "./hubspot";
import { MONDAY_CERTIFICATIONS } from "./monday";
import { NOTION_CERTIFICATIONS } from "./notion";
import { MAILCHIMP_CERTIFICATIONS } from "./mailchimp";
import { MICROSOFT_CERTIFICATIONS } from "./microsoft";
import { GOOGLE_CERTIFICATIONS } from "./google";
import { SHOPIFY_CERTIFICATIONS } from "./shopify";
import { GITHUB_CERTIFICATIONS } from "./github";
import { OTHER_CERTIFICATIONS } from "./other";

export const CERTIFICATIONS: readonly CertificationRecord[] = [
  ...SLACK_CERTIFICATIONS,
  ...GMAIL_CERTIFICATIONS,
  ...HUBSPOT_CERTIFICATIONS,
  ...MONDAY_CERTIFICATIONS,
  ...NOTION_CERTIFICATIONS,
  ...MAILCHIMP_CERTIFICATIONS,
  ...MICROSOFT_CERTIFICATIONS,
  ...GOOGLE_CERTIFICATIONS,
  ...SHOPIFY_CERTIFICATIONS,
  ...GITHUB_CERTIFICATIONS,
  ...OTHER_CERTIFICATIONS,
];
