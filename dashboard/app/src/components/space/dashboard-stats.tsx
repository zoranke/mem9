import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/types/dashboard";

const PIE_COLORS = [
  "#255cff",
  "#0aa678",
  "#f59e0b",
  "#ef4444",
  "#7c3aed",
  "#14b8a6",
];

function buildPieGradient(stats: DashboardStats | undefined): string {
  if (!stats || stats.agent_distribution.length === 0) {
    return "conic-gradient(#d4d4d8 0deg, #d4d4d8 360deg)";
  }

  let current = 0;
  const stops = stats.agent_distribution.slice(0, 6).map((item, index) => {
    const start = current;
    const sweep = item.ratio * 360;
    current += sweep;
    return `${PIE_COLORS[index % PIE_COLORS.length]} ${start}deg ${current}deg`;
  });

  if (current < 360) {
    stops.push(`#e5e7eb ${current}deg 360deg`);
  }

  return `conic-gradient(${stops.join(", ")})`;
}

export function DashboardStatsSection({
  stats,
  loading,
}: {
  stats: DashboardStats | undefined;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const chartBackground = useMemo(() => buildPieGradient(stats), [stats]);

  return (
    <section className="surface-card mt-5 rounded-3xl px-4 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-3 border-b border-foreground/6 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ring">
            {t("dashboard_stats.eyebrow")}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.05em] text-foreground">
            {t("dashboard_stats.title")}
          </h2>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_320px]">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-foreground/8 bg-background/70 px-4 py-4">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {loading ? "..." : stats?.total ?? 0}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("dashboard_stats.total")}
            </div>
          </div>
          <div className="rounded-2xl border border-foreground/8 bg-background/70 px-4 py-4">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {loading ? "..." : stats?.today_added ?? 0}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("dashboard_stats.today_added")}
            </div>
          </div>
          <div className="rounded-2xl border border-foreground/8 bg-background/70 px-4 py-4">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {loading ? "..." : stats?.agent_distribution.length ?? 0}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("dashboard_stats.agent_count")}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-foreground/8 bg-background/70 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-foreground">
                {t("dashboard_stats.agent_distribution")}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t("dashboard_stats.agent_distribution_hint")}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <div
              className={cn(
                "relative h-32 w-32 shrink-0 rounded-full border border-foreground/8",
                loading && "animate-pulse",
              )}
              style={{ background: chartBackground }}
            >
              <div className="absolute inset-[22%] rounded-full bg-background/95" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              {(stats?.agent_distribution.slice(0, 6) ?? []).map((item, index) => (
                <div key={item.agent_id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                    />
                    <span className="truncate text-foreground">{item.agent_id}</span>
                  </div>
                  <span className="shrink-0 text-muted-foreground">{item.count}</span>
                </div>
              ))}
              {!loading && (!stats || stats.agent_distribution.length === 0) ? (
                <div className="text-sm text-muted-foreground">
                  {t("dashboard_stats.empty")}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
