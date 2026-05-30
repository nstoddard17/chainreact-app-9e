/**
 * Route-safe contract for the marketing LogoMarquee
 * (Slice 4.HOMEPAGE-V2-1).
 *
 * Provider details are resolved server-side via `@/integrations/_registry`
 * inside the route shell (`app/page.tsx`) — features/ may not import from
 * integrations/ per the project structure rules. The marquee component
 * receives this typed shape as a prop.
 */
export interface MarketingMarqueeProvider {
  readonly id: string;
  readonly label: string;
  readonly iconUrl: string | null;
}
