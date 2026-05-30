import type { AppCatalogItem } from "@/contracts/apps";

/**
 * Stat cards for the Apps dashboard (Slice 4.APPS-PAGE-1).
 *
 * Three truthful metrics derived from the already-fetched catalog — no extra
 * fetch. The design ships four cards including "Powering N workflows" + a
 * health-driven "Need attention" tile; both are deferred until the
 * workflow↔integration linkage and health field surface into this DTO.
 *
 * Copy stays generic — counts of providers + counts of accounts — never
 * implies a time bucket (lifetime aggregates we don't yet have).
 */
interface Props {
  items: readonly AppCatalogItem[];
}

export function AppsStatCards({ items }: Props) {
  const totalProviders = items.length;
  const connectedProviders = items.filter((i) => i.isConnected).length;
  const totalAccounts = items.reduce((sum, i) => sum + i.accounts.length, 0);
  const categories = new Set(items.map((i) => i.category));

  return (
    <ul
      data-testid="apps-stat-cards"
      className="grid grid-cols-2 gap-3 md:grid-cols-3"
    >
      <StatCard
        testId="apps-stat-available"
        label="Apps available"
        value={totalProviders.toLocaleString()}
        sub={`Across ${categories.size} categories`}
      />
      <StatCard
        testId="apps-stat-connected"
        label="Connected"
        value={connectedProviders.toLocaleString()}
        sub={
          totalAccounts === 0
            ? "No accounts yet"
            : `Across ${totalAccounts.toLocaleString()} account${totalAccounts === 1 ? "" : "s"}`
        }
      />
      <StatCard
        testId="apps-stat-accounts"
        label="Total accounts"
        value={totalAccounts.toLocaleString()}
        sub={
          totalAccounts === 0
            ? "Connect your first app"
            : "Active across all providers"
        }
      />
    </ul>
  );
}

function StatCard({
  testId,
  label,
  value,
  sub,
}: {
  testId: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <li
      data-testid={testId}
      className="flex flex-col gap-1 rounded-md border border-border bg-card p-4"
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold text-foreground">{value}</span>
      <span className="text-[11px] text-muted-foreground">{sub}</span>
    </li>
  );
}
