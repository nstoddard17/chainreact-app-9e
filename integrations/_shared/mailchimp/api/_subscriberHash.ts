import { createHash } from "node:crypto";

/**
 * Mailchimp subscriber-hash helper.
 *
 * Slice 14 Commit 2. Mailchimp's subscriber endpoints
 * (`PUT/PATCH/DELETE/GET /lists/{audienceId}/members/{subscriberHash}`)
 * key on the **lowercased-email MD5 hash**, not on the email itself
 * or on an opaque numeric id. Per current Mailchimp Marketing API
 * docs (matches V1's [`addSubscriber.ts:102`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addSubscriber.ts#L102)
 * and every other V1 subscriber action), the hash is:
 *
 *   md5(lowercase(email)) → hex
 *
 * Centralized here so action handlers (Slice 14 Commit 3) don't
 * each re-derive the recipe. The lowercasing step is mandatory —
 * Mailchimp normalizes email to lowercase before storing, and
 * `subscriberHash("User@Example.COM")` must produce the same hash
 * as `subscriberHash("user@example.com")` for the endpoint to
 * resolve the same record.
 *
 * MD5 is used here as a **non-cryptographic identifier**. It's the
 * fixed Mailchimp wire-format requirement, NOT a security primitive.
 * No PII protection is implied by the hashing — the underlying email
 * is recoverable by the API. The function name avoids any
 * "secure-hash" connotation.
 *
 * Throws on empty / non-string input — passing a missing or malformed
 * email would silently yield the MD5 of empty string and resolve to
 * an unintended record / a 404. Fail loud.
 */
export function subscriberHash(email: string): string {
  if (typeof email !== "string" || email.trim().length === 0) {
    throw new Error("subscriberHash: email must be a non-empty string.");
  }
  return createHash("md5").update(email.toLowerCase()).digest("hex");
}
