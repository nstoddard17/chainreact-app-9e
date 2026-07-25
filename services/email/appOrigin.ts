/**
 * Canonical public app origin for links embedded in system email
 * (TEAM-INVITATION-EMAIL-1).
 *
 * Same contract as the billing redirect bases: the origin comes from
 * `NEXT_PUBLIC_APP_URL` — never `request.url`, never a Host/Origin header,
 * never client input — so a proxied or spoofed request can't steer an emailed
 * link to an attacker host. Local default matches the dev server.
 */
export function publicAppOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
