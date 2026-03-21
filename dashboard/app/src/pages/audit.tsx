import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Download, ArrowLeft, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangToggle } from "@/components/lang-toggle";
import { useAuditLogs } from "@/api/queries";
import { api } from "@/api/client";
import { clearSpace, getActiveSpaceId, maskSpaceId } from "@/lib/session";

export function AuditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const spaceId = getActiveSpaceId() ?? "";
  const auditQuery = useAuditLogs(spaceId, 200);

  useEffect(() => {
    if (!spaceId) {
      navigate({ to: "/", replace: true });
    }
  }, [navigate, spaceId]);

  if (!spaceId) return null;

  function disconnect() {
    clearSpace();
    navigate({ to: "/", replace: true });
  }

  async function handleExport(format: "csv" | "json") {
    try {
      const blob = await api.exportAuditLogs(spaceId, format);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `mem9-audit-${new Date().toISOString().slice(0, 10)}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(t("audit.export_success", { format: format.toUpperCase() }));
    } catch {
      toast.error(t("error.api"));
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-nav-bg backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate({ to: "/space" })}>
              <ArrowLeft className="size-4" />
            </Button>
            <img src="/your-memory/mem9-logo.svg" alt="mem9" className="h-5 w-auto dark:invert" />
            <span className="hidden text-sm font-semibold text-foreground sm:inline">
              {t("audit.title")}
            </span>
            <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs text-soft-foreground">
              {maskSpaceId(spaceId)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LangToggle />
            <Button variant="ghost" size="icon-sm" onClick={disconnect} title={t("space.disconnect")}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.05em] text-foreground">
              {t("audit.title")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("audit.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => handleExport("csv")}>
              <Download className="mr-2 size-4" />
              {t("audit.export_csv")}
            </Button>
            <Button onClick={() => handleExport("json")}>
              <Download className="mr-2 size-4" />
              {t("audit.export_json")}
            </Button>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-foreground/8 bg-background/80">
          <div className="grid grid-cols-[180px_120px_1fr_100px] gap-3 border-b border-foreground/8 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <span>{t("audit.columns.time")}</span>
            <span>{t("audit.columns.actor")}</span>
            <span>{t("audit.columns.action")}</span>
            <span>{t("audit.columns.status")}</span>
          </div>

          <div className="divide-y divide-foreground/6">
            {(auditQuery.data?.logs ?? []).map((log) => (
              <div key={log.id} className="grid grid-cols-[180px_120px_1fr_100px] gap-3 px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  {new Date(log.ts).toLocaleString()}
                </span>
                <span className="truncate text-foreground">{log.actor}</span>
                <div className="min-w-0">
                  <div className="truncate text-foreground">{log.action}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {log.method} {log.path}
                  </div>
                </div>
                <span className="text-muted-foreground">{log.status_code}</span>
              </div>
            ))}
            {!auditQuery.isLoading && (auditQuery.data?.logs.length ?? 0) === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                {t("audit.empty")}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
