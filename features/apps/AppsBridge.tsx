import Link from "next/link";

/**
 * Apps-page "Bridge" panel (APPS-VL-DESIGN-1).
 *
 * The design treats Motive⇄Fleetio not as a 35th app but as a *relationship*
 * between two connected apps: the same trucks described twice. This panel is the
 * at-a-glance summary of how far that pairing has progressed, sitting between the
 * stat cards and the app list.
 *
 * Pure presentation. Every number is server-derived from real links + the real
 * Motive list (see `services/resourceLinks/vehicleBridgeSummary`). The page only
 * renders this when the Vehicle-Links surface flag is on and at least one of the
 * two apps is connected, so it never advertises a relationship the account can't
 * act on. Colors come from the shell's semantic tokens (`primary` = the design's
 * sky accent under `data-app-surface="dark"`), so it themes correctly.
 */

/** Cap the meter so a large fleet renders a readable strip, not hundreds of ticks. */
const METER_MAX_SEGMENTS = 30;

export type AppsBridgeView =
  | {
      readonly kind: "paired";
      readonly pairedCount: number;
      readonly unpairedCount: number;
      readonly totalCount: number;
      /** Motive list loaded cleanly ⇒ unpaired/total are trustworthy. */
      readonly motiveOk: boolean;
      readonly partialInventory: boolean;
      readonly vehicleLinksHref: string;
    }
  | {
      readonly kind: "connect";
      /** Which side still needs connecting to unlock pairing. */
      readonly missing: "motive" | "fleetio";
      /** Existing `?highlight=` deep link that rings the missing app's card. */
      readonly highlightHref: string;
    };

interface Props {
  view: AppsBridgeView;
}

export function AppsBridge({ view }: Props) {
  return (
    <section
      data-testid="apps-bridge"
      data-kind={view.kind}
      aria-label="Motive and Fleetio vehicle links"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-primary/5 px-4 py-2.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
          Bridge
        </span>
        <span className="text-xs text-muted-foreground">
          {view.kind === "paired"
            ? "Motive ⇄ Fleetio · these two apps describe the same trucks"
            : "Two apps, one fleet — available once both are connected"}
        </span>
      </div>

      {view.kind === "paired" ? (
        <PairedBody view={view} />
      ) : (
        <ConnectBody view={view} />
      )}
    </section>
  );
}

function PairedBody({ view }: { view: Extract<AppsBridgeView, { kind: "paired" }> }) {
  const { pairedCount, unpairedCount, totalCount, motiveOk, partialInventory } = view;
  const allPaired = motiveOk && totalCount > 0 && unpairedCount === 0;

  const headline = !motiveOk
    ? `${pairedCount} truck${pairedCount === 1 ? "" : "s"} paired`
    : totalCount === 0
      ? "No trucks paired yet"
      : allPaired
        ? `All ${totalCount} truck${totalCount === 1 ? "" : "s"} are paired`
        : `${pairedCount} of ${totalCount} truck${totalCount === 1 ? "" : "s"} paired`;

  const ctaLabel =
    motiveOk && unpairedCount > 0
      ? `Pair ${unpairedCount} truck${unpairedCount === 1 ? "" : "s"}`
      : allPaired
        ? "Review pairings"
        : "Open vehicle links";

  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-4">
      <BridgePair />
      <div className="min-w-0 flex-1">
        <p data-testid="apps-bridge-headline" className="text-sm font-semibold text-foreground">
          {headline}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {motiveOk && unpairedCount > 0 ? (
            <>
              <span className="font-medium text-foreground">
                {unpairedCount} truck{unpairedCount === 1 ? "" : "s"}
              </span>{" "}
              no automation can reach yet — pair them once and every workflow
              resolves the right Fleetio vehicle on its own.
            </>
          ) : allPaired ? (
            <>Automations resolve the right Fleetio vehicle on their own.</>
          ) : (
            <>
              Pair each Motive truck with its Fleetio vehicle once, so one workflow
              covers the whole fleet instead of one per truck.
            </>
          )}
          {partialInventory && (
            <>
              {" "}
              <span className="text-warning-foreground">
                Showing the first page of Motive vehicles.
              </span>
            </>
          )}
        </p>
        {motiveOk && totalCount > 0 && (
          <Meter paired={pairedCount} total={totalCount} />
        )}
      </div>
      <Link
        href={view.vehicleLinksHref}
        data-testid="apps-bridge-cta"
        className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

function ConnectBody({ view }: { view: Extract<AppsBridgeView, { kind: "connect" }> }) {
  const missingName = view.missing === "fleetio" ? "Fleetio" : "Motive";
  const connectedName = view.missing === "fleetio" ? "Motive" : "Fleetio";
  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-4">
      <BridgePair dim={view.missing} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          Pair your fleet across Motive and Fleetio
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {connectedName} is connected. Connect {missingName} and ChainReact can
          propose which records are the same truck, so one automation covers the
          whole fleet.
        </p>
      </div>
      <Link
        href={view.highlightHref}
        data-testid="apps-bridge-cta"
        className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Connect {missingName}
      </Link>
    </div>
  );
}

/** Motive ⇄ Fleetio icon pair. `dim` greys the not-yet-connected side. */
function BridgePair({ dim }: { dim?: "motive" | "fleetio" }) {
  return (
    <span className="flex shrink-0 items-center gap-2" aria-hidden>
      <BridgeIcon id="motive" dim={dim === "motive"} />
      <span className="text-muted-foreground">⇄</span>
      <BridgeIcon id="fleetio" dim={dim === "fleetio"} />
    </span>
  );
}

function BridgeIcon({ id, dim }: { id: "motive" | "fleetio"; dim?: boolean }) {
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-border bg-card ${
        dim ? "opacity-40 grayscale" : ""
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/integrations/${id}.svg`} alt="" width={18} height={18} className="h-[18px] w-[18px]" />
    </span>
  );
}

/** Progress strip: `paired` filled segments, the remainder hollow. */
function Meter({ paired, total }: { paired: number; total: number }) {
  const segments = Math.min(total, METER_MAX_SEGMENTS);
  const filled = total === 0 ? 0 : Math.round((paired / total) * segments);
  return (
    <span
      className="mt-2.5 flex max-w-sm gap-[3px]"
      role="img"
      aria-label={`${paired} of ${total} paired`}
    >
      {Array.from({ length: segments }).map((_, i) => (
        <span
          key={i}
          className={`h-1 flex-1 rounded-full ${i < filled ? "bg-success" : "bg-border"}`}
        />
      ))}
    </span>
  );
}
