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

type OpenPosition = {
  id: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  currentPrice: number;
  size: number;
  notional: number;
  stopLoss: number;
  takeProfit: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  thesis: string;
  openedAt: string;
};

type StatusPayload = {
  ok: boolean;
  portfolio: {
    totalEquity: number;
    totalPnl: number;
    totalPnlPct: number;
    drawdownPct: number;
    status: string;
    mode: string;
    cash: number;
    positions: OpenPosition[];
  };
  alerts: string[];
};

export default function CapitalPage() {
  const [metrics, setMetrics] = useState<CapitalMetrics | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);

  const refresh = async () => {
    const [metricsRes, statusRes] = await Promise.all([
      fetch("/api/capital"),
      fetch("/api/capital", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      }),
    ]);
    if (metricsRes.ok) setMetrics((await metricsRes.json()) as CapitalMetrics);
    if (statusRes.ok) setStatus((await statusRes.json()) as StatusPayload);
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
        <h2 className="m-0 text-lg font-semibold text-slate-100">Open Positions</h2>
        <div className="mt-3 space-y-2">
          {status?.portfolio?.positions?.length ? (
            status.portfolio.positions.map((pos) => (
              <div key={pos.id} className="panel-soft px-3 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-100">{pos.symbol} • {pos.side}</span>
                  <span className={pos.unrealizedPnl >= 0 ? "text-emerald-300" : "text-rose-300"}>
                    {pos.unrealizedPnl >= 0 ? "+" : ""}${pos.unrealizedPnl.toFixed(2)} ({pos.unrealizedPnlPct.toFixed(2)}%)
                  </span>
                </div>
                <p className="m-0 mt-1 text-xs text-slate-400">
                  Entry ${pos.entryPrice.toFixed(2)} • Now ${pos.currentPrice.toFixed(2)} • SL ${pos.stopLoss.toFixed(2)} • TP ${pos.takeProfit.toFixed(2)}
                </p>
              </div>
            ))
          ) : (
            <div className="panel-soft p-3 text-sm text-slate-400">No open positions.</div>
          )}
        </div>
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
