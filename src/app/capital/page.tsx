"use client";

import { useEffect, useState } from "react";

type CapitalMetrics = {
  ok: boolean;
  portfolio: {
    totalEquity: number;
    totalPnl: number;
    totalPnlPct: number;
    drawdownPct: number;
    status: string;
    mode: string;
    strategyPhase: string;
    openPositions: number;
    closedTrades: number;
  };
  stats: {
    wins: number;
    losses: number;
    winRate: number | null;
    avgWin: number;
    avgLoss: number;
    expectancy: number | null;
  };
  bySymbol: Record<string, { trades: number; pnl: number }>;
  recentTrades: Array<{
    id: string;
    symbol: string;
    side: "long" | "short";
    realizedPnl: number;
    realizedPnlPct: number;
    closedAt: string;
    exitReason: string;
  }>;
};

export default function CapitalPage() {
  const [metrics, setMetrics] = useState<CapitalMetrics | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/capital");
    if (!res.ok) return;
    setMetrics((await res.json()) as CapitalMetrics);
  };

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 20000);
    return () => clearInterval(id);
  }, []);

  const p = metrics?.portfolio;

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Capital Lane</h1>
          <p className="page-subtitle">Lyra's paper portfolio, performance, and strategy health.</p>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Equity", value: p ? `$${p.totalEquity.toLocaleString()}` : "..." },
          { label: "PnL", value: p ? `${p.totalPnl >= 0 ? "+" : ""}$${p.totalPnl.toFixed(2)} (${p.totalPnlPct.toFixed(2)}%)` : "..." },
          { label: "Drawdown", value: p ? `${p.drawdownPct.toFixed(2)}%` : "..." },
          { label: "Mode", value: p ? `${p.mode} • ${p.status}` : "..." },
        ].map((item) => (
          <div key={item.label} className="panel-glass p-5">
            <p className="m-0 text-xs uppercase tracking-[0.18em] text-slate-300">{item.label}</p>
            <p className="m-0 mt-2 text-xl font-semibold text-slate-100">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="panel-glass p-5">
          <h2 className="m-0 text-lg font-semibold text-slate-100">Strategy Stats</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <p className="m-0">Wins: {metrics?.stats.wins ?? "..."}</p>
            <p className="m-0">Losses: {metrics?.stats.losses ?? "..."}</p>
            <p className="m-0">Win Rate: {metrics?.stats.winRate != null ? `${(metrics.stats.winRate * 100).toFixed(1)}%` : "n/a"}</p>
            <p className="m-0">Avg Win: ${metrics?.stats.avgWin?.toFixed?.(2) ?? "0.00"}</p>
            <p className="m-0">Avg Loss: ${metrics?.stats.avgLoss?.toFixed?.(2) ?? "0.00"}</p>
            <p className="m-0">Expectancy: {metrics?.stats.expectancy != null ? `$${metrics.stats.expectancy.toFixed(2)}` : "n/a"}</p>
          </div>
        </article>

        <article className="panel-glass p-5">
          <h2 className="m-0 text-lg font-semibold text-slate-100">Symbols</h2>
          <div className="mt-3 space-y-2">
            {metrics && Object.keys(metrics.bySymbol).length > 0 ? (
              Object.entries(metrics.bySymbol).map(([sym, data]) => (
                <div key={sym} className="panel-soft flex items-center justify-between px-3 py-2 text-sm">
                  <span>{sym}</span>
                  <span>{data.trades} trades • {data.pnl >= 0 ? "+" : ""}${data.pnl.toFixed(2)}</span>
                </div>
              ))
            ) : (
              <div className="panel-soft p-3 text-sm text-slate-400">No symbol history yet.</div>
            )}
          </div>
        </article>
      </section>

      <section className="panel-glass p-5">
        <h2 className="m-0 text-lg font-semibold text-slate-100">Recent Trades</h2>
        <div className="mt-3 space-y-2">
          {metrics?.recentTrades?.length ? (
            metrics.recentTrades.map((t) => (
              <div key={t.id} className="panel-soft flex items-center justify-between px-3 py-2 text-sm">
                <span>{t.symbol} • {t.side}</span>
                <span>{t.realizedPnl >= 0 ? "+" : ""}${t.realizedPnl.toFixed(2)} ({t.realizedPnlPct.toFixed(2)}%)</span>
              </div>
            ))
          ) : (
            <div className="panel-soft p-3 text-sm text-slate-400">No closed trades yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
