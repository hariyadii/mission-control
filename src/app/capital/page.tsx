"use client";
import { useEffect, useState } from "react";
import { FreshnessIndicator, StatusBadge, PageHeader, SectionCard, MetricCard } from "@/components/ui";

type CapitalMetrics = {
  ok: boolean;
  portfolio: {
    totalEquity:    number;
    totalPnl:       number;
    totalPnlPct:    number;
    drawdownPct:    number;
    status:         string;
    mode:           string;
    strategyPhase:  string;
    openPositions:  number;
    closedTrades:   number;
  };
  stats: {
    wins:        number;
    losses:      number;
    winRate:     number | null;
    avgWin:      number;
    avgLoss:     number;
    expectancy:  number | null;
  };
  bySymbol:     Record<string, { trades: number; pnl: number }>;
  recentTrades: Array<{
    id:              string;
    symbol:          string;
    side:            "long" | "short";
    realizedPnl:     number;
    realizedPnlPct:  number;
    closedAt:        string;
    exitReason:      string;
  }>;
};

type OpenPosition = {
  id:               string;
  symbol:           string;
  side:             "long" | "short";
  entryPrice:       number;
  currentPrice:     number;
  size:             number;
  notional:         number;
  stopLoss:         number;
  takeProfit:       number;
  unrealizedPnl:    number;
  unrealizedPnlPct: number;
  thesis:           string;
  openedAt:         string;
};

type StatusPayload = {
  ok: boolean;
  portfolio: {
    totalEquity: number;
    totalPnl:    number;
    totalPnlPct: number;
    drawdownPct: number;
    status:      string;
    mode:        string;
    cash:        number;
    positions:   OpenPosition[];
  };
  alerts: string[];
};

export default function CapitalPage() {
  const [metrics,    setMetrics]    = useState<CapitalMetrics | null>(null);
  const [status,     setStatus]     = useState<StatusPayload | null>(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const refresh = async () => {
    const [mRes, sRes] = await Promise.all([
      fetch("/api/capital"),
      fetch("/api/capital", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      }),
    ]);
    if (mRes.ok) setMetrics((await mRes.json()) as CapitalMetrics);
    if (sRes.ok) setStatus((await sRes.json()) as StatusPayload);
    setLastUpdate(Date.now());
  };

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 20_000);
    return () => clearInterval(id);
  }, []);

  const p = metrics?.portfolio;
  const pnlPositive = p ? p.totalPnl >= 0 : null;

  return (
    <div className="flex flex-col gap-4 page-enter">
      <PageHeader
        title="Capital"
        subtitle="Lyra portfolio & trades"
        right={
          <>
            <FreshnessIndicator lastUpdate={lastUpdate} />
            <StatusBadge status={p?.mode || "paper"} size="xs" />
          </>
        }
      />

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MetricCard label="Equity"    value={p ? `$${(p.totalEquity / 1000).toFixed(1)}k` : "—"} accent="emerald" />
        <MetricCard
          label="PnL"
          value={p ? `${p.totalPnl >= 0 ? "+" : ""}${p.totalPnlPct.toFixed(1)}%` : "—"}
          trend={pnlPositive === null ? undefined : pnlPositive ? "up" : "down"}
          accent={pnlPositive === null ? undefined : pnlPositive ? "emerald" : "rose"}
        />
        <MetricCard label="Drawdown"  value={p ? `${p.drawdownPct.toFixed(1)}%` : "—"} accent="amber" />
        <MetricCard label="Positions" value={status?.portfolio?.positions?.length ?? "—"} />
      </div>

      {/* Strategy Stats */}
      <SectionCard title="Strategy Stats">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          {[
            { label: "Wins",       value: metrics?.stats.wins      ?? "—",  color: "text-stone-700" },
            { label: "Losses",     value: metrics?.stats.losses    ?? "—",  color: "text-stone-700" },
            { label: "Win Rate",   value: metrics?.stats.winRate != null ? `${(metrics.stats.winRate * 100).toFixed(0)}%` : "—", color: "text-emerald-400" },
            { label: "Avg Win",    value: metrics?.stats.avgWin    != null ? `$${metrics.stats.avgWin.toFixed(0)}` : "—", color: "text-stone-700" },
            { label: "Avg Loss",   value: metrics?.stats.avgLoss   != null ? `$${metrics.stats.avgLoss.toFixed(0)}` : "—", color: "text-stone-700" },
            { label: "Expectancy", value: metrics?.stats.expectancy != null ? `$${metrics.stats.expectancy.toFixed(0)}` : "—", color: "text-cyan-400" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-[9px] text-stone-500 uppercase tracking-wider mb-0.5">{s.label}</p>
              <p className={`font-semibold ${s.color}`}>{String(s.value)}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Positions */}
      <SectionCard
        title="Open Positions"
        badge={<span className="text-[9px] text-stone-500">{status?.portfolio?.positions?.length ?? 0} open</span>}
      >
        <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
          {status?.portfolio?.positions?.length ? (
            status.portfolio.positions.map((pos) => (
              <div key={pos.id} className="panel-soft px-3 py-2 text-xs">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-stone-700 font-semibold">
                    {pos.symbol}{" "}
                    <span className="font-normal text-stone-500">{pos.side}</span>
                  </span>
                  <span className={pos.unrealizedPnl >= 0 ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                    {pos.unrealizedPnl >= 0 ? "+" : ""}{pos.unrealizedPnlPct.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-[10px] text-stone-500 min-w-0">
                  <span className="truncate">${pos.entryPrice.toFixed(2)} → ${pos.currentPrice.toFixed(2)}</span>
                  <span className="shrink-0">SL {pos.stopLoss} · TP {pos.takeProfit}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-stone-500 text-center py-4">No open positions</p>
          )}
        </div>
      </SectionCard>

      {/* Recent Trades */}
      <SectionCard title="Recent Trades">
        <div className="space-y-0 max-h-[160px] overflow-y-auto">
          {metrics?.recentTrades?.length ? (
            metrics.recentTrades.slice(0, 10).map((t) => (
              <div key={t.id} className="flex items-center justify-between py-1.5 text-xs border-b border-stone-200/50 last:border-0">
                <span className="text-stone-600">{t.symbol} <span className="text-stone-500">{t.side}</span></span>
                <span className={t.realizedPnl >= 0 ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                  {t.realizedPnl >= 0 ? "+" : ""}${t.realizedPnl.toFixed(0)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-stone-500 text-center py-4">No closed trades</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
